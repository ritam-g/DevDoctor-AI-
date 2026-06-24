import type { HydratedDocument, Types } from "mongoose";

export type UserPlan = "free" | "pro" | "enterprise";

export interface IUser {
    _id: Types.ObjectId;
    githubId?: string;
    username: string;
    email: string;
    password?: string;
    avatarUrl?: string;
    refreshTokenHash?: string;
    plan: UserPlan;
    analysisCredits: number;
    createdAt: Date;
    updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

export interface UserRecord {
    id: string;
    githubId?: string;
    username: string;
    email: string;
    password?: string;
    avatarUrl?: string;
    refreshTokenHash?: string;
    plan: UserPlan;
    analysisCredits: number;
    createdAt: Date;
    updatedAt: Date;
}
