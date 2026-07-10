import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
const schema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(128).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, "password must contain at least one letter and one number"),
}).strict();
export function validateBootstrapInput(input) {
    const result = schema.safeParse(input);
    if (!result.success)
        throw new AppError(400, VALIDATION_ERROR, "Validation failed", result.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", message: issue.message })));
    return result.data;
}
//# sourceMappingURL=bootstrap.validator.js.map