import { Types } from "mongoose";
import { User } from "../models/User.model";
import type { UserDocument, UserPlan, UserRecord } from "../types/user.types";

const toUserRecord = (user: UserDocument): UserRecord => {
    return {
        id: user._id.toString(),
        githubId: user.githubId,
        username: user.username,
        email: user.email,
        password: user.password,
        avatarUrl: user.avatarUrl,
        refreshTokenHash: user.refreshTokenHash,
        plan: user.plan,
        analysisCredits: user.analysisCredits,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
};

const mapUserRecord = (user: UserDocument | null): UserRecord | null => {
    return user ? toUserRecord(user) : null;
};

/**
 * UserDAO - Data Access Object for User model operations
 * Handles all database interactions related to users
 */
export class UserDAO {
    /**
     * Create a new user with email/password credentials
     */
    static async createUser(userData: {
        username: string;
        email: string;
        password: string;
        plan?: UserPlan;
        analysisCredits?: number;
    }): Promise<UserRecord> {
        const user = await User.create(userData);
        return toUserRecord(user);
    }

    /**
     * Create a new user via GitHub OAuth
     */
    static async createGitHubUser(userData: {
        githubId: string;
        username: string;
        email: string;
        avatarUrl?: string;
        plan?: UserPlan;
        analysisCredits?: number;
    }): Promise<UserRecord> {
        const user = await User.create(userData);
        return toUserRecord(user);
    }

    /**
     * Check if user exists by email
     */
    static async userExistsByEmail(email: string): Promise<boolean> {
        const exists = await User.exists({ email });
        return !!exists;
    }

    /**
     * Find user by email (without password)
     */
    static async findByEmail(email: string): Promise<UserRecord | null> {
        const user = await User.findOne({ email });
        return mapUserRecord(user);
    }

    /**
     * Find user by email with password field selected
     */
    static async findByEmailWithPassword(email: string): Promise<UserRecord | null> {
        const user = await User.findOne({ email }).select("+password +refreshTokenHash");
        return mapUserRecord(user);
    }

    /**
     * Find user by GitHub ID
     */
    static async findByGitHubId(githubId: string): Promise<UserRecord | null> {
        const user = await User.findOne({ githubId }).select("+refreshTokenHash");
        return mapUserRecord(user);
    }

    /**
     * Find user by ID
     */
    static async findById(userId: string): Promise<UserRecord | null> {
        if (!Types.ObjectId.isValid(userId)) {
            return null;
        }
        const user = await User.findById(userId);
        return mapUserRecord(user);
    }

    /**
     * Find user by ID with refresh token hash selected
     */
    static async findByIdWithRefreshToken(userId: string): Promise<UserRecord | null> {
        if (!Types.ObjectId.isValid(userId)) {
            return null;
        }
        const user = await User.findById(userId).select("+refreshTokenHash");
        return mapUserRecord(user);
    }

    /**
     * Update user by ID
     */
    static async updateUser(
        userId: string,
        updates: {
            username?: string;
            email?: string;
            avatarUrl?: string;
            githubId?: string;
            analysisCredits?: number;
            plan?: UserPlan;
            refreshTokenHash?: string;
        }
    ): Promise<UserRecord | null> {
        if (!Types.ObjectId.isValid(userId)) {
            return null;
        }
        const user = await User.findByIdAndUpdate(userId, updates, { new: true });
        return mapUserRecord(user);
    }

    /**
     * Update profile fields received from GitHub OAuth
     */
    static async updateGitHubProfile(
        userId: string,
        updates: {
            email: string;
            username: string;
            avatarUrl?: string;
        }
    ): Promise<UserRecord | null> {
        if (!Types.ObjectId.isValid(userId)) {
            return null;
        }

        const fieldsToSet: Record<string, string> = {
            email: updates.email,
            username: updates.username,
        };

        if (updates.avatarUrl !== undefined) {
            fieldsToSet.avatarUrl = updates.avatarUrl;
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: fieldsToSet },
            { new: true }
        ).select("+refreshTokenHash");

        return mapUserRecord(user);
    }

    /**
     * Link a credential user to a GitHub OAuth identity
     */
    static async linkGitHubAccount(
        userId: string,
        updates: {
            githubId: string;
            avatarUrl?: string;
        }
    ): Promise<UserRecord | null> {
        if (!Types.ObjectId.isValid(userId)) {
            return null;
        }

        const fieldsToSet: Record<string, string> = {
            githubId: updates.githubId,
        };

        if (updates.avatarUrl !== undefined) {
            fieldsToSet.avatarUrl = updates.avatarUrl;
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: fieldsToSet },
            { new: true }
        ).select("+refreshTokenHash");

        return mapUserRecord(user);
    }

    /**
     * Replace a user's stored refresh-token hash
     */
    static async setRefreshTokenHashByUserId(userId: string, refreshTokenHash: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(userId)) {
            return false;
        }

        const result = await User.updateOne(
            { _id: userId },
            {
                $set: {
                    refreshTokenHash,
                },
            }
        );

        return result.modifiedCount === 1;
    }

    /**
     * Update refresh token hash for a user
     */
    static async updateRefreshTokenHash(
        userId: string,
        currentHash: string,
        newHash: string
    ): Promise<{ modifiedCount: number }> {
        if (!Types.ObjectId.isValid(userId)) {
            return { modifiedCount: 0 };
        }

        const result = await User.updateOne(
            {
                _id: userId,
                refreshTokenHash: currentHash,
            },
            {
                $set: {
                    refreshTokenHash: newHash,
                },
            }
        );
        return { modifiedCount: result.modifiedCount };
    }

    /**
     * Clear refresh token hash (logout operation)
     */
    static async clearRefreshTokenHash(refreshTokenHash: string): Promise<void> {
        await User.updateOne(
            { refreshTokenHash },
            {
                $unset: {
                    refreshTokenHash: "",
                },
            }
        );
    }

    /**
     * Clear refresh token by user ID
     */
    static async clearRefreshTokenHashByUserId(userId: string): Promise<void> {
        if (!Types.ObjectId.isValid(userId)) {
            return;
        }

        await User.updateOne(
            { _id: userId },
            {
                $unset: {
                    refreshTokenHash: "",
                },
            }
        );
    }
}
