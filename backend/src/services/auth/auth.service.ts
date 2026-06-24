import { UserDAO } from "../../dao/UserDAO";
import type { UserRecord } from "../../types/user.types";
import type {
    AuthenticatedAccessContext,
    AuthenticatedUser,
    AuthSession,
    GithubOAuthProfile,
    JwtUserIdentity,
    LoginRequest,
    RefreshTokenMetadata,
    RegisterRequest,
} from "../../types/auth.types";
import { ApiError } from "../../utils/apiError";
import {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
} from "../../utils/jwt";
import { comparePassword, hashPassword } from "../../utils/password";

const MONGO_DUPLICATE_KEY_CODE = 11000;
const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const normalizeEmail = (email: string): string => {
    return email.trim().toLowerCase();
};

const normalizeUsername = (username: string): string => {
    return username.trim();
};

const isDuplicateKeyError = (error: unknown): error is { code: number } => {
    return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === MONGO_DUPLICATE_KEY_CODE;
};

const isValidMongoObjectId = (value: string): boolean => {
    return MONGO_OBJECT_ID_PATTERN.test(value);
};

const toAuthenticatedUser = (user: UserRecord): AuthenticatedUser => {
    return {
        id: user.id,
        githubId: user.githubId,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        plan: user.plan,
        analysisCredits: user.analysisCredits,
    };
};

const toJwtIdentity = (user: UserRecord): JwtUserIdentity => {
    return {
        id: user.id,
        email: user.email,
        githubId: user.githubId,
    };
};

/**
 * Coordinates credential auth, GitHub auth, refresh-token rotation, and logout.
 */
