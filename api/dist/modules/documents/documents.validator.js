import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
const uploadDocumentSchema = z
    .object({
    title: z
        .string()
        .trim()
        .min(2, "title must be at least 2 characters")
        .max(200, "title must be at most 200 characters"),
    description: z
        .string()
        .trim()
        .max(1000, "description must be at most 1000 characters")
        .optional()
        .default(""),
    tags: z
        .array(z.string().trim().max(50, "each tag must be at most 50 characters"))
        .max(10, "at most 10 tags allowed")
        .optional()
        .default([]),
})
    .strict();
const listDocumentsSchema = z
    .object({
    page: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.coerce.number().int().positive())
        .default(1),
    pageSize: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.coerce.number().int().positive().max(100))
        .default(20),
    status: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.enum(["uploading", "uploaded", "processing", "processed", "failed"]).optional())
        .optional(),
})
    .strict();
const updateDocumentMetadataSchema = z
    .object({
    title: z
        .string()
        .trim()
        .min(2, "title must be at least 2 characters")
        .max(200, "title must be at most 200 characters")
        .optional(),
    description: z
        .string()
        .trim()
        .max(1000, "description must be at most 1000 characters")
        .optional(),
    tags: z
        .array(z.string().trim().max(50, "each tag must be at most 50 characters"))
        .max(10, "at most 10 tags allowed")
        .optional(),
})
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});
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
export function validateUploadDocumentInput(input) {
    const result = uploadDocumentSchema.safeParse(input);
    if (!result.success) {
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
    }
    return result.data;
}
export function validateListDocumentsInput(input) {
    const result = listDocumentsSchema.safeParse(input);
    if (!result.success) {
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
    }
    return result.data;
}
export function validateUpdateDocumentMetadataInput(input) {
    const result = updateDocumentMetadataSchema.safeParse(input);
    if (!result.success) {
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
    }
    return result.data;
}
//# sourceMappingURL=documents.validator.js.map