import { Types } from "mongoose";
import { User } from "../../models/User.model";
import type { UserDocument, IRefreshToken } from "../../types/user.types";
import type {
    AuthenticatedAccessContext,
    AuthenticatedUser,
    AuthSession,
    GithubOAuthProfile,
    IssuedRefreshToken,
    JwtUserIdentity,
    RefreshTokenMetadata,
} from "../../types/auth.types";
import { ApiError } from "../../utils/apiError";
import {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
} from "../../utils/jwt";

const MAX_ACTIVE_REFRESH_TOKENS = 5;
const MONGO_DUPLICATE_KEY_CODE = 11000;

const toAuthenticatedUser = (user: UserDocument): AuthenticatedUser => {
    return {
        id: user._id.toString(),
        githubId: user.githubId,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        plan: user.plan,
        analysisCredits: user.analysisCredits,
    };
};

const toJwtIdentity = (user: UserDocument): JwtUserIdentity => {
    return {
        id: user._id.toString(),
        githubId: user.githubId,
    };
};

const isDuplicateKeyError = (error: unknown): error is { code: number } => {
    return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === MONGO_DUPLICATE_KEY_CODE;
};

const buildRefreshTokenRecord = (issuedToken: IssuedRefreshToken, metadata?: RefreshTokenMetadata): IRefreshToken => {
    return {
        tokenHash: hashRefreshToken(issuedToken.token),
        tokenId: issuedToken.tokenId,
        expiresAt: issuedToken.expiresAt,
        createdAt: new Date(),
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
    };
};

