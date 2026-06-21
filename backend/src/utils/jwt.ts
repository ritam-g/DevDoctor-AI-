import { createHmac, randomUUID } from "crypto";
import jwt, { type Algorithm, type JwtPayload, type SignOptions, type VerifyOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type {
    AccessTokenPayload,
    IssuedRefreshToken,
    JwtTokenType,
    JwtUserIdentity,
    RefreshTokenPayload,
} from "../types/auth.types";
import { ApiError } from "./apiError";

const JWT_ALGORITHM: Algorithm = "HS256";
const JWT_ISSUER = "devdoctor-api";
const JWT_AUDIENCE = "devdoctor-client";

const accessTokenOptions: SignOptions = {
    algorithm: JWT_ALGORITHM,
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
    expiresIn: env.JWT_ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
};

const refreshTokenOptions: SignOptions = {
    algorithm: JWT_ALGORITHM,
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
    expiresIn: env.JWT_REFRESH_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
};

const verifyOptions: VerifyOptions = {
    algorithms: [JWT_ALGORITHM],
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
};

const isJwtPayload = (decoded: string | JwtPayload): decoded is JwtPayload => {
    return typeof decoded === "object" && decoded !== null;
};

const assertTokenPayload = (decoded: string | JwtPayload, expectedType: JwtTokenType): JwtPayload => {
    if (!isJwtPayload(decoded)) {
        throw ApiError.unauthorized("Invalid token payload");
    }

    if (decoded.tokenType !== expectedType || typeof decoded.sub !== "string" || typeof decoded.githubId !== "string") {
        throw ApiError.unauthorized("Invalid token payload");
    }

    if (expectedType === "refresh" && (typeof decoded.jti !== "string" || typeof decoded.exp !== "number")) {
        throw ApiError.unauthorized("Invalid refresh token payload");
    }

    return decoded;
};

/**
 * Generates a short-lived JWT access token.
 *
 * The access token authenticates API requests and deliberately remains
 * stateless so protected routes can validate it without database writes.
 *
 * @param identity User identity required for downstream authorization checks.
 * @returns Signed JWT access token.
 */
export const generateAccessToken = (identity: JwtUserIdentity): string => {
    return jwt.sign(
        {
            sub: identity.id,
            githubId: identity.githubId,
            tokenType: "access",
        },
        env.JWT_SECRET,
        accessTokenOptions
    );
};

/**
 * Generates a refresh token with a server-side token identifier.
 *
 * The refresh token is long-lived, stored only as a hash in MongoDB, and
 * rotated every time it is used to reduce replay risk.
 *
 * @param identity User identity that owns the refresh token.
 * @returns Refresh token details needed by the service and cookie layer.
 */
export const generateRefreshToken = (identity: JwtUserIdentity): IssuedRefreshToken => {
    const tokenId = randomUUID();
    const token = jwt.sign(
        {
            sub: identity.id,
            githubId: identity.githubId,
            tokenType: "refresh",
            jti: tokenId,
        },
        env.JWT_SECRET,
        refreshTokenOptions
    );

    return {
        token,
        tokenId,
        expiresAt: getJwtExpiresAt(token),
    };
};

/**
 * Verifies and parses a JWT access token.
 *
 * This function validates signature, issuer, audience, expiry, and the
 * expected access-token claim before a request is trusted.
 *
 * @param token Bearer token received from the Authorization header.
 * @returns Typed access token payload.
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET, verifyOptions);
        const payload = assertTokenPayload(decoded, "access");

        return payload as AccessTokenPayload;
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        throw ApiError.unauthorized("Invalid or expired access token");
    }
};

/**
 * Verifies and parses a JWT refresh token.
 *
 * Refresh-token verification is intentionally separate from access-token
 * verification so token-type confusion cannot authenticate protected routes.
 *
 * @param token Refresh token received from the HttpOnly cookie.
 * @returns Typed refresh token payload.
 */
export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET, verifyOptions);
        const payload = assertTokenPayload(decoded, "refresh");

        return payload as RefreshTokenPayload;
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        throw ApiError.unauthorized("Invalid or expired refresh token");
    }
};

/**
 * Hashes a refresh token before database storage or lookup.
 *
 * MongoDB stores only a keyed hash, which prevents a database leak from
 * becoming an immediate session replay event.
 *
 * @param token Raw refresh token issued to the client cookie.
 * @returns HMAC-SHA256 refresh token hash.
 */
export const hashRefreshToken = (token: string): string => {
    return createHmac("sha256", env.JWT_SECRET).update(token).digest("hex");
};

/**
 * Reads the expiration date from a signed JWT.
 *
 * The token is generated locally immediately before this helper is used, so
 * decoding is sufficient for deriving the cookie expiration timestamp.
 *
 * @param token JWT whose exp claim should be converted.
 * @returns Expiration date represented by the JWT exp claim.
 */
export const getJwtExpiresAt = (token: string): Date => {
    const decoded = jwt.decode(token);

    if (!decoded || typeof decoded === "string" || typeof decoded.exp !== "number") {
        throw ApiError.internal("Unable to determine JWT expiration");
    }

    return new Date(decoded.exp * 1000);
};
