import type { HydratedDocument, Types } from "mongoose";

export type UserPlan = "free" | "pro" | "enterprise";

export interface IRefreshToken {
    tokenHash: string;
    tokenId: string;
    expiresAt: Date;
    createdAt: Date;
    userAgent?: string;
    ipAddress?: string;
}

export interface IUser {
    _id: Types.ObjectId;
    githubId: string;
    username: string;
    email: string;
    avatarUrl?: string;

    plan: UserPlan;

    analysisCredits: number;

    refreshTokens: IRefreshToken[];

    createdAt: Date;
    updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;
