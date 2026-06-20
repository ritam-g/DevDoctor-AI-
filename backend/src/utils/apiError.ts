export class ApiError extends Error {
    constructor(public statusCode: number, public message: string) {
        super(message);

        this.name = "ApiError";
    }

    static badRequest(message: string) {
        return new ApiError(400, message);
    }

    static unauthorized(message = "Unauthorized") {
        return new ApiError(401, message);
    }

    static forbidden(message = "Forbidden") {
        return new ApiError(403, message);
    }

    static notFound(message = "Not Found") {
        return new ApiError(404, message);
    }

    static internal(message = "Server Error") {
        return new ApiError(500, message);
    }
}