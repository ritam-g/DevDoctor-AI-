import { Router, type NextFunction, type Request, type Response } from "express";
import passport from "passport";
import { githubOAuthCallback, logout, refreshAccessToken } from "../controllers/auth/auth.controller";
import { ApiError } from "../utils/apiError";

export const authRouter = Router();

/* ------------------------------------------------------------------
GitHub OAuth Flow
-----------------
1. Redirect the user to GitHub with the required identity scopes.
2. Let Passport validate GitHub's callback and normalize the provider user.
3. Delegate token creation and cookie handling to the controller.
------------------------------------------------------------------- */

authRouter.get(
    "/github",
    passport.authenticate("github", {
        scope: ["read:user", "user:email"],
        session: false,
    })
);

authRouter.get("/github/callback", (req: Request, res: Response, next: NextFunction): void => {
    passport.authenticate("github", { session: false }, (error: unknown, user: Express.User | false | null) => {
        if (error) {
            next(error);
            return;
        }

        if (!user) {
            next(ApiError.unauthorized("GitHub authentication failed"));
            return;
        }

        req.user = user;
        void githubOAuthCallback(req, res, next);
    })(req, res, next);
});

authRouter.post("/refresh", refreshAccessToken);
authRouter.post("/logout", logout);
