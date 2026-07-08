import { AppError } from "../errors/AppError.js";
export function validateRequest(schema, options = {}) {
    const errorCode = options.errorCode || "VALIDATION_ERROR";
    return (req, _res, next) => {
        const errors = [];
        if (schema.body) {
            errors.push(...schema.body(req));
        }
        if (schema.query) {
            errors.push(...schema.query(req));
        }
        if (schema.params) {
            errors.push(...schema.params(req));
        }
        if (errors.length > 0) {
            return next(new AppError(400, errorCode, "Validation failed", {
                errors,
            }));
        }
        next();
    };
}
//# sourceMappingURL=validateRequest.js.map