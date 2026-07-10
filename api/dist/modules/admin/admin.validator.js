import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
const listTenantsSchema = z
    .object({
    page: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.coerce.number().int().positive())
        .default(1),
    pageSize: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.coerce.number().int().positive().max(100))
        .default(20),
    status: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z
        .enum(["active", "trial", "pending", "pending_verification"])
        .optional())
        .optional(),
    plan: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.enum(["free", "trial", "pro"]).optional())
        .optional(),
    search: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.string().trim().min(1).max(120).optional())
        .optional(),
})
    .strict();
function groupValidationIssues(issues) {
    return issues.reduce((acc, issue) => {
        const path = issue.path.join(".");
        if (!acc[path]) {
            acc[path] = [];
        }
        acc[path].push(issue.message);
        return acc;
    }, {});
}
export function validateListTenantsInput(input) {
    const result = listTenantsSchema.safeParse(input);
    if (!result.success) {
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
    }
    return result.data;
}
const updateTenantBodySchema = z
    .object({
    status: z.enum(["active", "trial", "suspended"]).optional(),
    plan: z.enum(["free", "trial", "pro"]).optional(),
})
    .strict()
    .refine((data) => data.status !== undefined || data.plan !== undefined, {
    message: "At least one field (status or plan) must be provided for update",
    path: [],
});
const updateTenantParamsSchema = z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid tenant ID format"),
});
export function validateUpdateTenantInput(params, body) {
    const paramsResult = updateTenantParamsSchema.safeParse(params);
    if (!paramsResult.success) {
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(paramsResult.error.issues));
    }
    const bodyResult = updateTenantBodySchema.safeParse(body);
    if (!bodyResult.success) {
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(bodyResult.error.issues));
    }
    return {
        id: paramsResult.data.id,
        ...bodyResult.data,
    };
}
//# sourceMappingURL=admin.validator.js.map