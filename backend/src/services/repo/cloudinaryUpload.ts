import cloudinary from "../../config/cloudinary.ts";
import streamifier from "streamifier";

interface UploadedRepositoryZip {
    cloudinaryUrl: string;
    cloudinaryPublicId: string;
}

/**
 * Uploads repository ZIP file buffer to Cloudinary.
 *
 * Responsibilities
 * ----------------
 * 1. Upload raw ZIP bytes.
 * 2. Store file under repositories folder.
 * 3. Return URL and public id for persistence.
 */
export const uploadRepositoryZip = (fileBuffer: Buffer, fileName: string): Promise<UploadedRepositoryZip> => {

    return new Promise((resolve, reject) => {

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: "raw",
                folder: "repositories",
                public_id: fileName.replace(".zip", ""),
            },
            (error, result) => {

                if (error) {
                    reject(error);
                    return;
                }

                if (!result?.secure_url || !result.public_id) {
                    reject(new Error("Cloudinary upload response is missing repository asset details"));
                    return;
                }

                resolve({

                    cloudinaryUrl: result.secure_url,

                    cloudinaryPublicId: result.public_id

                });
            }
        );

        streamifier
            .createReadStream(fileBuffer)
            .pipe(uploadStream);
    });
};

/**
 * Deletes repository ZIP file from Cloudinary.
 *
 * Responsibilities
 * ----------------
 * 1. Receive stored Cloudinary public id.
 * 2. Delete the raw ZIP asset.
 * 3. Fail before MongoDB deletion if Cloudinary rejects.
 */
export const deleteRepositoryZip = async (cloudinaryPublicId: string): Promise<void> => {

    const result =
        await cloudinary.uploader.destroy(

            cloudinaryPublicId,

            {
                resource_type: "raw",
            }

        );

    if (result.result !== "ok" && result.result !== "not found") {

        throw new Error("Unable to delete repository ZIP from Cloudinary");

    }

};
