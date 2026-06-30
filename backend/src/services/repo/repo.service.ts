import { ApiError } from "../../utils/apiError.ts";
import { RepositoryDAO } from "../../dao/RepositoryDAO.ts";
import { deleteRepositoryZip, uploadRepositoryZip } from "./cloudinaryUpload.ts";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/**
 * Repository Service
 *
 * This layer contains all business logic related to repositories.
 *
 * Responsibilities
 * ----------------
 * 1. Upload repository.
 * 2. Fetch repositories.
 * 3. Delete repositories.
 * 4. Prepare future AI processing.
 *
 * NOTE:
 * Never access MongoDB directly from controllers.
 * Controllers should always call this service.
 */
export class RepoService {

    /**
     * Uploads repository to Cloudinary and creates MongoDB record.
     *
     * Responsibilities
     * ----------------
     * 1. Upload repository ZIP to Cloudinary.
     * 2. Store Cloudinary URL and public id.
     * 3. Create repository record through DAO.
     */
    static async createRepository(
        file: Express.Multer.File,
        userId: string
    ) {

        const uploadedRepository =
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

            cloudinaryUrl:
                uploadedRepository.cloudinaryUrl,

            cloudinaryPublicId:
                uploadedRepository.cloudinaryPublicId,

            status: "uploaded"

        });

    }

    /**
     * Returns paginated repositories for authenticated user.
     *
     * Responsibilities
     * ----------------
     * 1. Apply default pagination.
     * 2. Calculate database skip.
     * 3. Return repositories with pagination metadata.
     */
    static async getMyRepositories(
        userId: string,
        page = DEFAULT_PAGE,
        limit = DEFAULT_LIMIT
    ) {

        const skip =
            (page - 1) * limit;

        const [repositories, total] =
            await Promise.all([

                RepositoryDAO.findByUserIdPaginated(
                    userId,
                    skip,
                    limit
                ),

                RepositoryDAO.countByUserId(userId)

            ]);

        return {

            page,

            limit,

            total,

            totalPages:
                Math.ceil(total / limit),

            repositories

        };

    }

    /**
     * Returns details of one repository.
     *
     * Responsibilities
     * ----------------
     * 1. Validate ownership through DAO lookup.
     * 2. Throw 404 when repository is missing.
     * 3. Return repository.
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

    /**
     * Deletes one repository owned by authenticated user.
     *
     * Responsibilities
     * ----------------
     * 1. Validate repository ownership.
     * 2. Delete Cloudinary ZIP first.
     * 3. Delete MongoDB record second.
     */
    static async deleteRepository(

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

        if (!repository.cloudinaryPublicId) {

            throw ApiError.internal(

                "Repository Cloudinary public id missing"

            );

        }

        await deleteRepositoryZip(

            repository.cloudinaryPublicId

        );

        const deleted =

            await RepositoryDAO.deleteByIdAndUserId(

                repositoryId,

                userId

            );

        if (!deleted) {

            throw ApiError.notFound(

                "Repository not found"

            );

        }

    }

}
