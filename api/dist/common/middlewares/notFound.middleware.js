import { AppError } from "../errors/AppError.js";
export function notFoundMiddleware(_req, _res, next) {
    next(new AppError(404, "NOT_FOUND", "Route not found"));
}
//# sourceMappingURL=notFound.middleware.js.map