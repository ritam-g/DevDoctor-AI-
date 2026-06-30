import { Schema, model } from "mongoose"
import { IRepository } from '../types/repository.types.ts'

const repositorySchema = new Schema<IRepository>({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "User",
    },

    repositoryName: {
        type: String,
        required: true,
        trim: true,
    },

    originalFileName: {
        type: String,
        required: true,
    },

    cloudinaryUrl: {
        type: String,
        required: true,
    },

    cloudinaryPublicId: {
        type: String,
        required: true,
        trim: true,
    },

    status: {
        type: String,
        enum: [
            "uploaded",
            "processing",
            "completed",
            "failed",
        ],
        default: "uploaded",
    },
})

export const Repository = model<IRepository>("Repository", repositorySchema)

