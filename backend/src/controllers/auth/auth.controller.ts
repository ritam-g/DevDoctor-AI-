import type { CookieOptions, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { authService } from "../../services/auth/auth.service";
import type { RefreshTokenMetadata } from "../../types/auth.types";
import { ApiError } from "../../utils/apiError";

const REFRESH_TOKEN_COOKIE_NAME = "devdoctor_refresh_token";

const refreshTokenCookieSchema = z.string().min(1, "Refresh token cookie is required");

const getRefreshCookieOptions = (expiresAt?: Date): CookieOptions => {
    return {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",
        path: "/api/auth",
        expires: expiresAt,
    };
};

const getRequestMetadata = (req: Request): RefreshTokenMetadata => {
    return {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
    };
};

const readCookieValue = (cookieHeader: string | undefined, cookieName: string): string | undefined => {
    if (!cookieHeader) {
        return undefined;
    }

    for (const cookie of cookieHeader.split(";")) {
        const trimmedCookie = cookie.trim();
        const separatorIndex = trimmedCookie.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmedCookie.slice(0, separatorIndex).trim();

        if (key !== cookieName) {
            continue;
        }

        const value = trimmedCookie.slice(separatorIndex + 1);

        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    return undefined;
};

const getValidatedRefreshToken = (req: Request): string => {
    const parsed = refreshTokenCookieSchema.safeParse(readCookieValue(req.headers.cookie, REFRESH_TOKEN_COOKIE_NAME));

    if (!parsed.success) {
        throw ApiError.unauthorized("Refresh token cookie is required");
    }

    return parsed.data;
};

const setRefreshTokenCookie = (res: Response, refreshToken: string, expiresAt: Date): void => {
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, getRefreshCookieOptions(expiresAt));
};

const clearRefreshTokenCookie = (res: Response): void => {
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getRefreshCookieOptions());
};

/**
 * Completes GitHub OAuth authentication.
 *
 * Route purpose: exchange Passport's authenticated GitHub user for DevDoctor
 * tokens. Request source: req.user populated by the GitHub callback route.
 * Response structure: success flag, access token, refresh-cookie expiry, and
 * safe user profile; the refresh token itself is set as an HttpOnly cookie.
 *
 * @param req Express request containing the Passport-authenticated user.
 * @param res Express response used to set the refresh cookie and JSON body.
 * @param next Central error handler bridge.
 * @returns Nothing; the response is sent by the controller.
 */
export const githubOAuthCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        if (!req.user) {
            throw ApiError.unauthorized("GitHub authentication did not return a user");
        }

        const session = await authService.createSession(req.user, getRequestMetadata(req));
        setRefreshTokenCookie(res, session.refreshToken, session.refreshTokenExpiresAt);

        res.status(200).json({
            success: true,
            message: "GitHub authentication successful",
            data: {
                accessToken: session.accessToken,
                refreshTokenExpiresAt: session.refreshTokenExpiresAt,
                user: session.user,
            },
        });
    } catch (error) {
        next(error);
    }
};

/* ------------------------------------------------------------------
Refresh Token Rotation Flow
---------------------------
1. Read the refresh token from the HttpOnly cookie.
2. Validate the cookie value before service execution.
3. Verify the stored token hash in MongoDB.
4. Generate a new access token and refresh token.
5. Replace the old refresh token and set the new cookie.
------------------------------------------------------------------- */

/**
 * Rotates the refresh token and issues a new access token.
 *
 * Route purpose: continue an existing session without replaying OAuth.
 * Request source: refresh token from the Cookie header.
 * Response structure: success flag, new access token, new refresh-cookie
 * expiry, and safe user profile.
 *
 * @param req Express request containing the refresh cookie.
 * @param res Express response used to rotate the cookie and return JSON.
 * @param next Central error handler bridge.
 * @returns Nothing; the response is sent by the controller.
 */
export const refreshAccessToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const refreshToken = getValidatedRefreshToken(req);
        const session = await authService.refreshSession(refreshToken, getRequestMetadata(req));
        setRefreshTokenCookie(res, session.refreshToken, session.refreshTokenExpiresAt);

        res.status(200).json({
            success: true,
            message: "Access token refreshed",
            data: {
                accessToken: session.accessToken,
                refreshTokenExpiresAt: session.refreshTokenExpiresAt,
                user: session.user,
            },
        });
    } catch (error) {
        next(error);
    }
};

/* ------------------------------------------------------------------
Logout Flow
-----------
1. Read the refresh token from the HttpOnly cookie when present.
2. Delete the matching refresh-token hash from MongoDB.
3. Clear the refresh-token cookie.
4. Return an idempotent success response.
------------------------------------------------------------------- */

/**
 * Logs out the current refresh-token session.
 *
 * Route purpose: invalidate the server-side refresh token and clear the cookie.
 * Request source: refresh token from the Cookie header when available.
 * Response structure: success flag and logout confirmation message.
 *
 * @param req Express request that may contain a refresh cookie.
 * @param res Express response used to clear the cookie and return JSON.
 * @param next Central error handler bridge.
 * @returns Nothing; the response is sent by the controller.
 */
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const refreshToken = readCookieValue(req.headers.cookie, REFRESH_TOKEN_COOKIE_NAME);

        if (refreshToken) {
            await authService.logout(refreshToken);
        }

        clearRefreshTokenCookie(res);

        res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (error) {
        next(error);
    }
};
