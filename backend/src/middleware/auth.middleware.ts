import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { authService } from "../services/auth/auth.service";
import { ApiError } from "../utils/apiError";

const authorizationHeaderSchema = z.string().regex(/^Bearer\s+\S+$/i, "Authorization header must use the Bearer scheme");

const extractBearerToken = (authorizationHeader: string | undefined): string => {
    const parsed = authorizationHeaderSchema.safeParse(authorizationHeader);

    if (!parsed.success) {
        throw ApiError.unauthorized("Bearer access token is required");
    }

    return parsed.data.replace(/^Bearer\s+/i, "").trim();
};

/**
 * Authenticates API requests with a JWT access token.
 *
 * Why it exists: protected DevDoctor routes should trust only short-lived bearer
 * tokens, not refresh cookies. What it validates: Authorization header format,
 * JWT signature, issuer, audience, expiry, token type, and active user record.
 * On failure: forwards an ApiError.unauthorized response to centralized error
 * handling; on success it attaches req.auth and req.user.
 *
 * @param req Express request containing the Authorization header.
 * @param _res Express response, unused because middleware delegates response handling.
 * @param next Express next function for success or centralized error handling.
 * @returns Nothing; request control is passed through next.
 */
export const authenticateAccessToken = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
        const accessToken = extractBearerToken(req.headers.authorization);
        const context = await authService.getAuthenticatedUserFromAccessToken(accessToken);

        req.auth = context.payload;
        req.user = context.user;

        next();
    } catch (error) {
        next(error);
    }
};
