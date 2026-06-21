import type { Request } from "express";
import type { UserPlan } from "./user.types";

export type JwtTokenType = "access" | "refresh";

export interface JwtUserIdentity {
    id: string;
    githubId: string;
}

export interface AccessTokenPayload {
    sub: string;
    githubId: string;
    tokenType: "access";
    iat?: number;
    exp?: number;
    iss?: string;
    aud?: string | string[];
}

export interface RefreshTokenPayload {
    sub: string;
    githubId: string;
    tokenType: "refresh";
    jti: string;
    iat?: number;
    exp: number;
    iss?: string;
    aud?: string | string[];
}

export interface IssuedRefreshToken {
    token: string;
    tokenId: string;
    expiresAt: Date;
}

export interface GithubOAuthProfile {
    githubId: string;
    username: string;
    email: string;
    avatarUrl?: string;
}

export interface AuthenticatedUser {
    id: string;
    githubId: string;
    username: string;
    email: string;
    avatarUrl?: string;
    plan: UserPlan;
    analysisCredits: number;
}

export interface RefreshTokenMetadata {
    ipAddress?: string;
    userAgent?: string;
}

export interface AuthSession {
    accessToken: string;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    user: AuthenticatedUser;
}

export interface AuthenticatedAccessContext {
    payload: AccessTokenPayload;
    user: AuthenticatedUser;
}

export interface AuthenticatedRequest extends Request {
    auth: AccessTokenPayload;
    user: AuthenticatedUser;
}

declare global {
    namespace Express {
        interface User extends AuthenticatedUser {}

        interface Request {
            auth?: AccessTokenPayload;
        }
    }
}
