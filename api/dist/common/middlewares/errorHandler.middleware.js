import { AppError } from "../errors/AppError.js";
import { BAD_REQUEST, INTERNAL_SERVER_ERROR } from "../errors/errorCodes.js";
import { logger } from "../logger/logger.js";
function isSyntaxError(error) {
    return (error instanceof SyntaxError ||
        (typeof error === "object" &&
            error !== null &&
            "type" in error &&
            error.type === "entity.parse.failed"));
}
export const errorHandlerMiddleware = (err, req, res, _next) => {
    void _next;
    const isProduction = process.env.NODE_ENV === "production";
    let statusCode = 500;
    let code = INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let details = null;
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        code = err.code;
        message = err.message;
        details = err.details ?? null;
    }
    else if (isSyntaxError(err)) {
        statusCode = 400;
        code = BAD_REQUEST;
        message = "Invalid JSON payload";
        details = null;
    }
    const requestId = req.requestId ?? "unavailable";
    const requestLogger = req.log ?? logger;
    try {
        if (err instanceof AppError && isProduction) {
            requestLogger.error({ requestId, code: err.code, statusCode: err.statusCode }, "request failed");
        }
        else {
            requestLogger.error({ requestId, err, statusCode }, "request failed");
        }
    }
    catch {
        // Error reporting must not prevent the API error response.
    }
    const payload = {
        success: false,
        error: {
            code,
            message,
            details,
            path: req.originalUrl,
            method: req.method,
            requestId,
            timestamp: new Date().toISOString(),
        },
    };
    if (!isProduction && err instanceof Error && err.stack) {
        payload.error.stack = err.stack;
    }
    res.status(statusCode).json(payload);
};
//# sourceMappingURL=errorHandler.middleware.js.map