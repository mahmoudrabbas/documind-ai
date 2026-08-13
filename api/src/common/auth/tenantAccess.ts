import mongoose from "mongoose";
import TenantModel from "../../db/models/tenant.model.js";
import { AppError } from "../errors/AppError.js";
import { TENANT_NOT_ACTIVE } from "../errors/errorCodes.js";

/**
 * Revalidates the authoritative tenant lifecycle for an authenticated request.
 * Access tokens deliberately carry no trusted tenant-status claim.
 */
export async function requireActiveTenantAccess(tenantId: string): Promise<void> {
  if (!mongoose.isObjectIdOrHexString(tenantId)) throw tenantNotActive();
  const tenant = await TenantModel.findOne({ _id: tenantId, status: "active" })
    .select("_id")
    .lean()
    .exec();
  if (!tenant) throw tenantNotActive();
}

function tenantNotActive(): AppError {
  return new AppError(403, TENANT_NOT_ACTIVE, "Tenant is not active");
}