export class AuthService {
    /**
     * Registers a new email/password user and creates an authenticated session.
     *
     * Purpose: allow users without GitHub accounts to create DevDoctor accounts.
     * Business logic: normalizes email, rejects duplicate accounts, hashes the
     * password with bcrypt, creates the user, issues JWT tokens, and stores only
     * the refresh-token hash in MongoDB.
     * Parameters: validated registration DTO and optional request metadata.
     * Return value: access token, refresh token for the cookie layer, refresh
     * expiry, and safe user profile.
     *
     * @param payload Validated registration request body.
     * @param _metadata Optional request metadata reserved for audit expansion.
     * @returns Newly authenticated registration session.
     */
    public async register(payload: RegisterRequest, _metadata?: RefreshTokenMetadata): Promise<AuthSession> {
        const email = normalizeEmail(payload.email);
        const existingUser = await UserDAO.userExistsByEmail(email);

        if (existingUser) {
            throw ApiError.badRequest("Email is already registered");
        }

        const password = await hashPassword(payload.password);

        try {
            const user = await UserDAO.createUser({
                username: normalizeUsername(payload.username),
                email,
                password,
                plan: "free",
                analysisCredits: 5,
            });

            return await this.createAuthSession(user);
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw ApiError.badRequest("Email is already registered");
            }

            throw error;
        }
    }

    /**
     * Authenticates an email/password user and creates a new session.
     *
     * Purpose: exchange valid credentials for a short-lived access token and a
     * rotated refresh cookie.
     * Business logic: selects the password hash explicitly, compares it with
     * bcrypt, avoids account-existence leaks with a generic error, and replaces
     * the stored refresh-token hash.
     * Parameters: validated login DTO and optional request metadata.
     * Return value: access token, refresh token for the cookie layer, refresh
     * expiry, and safe user profile.
     *
     * @param payload Validated login request body.
     * @param _metadata Optional request metadata reserved for audit expansion.
     * @returns Authenticated login session.
     */
    public async login(payload: LoginRequest, _metadata?: RefreshTokenMetadata): Promise<AuthSession> {
        const user = await UserDAO.findByEmailWithPassword(normalizeEmail(payload.email));

        if (!user?.password) {
            throw ApiError.unauthorized("Invalid email or password");
        }

        const passwordMatches = await comparePassword(payload.password, user.password);

        if (!passwordMatches) {
            throw ApiError.unauthorized("Invalid email or password");
        }

        return await this.createAuthSession(user);
    }

    /**
     * Authenticates a GitHub OAuth profile and creates a new session.
     *
     * Purpose: preserve GitHub OAuth while sharing the same JWT and refresh-token
     * storage model used by credential auth.
     * Business logic: finds by GitHub id, links an existing credential account
     * by email when safe, creates a GitHub-only user when needed, updates profile
     * fields, issues tokens, and replaces the stored refresh-token hash.
     * Parameters: normalized GitHub profile and optional request metadata.
     * Return value: access token, refresh token for the cookie layer, refresh
     * expiry, and safe user profile.
     *
     * @param profile Normalized GitHub OAuth profile from Passport.
     * @param _metadata Optional request metadata reserved for audit expansion.
     * @returns Authenticated GitHub OAuth session.
     */
    public async githubLogin(profile: GithubOAuthProfile, _metadata?: RefreshTokenMetadata): Promise<AuthSession> {
        const email = normalizeEmail(profile.email);

        try {
            let user = await UserDAO.findByGitHubId(profile.githubId);

            if (user) {
                const updatedUser = await UserDAO.updateGitHubProfile(user.id, {
                    email,
                    username: normalizeUsername(profile.username),
                    avatarUrl: profile.avatarUrl,
                });

                if (!updatedUser) {
                    throw ApiError.internal("Unable to update GitHub user profile");
                }

                return await this.createAuthSession(updatedUser);
            }

            user = await UserDAO.findByEmail(email);

            if (user) {
                if (user.githubId && user.githubId !== profile.githubId) {
                    throw ApiError.badRequest("Email is already linked to another GitHub account");
                }

                const linkedUser = await UserDAO.linkGitHubAccount(user.id, {
                    githubId: profile.githubId,
                    avatarUrl: profile.avatarUrl,
                });

                if (!linkedUser) {
                    throw ApiError.internal("Unable to link GitHub account");
                }

                return await this.createAuthSession(linkedUser);
            }

            user = await UserDAO.createGitHubUser({
                githubId: profile.githubId,
                username: normalizeUsername(profile.username),
                email,
                avatarUrl: profile.avatarUrl,
                plan: "free",
                analysisCredits: 5,
            });

            return await this.createAuthSession(user);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            if (isDuplicateKeyError(error)) {
                throw ApiError.badRequest("Email is already registered");
            }

            throw error;
        }
    }

    /**
     * Rotates a refresh token and returns a renewed session.
     *
     * Purpose: continue an authenticated session without repeating login or
     * OAuth while limiting replay damage.
     * Business logic: validates the refresh JWT, compares its hash with the
     * single stored hash, clears the hash on replay, atomically replaces it with
     * the new hash, and returns a fresh access token.
     * Parameters: raw refresh token from the HttpOnly cookie plus optional
     * request metadata.
     * Return value: new access token, new refresh token for the cookie layer,
     * refresh expiry, and safe user profile.
     *
     * @param refreshToken Raw refresh token from the HttpOnly cookie.
     * @param _metadata Optional request metadata reserved for audit expansion.
     * @returns Rotated authenticated session.
     */
    public async refreshSession(refreshToken: string, _metadata?: RefreshTokenMetadata): Promise<AuthSession> {
        const payload = verifyRefreshToken(refreshToken);

        if (!isValidMongoObjectId(payload.sub)) {
            throw ApiError.unauthorized("Invalid refresh token subject");
        }

        const incomingTokenHash = hashRefreshToken(refreshToken);
        const user = await UserDAO.findByIdWithRefreshToken(payload.sub);

        if (!user?.refreshTokenHash) {
            throw ApiError.unauthorized("Refresh token has been revoked");
        }

        if (user.refreshTokenHash !== incomingTokenHash) {
            await this.clearRefreshTokenHashForUser(user.id);
            throw ApiError.unauthorized("Refresh token has already been rotated");
        }

        const issuedRefreshToken = generateRefreshToken(toJwtIdentity(user));
        const nextRefreshTokenHash = hashRefreshToken(issuedRefreshToken.token);
        const updateResult = await UserDAO.updateRefreshTokenHash(
            payload.sub,
            incomingTokenHash,
            nextRefreshTokenHash
        );

        if (updateResult.modifiedCount !== 1) {
            await this.clearRefreshTokenHashForUser(user.id);
            throw ApiError.unauthorized("Refresh token has already been rotated");
        }

        return {
            accessToken: generateAccessToken(toJwtIdentity(user)),
            refreshToken: issuedRefreshToken.token,
            refreshTokenExpiresAt: issuedRefreshToken.expiresAt,
            user: toAuthenticatedUser(user),
        };
    }

    /**
     * Invalidates the active refresh token during logout.
     *
     * Purpose: ensure the current refresh cookie cannot mint future access
     * tokens after logout.
     * Business logic: hashes the presented token and unsets the matching stored
     * hash without revealing whether the token existed.
     * Parameters: raw refresh token from the HttpOnly cookie.
     * Return value: resolves after the idempotent invalidation attempt.
     *
     * @param refreshToken Raw refresh token from the HttpOnly cookie.
     * @returns Nothing when logout invalidation completes.
     */
    public async logout(refreshToken: string): Promise<void> {
        const refreshTokenHash = hashRefreshToken(refreshToken);
        await UserDAO.clearRefreshTokenHash(refreshTokenHash);
    }

    /**
     * Authenticates an access token for protected API routes.
     *
     * Purpose: convert a bearer token into the current DevDoctor user.
     * Business logic: validates JWT claims, rejects malformed subjects, reloads
     * the user from MongoDB, and rejects stale tokens after email changes.
     * Parameters: bearer access token from the Authorization header.
     * Return value: token payload plus safe authenticated user.
     *
     * @param accessToken Access token from the Authorization header.
     * @returns Authenticated request context.
     */
    public async getAuthenticatedUserFromAccessToken(accessToken: string): Promise<AuthenticatedAccessContext> {
        const payload = verifyAccessToken(accessToken);

        if (!isValidMongoObjectId(payload.sub)) {
            throw ApiError.unauthorized("Invalid access token subject");
        }

        const user = await UserDAO.findById(payload.sub);

        if (!user || user.email !== payload.email) {
            throw ApiError.unauthorized("Authenticated user no longer exists");
        }

        return {
            payload,
            user: toAuthenticatedUser(user),
        };
    }

    /**
     * Issues JWTs and persists the replacement refresh-token hash.
     *
     * Purpose: keep register, login, and GitHub OAuth on the same session
     * creation path.
     * Business logic: signs an access token and refresh token, stores only the
     * refresh hash, and returns an HTTP-safe session response.
     * Parameters: DAO-provided user record that should own the session.
     * Return value: access token, raw refresh token for cookie storage, refresh
     * expiry, and safe user profile.
     *
     * @param user DAO-provided user record that will receive the refresh hash.
     * @returns New authenticated session.
     */
    private async createAuthSession(user: UserRecord): Promise<AuthSession> {
        const identity = toJwtIdentity(user);
        const accessToken = generateAccessToken(identity);
        const issuedRefreshToken = generateRefreshToken(identity);

        const sessionWasStored = await UserDAO.setRefreshTokenHashByUserId(
            user.id,
            hashRefreshToken(issuedRefreshToken.token)
        );

        if (!sessionWasStored) {
            throw ApiError.internal("Unable to persist auth session");
        }

        return {
            accessToken,
            refreshToken: issuedRefreshToken.token,
            refreshTokenExpiresAt: issuedRefreshToken.expiresAt,
            user: toAuthenticatedUser(user),
        };
    }

    /**
     * Clears a user's refresh-token hash after replay or invalidation.
     *
     * Purpose: remove the active refresh-token allowlist entry when a suspicious
     * token condition is detected.
     * Business logic: validates the MongoDB id shape before issuing an unset so
     * malformed token subjects do not reach the database.
     * Parameters: string form of the user id from a verified token.
     * Return value: resolves after the clear operation is attempted.
     *
     * @param userId User id whose refresh hash should be removed.
     * @returns Nothing after the refresh hash is cleared or skipped.
     */
    private async clearRefreshTokenHashForUser(userId: string): Promise<void> {
        if (!isValidMongoObjectId(userId)) {
            return;
        }

        await UserDAO.clearRefreshTokenHashByUserId(userId);
    }
}

export const authService = new AuthService();
