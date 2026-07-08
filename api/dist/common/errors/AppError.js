export class AppError extends Error {
    statusCode;
    code;
    details;
    isOperational;
    constructor(statusCode, code, message, details, isOperational = true) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details ?? null;
        this.isOperational = isOperational;
    }
}
//# sourceMappingURL=AppError.js.map