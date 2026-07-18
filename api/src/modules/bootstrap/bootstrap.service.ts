import { createHash, timingSafeEqual } from "node:crypto";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { config } from "../../config/index.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { validateBootstrapInput } from "./bootstrap.validator.js";
import { PLATFORM_TENANT_SLUG } from "../../common/auth/platformTenant.js";

function serializePlatformUser(user: InstanceType<typeof UserModel>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

function secretMatches(value: string) {
  const supplied = createHash("sha256").update(value).digest();
  const expected = createHash("sha256").update(config.SUPER_ADMIN_BOOTSTRAP_KEY).digest();
  return timingSafeEqual(supplied, expected);
}
function duplicate(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000); }

export async function bootstrapSuperAdmin(body: unknown, key: string | undefined) {
  if (!config.ENABLE_SUPER_ADMIN_BOOTSTRAP) throw new AppError(404, "NOT_FOUND", "Not found");
  if (!key || !secretMatches(key)) throw new AppError(401, "UNAUTHORIZED", "Invalid bootstrap credentials");
  const input = validateBootstrapInput(body);
  const tenant = await TenantModel.findOneAndUpdate(
    { slug: PLATFORM_TENANT_SLUG },
    {
      $set: {
        status: "active",
        isSystemTenant: true,
      },
      $setOnInsert: {
        name: "DocuMind Platform",
        slug: PLATFORM_TENANT_SLUG,
        plan: "free",
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );
  const existingPlatformUser = await UserModel.findOne({
    tenantId: tenant._id,
    email: input.email,
  });
  if (existingPlatformUser) {
    if (existingPlatformUser.role !== "SUPER_ADMIN") {
      throw new AppError(409, "PLATFORM_TENANT_DATA_CONFLICT", "A conflicting platform-tenant account already uses this email.");
    }
    return serializePlatformUser(existingPlatformUser);
  }
  if (await UserModel.exists({ tenantId: tenant._id, role: "SUPER_ADMIN" })) {
    throw new AppError(409, "SUPER_ADMIN_ALREADY_CONFIGURED", "The initial Super Admin has already been configured.");
  }
  try {
    const user = await UserModel.create({ tenantId: tenant._id, name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: "SUPER_ADMIN", status: "active", emailVerified: true, emailVerifiedAt: new Date() });
    return serializePlatformUser(user);
  } catch (error) {
    if (duplicate(error)) {
      const conflictingPlatformUser = await UserModel.findOne({
        tenantId: tenant._id,
        email: input.email,
      });
      if (conflictingPlatformUser?.role === "SUPER_ADMIN") {
        return serializePlatformUser(conflictingPlatformUser);
      }
      if (conflictingPlatformUser) {
        throw new AppError(409, "PLATFORM_TENANT_DATA_CONFLICT", "A conflicting platform-tenant account already uses this email.");
      }
      if (await UserModel.exists({ tenantId: tenant._id, role: "SUPER_ADMIN" })) throw new AppError(409, "SUPER_ADMIN_ALREADY_CONFIGURED", "The initial Super Admin has already been configured.");
    }
    throw error;
  }
}