export class AuthService {
    /**
     * Finds or creates the local user that corresponds to a GitHub profile.
     *
     * Purpose: bridge Passport's provider profile to DevDoctor's domain user.
     * Business logic: upserts by immutable GitHub id, refreshes profile fields,
     * preserves product defaults, and converts database duplicate-key errors into
     * a controlled API error.
     * Parameters: normalized GitHub OAuth profile from the Passport strategy.
     * Return value: safe authenticated user shape for Passport and controllers.
     *
     * @param profile Normalized GitHub profile data.
     * @returns Authenticated user safe to attach to the request.
     */
    public async findOrCreateGithubUser(profile: GithubOAuthProfile): Promise<AuthenticatedUser> {
        try {
            const user = await User.findOneAndUpdate(
                { githubId: profile.githubId },
                {
                    $set: {
                        username: profile.username,
                        email: profile.email,
                        avatarUrl: profile.avatarUrl,
                    },
                    $setOnInsert: {
                        plan: "free",
                        analysisCredits: 5,
                        refreshTokens: [],
                    },
                },
                {
                    new: true,
                    runValidators: true,
                    setDefaultsOnInsert: true,
                    upsert: true,
                }
            );

            if (!user) {
                throw ApiError.internal("Unable to create GitHub user");
            }

            return toAuthenticatedUser(user);
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw ApiError.badRequest("This GitHub email is already linked to another account");
            }

            throw error;
        }
    }

    /**
     * Creates a new authenticated session after OAuth succeeds.
     *
     * Purpose: issue the access token returned by the API and the refresh token
     * stored in the HttpOnly cookie.
     * Business logic: reloads the user from MongoDB, signs both tokens, hashes
     * and stores the refresh token, and limits active refresh sessions.
     * Parameters: authenticated user from Passport and optional request metadata.
     * Return value: session payload containing tokens and the safe user object.
     *
     * @param user Authenticated user produced by the GitHub strategy.
     * @param metadata Optional IP and user-agent metadata for auditability.
     * @returns New auth session.
     */
    public async createSession(user: AuthenticatedUser, metadata?: RefreshTokenMetadata): Promise<AuthSession> {
        const dbUser = await User.findById(user.id).select("+refreshTokens");

        if (!dbUser) {
            throw ApiError.unauthorized("Authenticated user no longer exists");
        }

        const identity = toJwtIdentity(dbUser);
        const accessToken = generateAccessToken(identity);
        const issuedRefreshToken = generateRefreshToken(identity);

        await this.storeRefreshToken(dbUser, issuedRefreshToken, metadata);

        return {
            accessToken,
            refreshToken: issuedRefreshToken.token,
            refreshTokenExpiresAt: issuedRefreshToken.expiresAt,
            user: toAuthenticatedUser(dbUser),
        };
    }

    /**
     * Rotates a refresh token and returns a new authenticated session.
     *
     * Purpose: continue a session without asking the user to repeat OAuth.
     * Business logic: validates the incoming JWT, verifies the hashed token is
     * still allowlisted in MongoDB, replaces it with a newly signed refresh token,
     * and revokes all tokens if a replayed token is detected.
     * Parameters: refresh token from the HttpOnly cookie plus request metadata.
     * Return value: new access token, new refresh token, expiry, and safe user.
     *
     * @param refreshToken Raw refresh token from the cookie.
     * @param metadata Optional IP and user-agent metadata for the new token.
     * @returns Rotated auth session.
     */
    public async refreshSession(refreshToken: string, metadata?: RefreshTokenMetadata): Promise<AuthSession> {
        const payload = verifyRefreshToken(refreshToken);

        if (!Types.ObjectId.isValid(payload.sub)) {
            throw ApiError.unauthorized("Invalid refresh token subject");
        }

        const incomingTokenHash = hashRefreshToken(refreshToken);
        const user = await User.findOne({
            _id: payload.sub,
            "refreshTokens.tokenHash": incomingTokenHash,
            "refreshTokens.tokenId": payload.jti,
        }).select("+refreshTokens");

        if (!user) {
            await this.revokeAllRefreshTokensForUser(payload.sub);
            throw ApiError.unauthorized("Refresh token has been revoked");
        }

        const now = new Date();
        const storedToken = user.refreshTokens.find((token) => token.tokenHash === incomingTokenHash && token.tokenId === payload.jti);

        if (!storedToken || storedToken.expiresAt <= now) {
            await this.removeRefreshTokenByHash(incomingTokenHash);
            throw ApiError.unauthorized("Refresh token has expired");
        }

        const identity = toJwtIdentity(user);
        const accessToken = generateAccessToken(identity);
        const issuedRefreshToken = generateRefreshToken(identity);
        const nextRefreshTokens = user.refreshTokens
            .filter((token) => token.tokenHash !== incomingTokenHash && token.expiresAt > now)
            .slice(-(MAX_ACTIVE_REFRESH_TOKENS - 1));

        nextRefreshTokens.push(buildRefreshTokenRecord(issuedRefreshToken, metadata));

        const updateResult = await User.updateOne(
            {
                _id: user._id,
                "refreshTokens.tokenHash": incomingTokenHash,
                "refreshTokens.tokenId": payload.jti,
            },
            {
                $set: {
                    refreshTokens: nextRefreshTokens,
                },
            }
        );

        if (updateResult.modifiedCount !== 1) {
            await this.revokeAllRefreshTokensForUser(user._id.toString());
            throw ApiError.unauthorized("Refresh token has already been rotated");
        }

        return {
            accessToken,
            refreshToken: issuedRefreshToken.token,
            refreshTokenExpiresAt: issuedRefreshToken.expiresAt,
            user: toAuthenticatedUser(user),
        };
    }

    /**
     * Invalidates a refresh token during logout.
     *
     * Purpose: remove the server-side allowlist entry so the cookie can no
     * longer mint access tokens.
     * Business logic: hashes the presented token and pulls the matching record;
     * the operation is idempotent to avoid leaking session state.
     * Parameters: raw refresh token from the HttpOnly cookie.
     * Return value: resolves after the database invalidation attempt completes.
     *
     * @param refreshToken Raw refresh token from the cookie.
     * @returns Nothing when logout invalidation completes.
     */
    public async logout(refreshToken: string): Promise<void> {
        await this.removeRefreshTokenByHash(hashRefreshToken(refreshToken));
    }

    /**
     * Authenticates an access token for protected API routes.
     *
     * Purpose: convert a bearer token into the current application user.
     * Business logic: verifies token claims, rejects malformed subjects, and
     * reloads the user so deleted or disabled accounts cannot keep using APIs.
     * Parameters: bearer access token from the Authorization header.
     * Return value: token payload plus safe authenticated user.
     *
     * @param accessToken Access token from the Authorization header.
     * @returns Authenticated request context.
     */
    public async getAuthenticatedUserFromAccessToken(accessToken: string): Promise<AuthenticatedAccessContext> {
        const payload = verifyAccessToken(accessToken);

        if (!Types.ObjectId.isValid(payload.sub)) {
            throw ApiError.unauthorized("Invalid access token subject");
        }

        const user = await User.findById(payload.sub);

        if (!user) {
            throw ApiError.unauthorized("Authenticated user no longer exists");
        }

        return {
            payload,
            user: toAuthenticatedUser(user),
        };
    }

    private async storeRefreshToken(user: UserDocument, issuedToken: IssuedRefreshToken, metadata?: RefreshTokenMetadata): Promise<void> {
        const now = new Date();
        const activeTokens = user.refreshTokens
            .filter((token) => token.expiresAt > now)
            .slice(-(MAX_ACTIVE_REFRESH_TOKENS - 1));

        activeTokens.push(buildRefreshTokenRecord(issuedToken, metadata));
        user.refreshTokens = activeTokens;

        await user.save();
    }

    private async removeRefreshTokenByHash(tokenHash: string): Promise<void> {
        await User.updateOne(
            { "refreshTokens.tokenHash": tokenHash },
            {
                $pull: {
                    refreshTokens: { tokenHash },
                },
            }
        );
    }

    private async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
        if (!Types.ObjectId.isValid(userId)) {
            return;
        }

        await User.updateOne(
            { _id: userId },
            {
                $set: {
                    refreshTokens: [],
                },
            }
        );
    }
}

export const authService = new AuthService();
