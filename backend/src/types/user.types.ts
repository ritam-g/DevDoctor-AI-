export type UserPlan = "free" | "pro" | "enterprise";

export interface IUser {
    githubId: string;
    username: string;
    email: string;
    avatarUrl?: string;

    plan: UserPlan;

    analysisCredits: number;

    createdAt: Date;
    updatedAt: Date;
}