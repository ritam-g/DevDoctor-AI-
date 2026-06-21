import passport from "passport";
import { Strategy as GitHubStrategy, type Profile } from "passport-github2";
import type { VerifyCallback } from "passport-oauth2";
import { env } from "./env";
import { authService } from "../services/auth/auth.service";
import type { GithubOAuthProfile } from "../types/auth.types";

const getPrimaryEmail = (profile: Profile): string => {
    const profileEmail = profile.emails?.find((email) => typeof email.value === "string" && email.value.trim().length > 0);

    if (profileEmail?.value) {
        return profileEmail.value.toLowerCase();
    }

    const username = profile.username ?? profile.id;
    return `${profile.id}+${username}@users.noreply.github.com`.toLowerCase();
};

const mapGithubProfile = (profile: Profile): GithubOAuthProfile => {
    return {
        githubId: profile.id,
        username: profile.username ?? profile.displayName ?? `github-${profile.id}`,
        email: getPrimaryEmail(profile),
        avatarUrl: profile.photos?.[0]?.value,
    };
};

/**
 * Registers the GitHub OAuth strategy with Passport.
 *
 * The strategy keeps OAuth provider concerns in configuration while delegating
 * account lookup and creation to the auth service for a clean boundary.
 *
 * @returns Nothing; Passport is configured through its process-level registry.
 */
export const configurePassport = (): void => {
    passport.use(
        new GitHubStrategy(
            {
                clientID: env.GITHUB_CLIENT_ID,
                clientSecret: env.GITHUB_CLIENT_SECRET,
                callbackURL: env.GITHUB_CALLBACK_URL,
                scope: ["read:user", "user:email"],
                userAgent: "DevDoctor-AI",
            },
            async (_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback): Promise<void> => {
                try {
                    const user = await authService.findOrCreateGithubUser(mapGithubProfile(profile));
                    done(null, user);
                } catch (error) {
                    done(error as Error);
                }
            }
        )
    );
};
