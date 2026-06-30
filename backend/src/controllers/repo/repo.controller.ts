import type { Request, Response } from "express";
import { RepoService } from "../../services/repo/repo.service";
import { ApiError } from "../../utils/apiError";

const parsePositiveIntegerQuery = (

    value: unknown,

    fieldName: string

): number | undefined => {

    if (value === undefined) {

        return undefined;

    }

    if (Array.isArray(value)) {

        throw ApiError.badRequest(`${fieldName} must be a positive integer`);

    }

    const parsedValue =
        Number(value);

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {

        throw ApiError.badRequest(`${fieldName} must be a positive integer`);

    }

    return parsedValue;

};

const getRequiredParam = (

    value: unknown,

    fieldName: string

): string => {

    if (!value) {

        throw ApiError.badRequest(`${fieldName} is required`);

    }

    if (Array.isArray(value) || typeof value !== "string") {

        throw ApiError.badRequest(`${fieldName} is invalid`);

    }

    return value;

};

/**
 * Uploads a new repository.
 *
 * Responsibilities
 * ----------------
 * 1. Validate ZIP file exists.
 * 2. Call repository service.
 * 3. Return created repository.
 */
export const uploadRepository = async (

    req: Request,

    res: Response

) => {

    if (!req.file) {

        return res.status(400).json({

            success: false,

            message: "Repository file required"

        });

    }

    const repository =
        await RepoService.createRepository(

            req.file,

            req.user!.id

        );

    res.status(201).json({

        success: true,

        repository

    });

};


/**
 * Returns paginated repositories uploaded by authenticated user.
 *
 * Responsibilities
 * ----------------
 * 1. Read optional pagination query.
 * 2. Call repository service.
 * 3. Return repositories with pagination metadata.
 */
export const getMyRepositories = async (

    req: Request,

    res: Response

) => {

    const page =
        parsePositiveIntegerQuery(

            req.query.page,

            "page"

        );

    const limit =
        parsePositiveIntegerQuery(

            req.query.limit,

            "limit"

        );

    const result =
        await RepoService.getMyRepositories(

            req.user!.id,

            page,

            limit

        );

    res.status(200).json({

        success: true,

        ...result

    });

};

/**
 * Returns details of one repository.
 *
 * Responsibilities
 * ----------------
 * 1. Read repository id.
 * 2. Read authenticated user.
 * 3. Ask service.
 * 4. Return response.
 */
export const getRepositoryDetails = async (

    req: Request,

    res: Response

) => {

    const repositoryId =
        getRequiredParam(

            req.params.id,

            "Repository id"

        );

    const repository =

        await RepoService.getRepositoryDetails(

            repositoryId,

            req.user!.id

        );

    res.status(200).json({

        success: true,

        repository

    });

};

/**
 * Deletes one repository.
 *
 * Responsibilities
 * ----------------
 * 1. Read repository id.
 * 2. Call repository service.
 * 3. Return delete success response.
 */
export const deleteRepository = async (

    req: Request,

    res: Response

) => {

    const repositoryId =
        getRequiredParam(

            req.params.id,

            "Repository id"

        );

    await RepoService.deleteRepository(

        repositoryId,

        req.user!.id

    );

    res.status(200).json({

        success: true,

        message: "Repository deleted successfully"

    });

};
