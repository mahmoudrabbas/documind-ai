import TenantModel from "../db/models/tenant.model.js";
import UserModel from "../db/models/user.model.js";
import { hashPassword } from "../modules/auth/passwordHashing.js";
export function normalizeSeedInput(input) {
    const platformSlug = input.platformSlug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    const normalized = {
        platformName: input.platformName.trim(),
        platformSlug,
        name: input.name.trim(),
        email: input.email.toLowerCase().trim(),
        password: input.password,
    };
    const missing = Object.entries(normalized)
        .filter(([, value]) => !value)
        .map(([key]) => key);
    if (missing.length)
        throw new Error(`Missing required Super Admin seed values: ${missing.join(", ")}`);
    if (normalized.password.length < 12)
        throw new Error("SEED_SUPER_ADMIN_PASSWORD must contain at least 12 characters");
    return normalized;
}
export async function seedSuperAdmin(rawInput) {
    const input = normalizeSeedInput(rawInput);
    const tenant = await TenantModel.findOneAndUpdate({ slug: input.platformSlug }, {
        $set: {
            name: input.platformName,
            status: "active",
            plan: "free",
            isSystemTenant: true,
        },
        $setOnInsert: { slug: input.platformSlug },
    }, { upsert: true, new: true, runValidators: true });
    const conflictingUser = await UserModel.findOne({
        email: input.email,
        role: { $ne: "SUPER_ADMIN" },
    });
    if (conflictingUser)
        throw new Error("SEED_SUPER_ADMIN_EMAIL is already used by a non-Super Admin account");
    const passwordHash = await hashPassword(input.password);
    const user = await UserModel.findOneAndUpdate({ role: "SUPER_ADMIN" }, {
        $set: {
            tenantId: tenant._id,
            name: input.name,
            email: input.email,
            passwordHash,
            status: "active",
            emailVerified: true,
            emailVerifiedAt: new Date(),
        },
        $setOnInsert: { role: "SUPER_ADMIN" },
    }, { upsert: true, new: true, runValidators: true });
    return { tenantId: tenant.id, userId: user.id, email: user.email };
}
//# sourceMappingURL=seed-super-admin.service.js.map