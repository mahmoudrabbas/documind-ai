import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
const inviteUserSchema = z
    .object({
    name: z
        .string()
        .trim()
        .min(2, "name must be at least 2 characters")
        .max(120, "name must be at most 120 characters")
        .regex(/^[\p{L}\p{N}\s'&.()-]+$/u, "name contains invalid characters"),
    email: z
        .string()
        .trim()
        .toLowerCase()
        .email("email must be a valid address"),
    role: z.enum(["COMPANY_ADMIN", "EMPLOYEE"]).optional(),
    customRoleId: z.string().min(1, "customRoleId must not be empty").optional(),
})
    .strict()
    .refine((data) => data.role !== undefined || data.customRoleId !== undefined, {
    message: "Either role or customRoleId must be provided",
    path: ["role"],
});
const updateUserSchema = z
    .object({
    role: z.enum(["COMPANY_ADMIN", "EMPLOYEE"]).optional(),
    customRoleId: z.string().min(1, "customRoleId must not be empty").optional(),
    status: z
        .enum(["active", "pending", "pending_email_verification", "disabled"])
        .optional(),
})
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one of role, customRoleId, or status must be provided",
});
const listUsersSchema = z
    .object({
    page: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.coerce.number().int().positive())
        .default(1),
    pageSize: z
        .preprocess((value) => (Array.isArray(value) ? value[0] : value), z.coerce.number().int().positive().max(100))
        .default(20),
})
    .strict();
const setPasswordFromInviteSchema = z
    .object({
    token: z.string().trim().min(1, "token is required"),
    password: z
        .string()
        .min(8, "password must be at least 8 characters")
        .max(128, "password must be at most 128 characters")
        .refine((value) => value === value.trim(), "password must not have leading or trailing whitespace")
        .regex(/[A-Z]/, "password must contain at least one uppercase letter")
        .regex(/[a-z]/, "password must contain at least one lowercase letter")
        .regex(/[0-9]/, "password must contain at least one digit"),
})
    .strict();
export function validateInviteUserInput(input) {
    const result = inviteUserSchema.safeParse(input);
    if (!result.success) {
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
    }
    return result.data;
}
export function validateUpdateUserInput(input) {
    const result = updateUserSchema.safeParse(input);
    if (!result.success) {
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
    }
    return result.data;
}
export function validateListUsersInput(input) {
    const result = listUsersSchema.safeParse(input);
    if (!result.success) {
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
    }
    return result.data;
}
export function validateSetPasswordFromInviteInput(input) {
    const result = setPasswordFromInviteSchema.safeParse(input);
    if (!result.success) {
        throw new AppError(400, "PASSWORD_VALIDATION_FAILED", "Validation failed", groupValidationIssues(result.error.issues));
    }
    return result.data;
}
function groupValidationIssues(issues) {
    const groupedErrors = new Map();
    for (const issue of issues) {
        const field = issue.path.join(".") || "query";
        if (!groupedErrors.has(field)) {
            groupedErrors.set(field, []);
        }
        groupedErrors.get(field)?.push(issue.message);
    }
    return Array.from(groupedErrors.entries()).map(([field, messages]) => ({
        field,
        message: formatGroupedMessage(field, messages),
    }));
}
function formatGroupedMessage(field, messages) {
    const [firstMessage, ...remainingMessages] = messages;
    if (!firstMessage) {
        return "";
    }
    const deduplicatedMessages = remainingMessages.map((message) => removeRepeatedFieldPrefix(field, message));
    return [firstMessage, ...deduplicatedMessages].join(" and ");
}
function removeRepeatedFieldPrefix(field, message) {
    const mustPrefix = `${field} must `;
    const fieldPrefix = `${field} `;
    if (message.startsWith(mustPrefix)) {
        return message.slice(mustPrefix.length);
    }
    if (message.startsWith(fieldPrefix)) {
        return message.slice(fieldPrefix.length);
    }
    return message;
}
//# sourceMappingURL=users.validator.js.map