import mongoose from "mongoose";
import TenantModel from "../../db/models/tenant.model.js";
import { AppError } from "../errors/AppError.js";
import { TENANT_NOT_ACTIVE } from "../errors/errorCodes.js";

/**
 * Tenant lifecycle statuses permitted to use authenticated tenant routes.
 * Trial tenants are full users of the product; `pending`,
 * `pending_verification`, and `suspended` tenants are blocked everywhere.
 */
export const AUTHENTICABLE_TENANT_STATUSES = ["active", "trial"] as const;

export function isAuthenticableTenantStatus(status: string): boolean {
  return (AUTHENTICABLE_TENANT_STATUSES as readonly string[]).includes(status);
}

/**
 * Revalidates the authoritative tenant lifecycle for an authenticated request.
 * Access tokens deliberately carry no trusted tenant-status claim. This is the
 * single shared helper used by authentication, request middleware, and sockets.
 */
export async function requireActiveTenantAccess(tenantId: string): Promise<void> {
  if (!mongoose.isObjectIdOrHexString(tenantId)) throw tenantNotActive();
  const tenant = await TenantModel.findOne({
    _id: tenantId,
    status: { $in: [...AUTHENTICABLE_TENANT_STATUSES] },
  })
    .select("_id")
    .lean()
    .exec();
  if (!tenant) throw tenantNotActive();
}

function tenantNotActive(): AppError {
  return new AppError(403, TENANT_NOT_ACTIVE, "Tenant is not active");
}
