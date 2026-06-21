import { Schema, model } from "mongoose";
import { IUser, IRefreshToken } from "../types/user.types";

const refreshTokenSchema = new Schema<IRefreshToken>(
    {
        tokenHash: {
            type: String,
            required: true,
            index: true,
            // One-way HMAC of the refresh token so database records cannot be replayed.
        },

        tokenId: {
            type: String,
            required: true,
            index: true,
            // JWT jti claim used to identify the exact refresh-token session during rotation.
        },

        expiresAt: {
            type: Date,
            required: true,
            // Absolute token expiry copied from the JWT to prune stale sessions safely.
        },

        createdAt: {
            type: Date,
            required: true,
            default: Date.now,
            // Creation timestamp for audit trails and session ordering.
        },

        userAgent: {
            type: String,
            trim: true,
            // Optional client fingerprint for operational visibility during incident review.
        },

        ipAddress: {
            type: String,
            trim: true,
            // Optional source IP captured at issuance for audit and anomaly checks.
        },
    },
    {
        _id: false,
    }
);

const userSchema = new Schema<IUser>(
    {
        githubId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            // GitHub account identifier used as the primary external identity.
        },

        username: {
            type: String,
            required: true,
            trim: true,
            // Display name from GitHub used throughout the product UI.
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            // Login contact address from GitHub or GitHub no-reply fallback.
        },

        avatarUrl: {
            type: String,
            trim: true,
            // GitHub avatar URL used for account presentation.
        },

        plan: {
            type: String,
            enum: ["free", "pro", "enterprise"],
            default: "free",
            // Product entitlement tier for quota and feature gating.
        },

        analysisCredits: {
            type: Number,
            default: 5,
            min: 0,
            // Remaining AI analysis quota for the user's current plan.
        },

        refreshTokens: {
            type: [refreshTokenSchema],
            default: [],
            select: false,
            // Server-side refresh-token allowlist used for rotation and logout.
        },
    },
    {
        timestamps: true,
    }
);

userSchema.index({ "refreshTokens.tokenHash": 1 });
userSchema.index({ "refreshTokens.tokenId": 1 });

export const User = model<IUser>("User", userSchema);
