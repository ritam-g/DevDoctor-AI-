import { ApiError } from "../../utils/apiError.ts";
import { RepositoryDAO } from "../../dao/RepositoryDAO.ts";
import { uploadRepositoryZip } from "./cloudinaryUpload.ts";

/**
 * Repository Service
 *
 * This layer contains all business logic related to repositories.
 *
 * Responsibilities:
 * -----------------
 * • Upload repository
 * • Fetch repositories
 * • Delete repositories
 * • Future AI processing
 *
 * NOTE:
 * Never access MongoDB directly from controllers.
 * Controllers should always call this service.
 */
export class RepoService {

    /**
     * Upload repository to Cloudinary
     * and create MongoDB record.
     */
    static async createRepository(
        file: Express.Multer.File,
        userId: string
    ) {

        const cloudinaryUrl =
            await uploadRepositoryZip(
                file.buffer,
                file.originalname
            );

        return RepositoryDAO.createRepository({

            userId,

            repositoryName:
                file.originalname.replace(".zip", ""),

            originalFileName:
                file.originalname,

            cloudinaryUrl,

            status: "uploaded"

        });

    }

    /**
     * Returns all repositories
     * uploaded by the logged-in user.
     */
    static async getMyRepositories(
        userId: string
    ) {

        return RepositoryDAO.findByUserId(userId);

    }
    /**
 * Returns one repository.
 *
 * Business Rules
 * --------------
 * Repository must
 *
 * ✔ exist
 * ✔ belong to user
 */
    static async getRepositoryDetails(

        repositoryId: string,

        userId: string

    ) {

        const repository =

            await RepositoryDAO.findByIdAndUserId(

                repositoryId,

                userId

            );

        if (!repository) {

            throw ApiError.notFound(

                "Repository not found"

            );

        }

        return repository;

    }

}