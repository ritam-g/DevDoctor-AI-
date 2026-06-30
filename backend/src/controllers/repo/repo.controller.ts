import { Request, Response } from "express";
import { RepoService } from "../../services/repo/repo.service";

/**
 * Upload a new repository.
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
 * Returns all repositories
 * uploaded by the authenticated user.
 */
export const getMyRepositories = async (

    req: Request,

    res: Response

) => {

    const repositories =
        await RepoService.getMyRepositories(

            req.user!.id

        );

    res.status(200).json({

        success: true,

        total: repositories.length,

        repositories

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

    const repository =

        await RepoService.getRepositoryDetails(

            req.params.id as string,

            req.user!.id

        );

    res.status(200).json({

        success: true,

        repository

    });

};