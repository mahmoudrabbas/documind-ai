import { createHash, timingSafeEqual } from "node:crypto";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { config } from "../../config/index.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { validateBootstrapInput } from "./bootstrap.validator.js";
export const PLATFORM_TENANT_SLUG = "__documind_platform__";
function secretMatches(value) {
    const supplied = createHash("sha256").update(value).digest();
    const expected = createHash("sha256").update(config.SUPER_ADMIN_BOOTSTRAP_KEY).digest();
    return timingSafeEqual(supplied, expected);
}
function duplicate(error) { return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000); }
export async function bootstrapSuperAdmin(body, key) {
    if (!config.ENABLE_SUPER_ADMIN_BOOTSTRAP)
        throw new AppError(404, "NOT_FOUND", "Not found");
    if (!key || !secretMatches(key))
        throw new AppError(401, "UNAUTHORIZED", "Invalid bootstrap credentials");
    const input = validateBootstrapInput(body);
    if (await UserModel.exists({ role: "SUPER_ADMIN" }))
        throw new AppError(409, "SUPER_ADMIN_ALREADY_CONFIGURED", "The initial Super Admin has already been configured.");
    if (await UserModel.exists({ email: input.email }))
        throw new AppError(409, "EMAIL_ALREADY_IN_USE", "The email cannot be used for platform administration.");
    const tenant = await TenantModel.findOneAndUpdate({ slug: PLATFORM_TENANT_SLUG }, { $setOnInsert: { name: "DocuMind Platform", slug: PLATFORM_TENANT_SLUG, status: "active", plan: "free" } }, { upsert: true, new: true, runValidators: true });
    try {
        const user = await UserModel.create({ tenantId: tenant._id, name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: "SUPER_ADMIN", status: "active", emailVerified: true, emailVerifiedAt: new Date() });
        return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, emailVerified: user.emailVerified, createdAt: user.createdAt.toISOString() };
    }
    catch (error) {
        if (duplicate(error)) {
            if (await UserModel.exists({ role: "SUPER_ADMIN" }))
                throw new AppError(409, "SUPER_ADMIN_ALREADY_CONFIGURED", "The initial Super Admin has already been configured.");
            throw new AppError(409, "EMAIL_ALREADY_IN_USE", "The email cannot be used for platform administration.");
        }
        throw error;
    }
}
//# sourceMappingURL=bootstrap.service.js.map