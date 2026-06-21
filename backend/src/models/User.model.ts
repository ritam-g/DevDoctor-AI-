import { Schema, model } from "mongoose";
import { IUser } from "../types/user.types";

const userSchema = new Schema<IUser>(
    {
        githubId: {
            type: String,
            required: true,
            unique: true,
        },

        username: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        avatarUrl: {
            type: String,
        },

        plan: {
            type: String,
            enum: ["free", "pro", "enterprise"],
            default: "free",
        },

        analysisCredits: {
            type: Number,
            default: 5,
        },
    },
    {
        timestamps: true,
    }
);

export const User = model<IUser>("User", userSchema);