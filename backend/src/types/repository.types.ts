import type { HydratedDocument, Types } from "mongoose";

export type RepositoryStatus = "uploaded" | "processing" | "completed" | "failed";

export interface IRepository {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    repositoryName: string;
    originalFileName: string;
    cloudinaryUrl: string;
    cloudinaryPublicId: string;
    status: RepositoryStatus;
    createdAt: Date;
    updatedAt: Date;
}

export type RepositoryDocument = HydratedDocument<IRepository>;

export interface CreateRepositoryRecord {
    userId: string;
    repositoryName: string;
    originalFileName: string;
    cloudinaryUrl: string;
    cloudinaryPublicId: string;
    status: RepositoryStatus;
}

export interface UpdateRepositoryRecord {
    repositoryName?: string;
    cloudinaryUrl?: string;
    cloudinaryPublicId?: string;
    status?: RepositoryStatus;
}

export interface UploadRepositoryInput {
    file?: Express.Multer.File;
    userId?: string;
}

export interface RepositoryResponse {
    id: string;
    userId: string;
    repositoryName: string;
    originalFileName: string;
    cloudinaryUrl: string;
    cloudinaryPublicId: string;
    status: RepositoryStatus;
    createdAt: Date;
    updatedAt: Date;
}
