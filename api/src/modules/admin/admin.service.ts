import {
  countTenantsByFilter,
  findTenantsByFilter,
  updateTenantById
} from "./admin.repository.js";
import type {
  ListTenantsResult,
  TenantPublicView,
  ListTenantsInput,
  UpdateTenantInput,
  UpdateTenantResult
} from "./admin.types.js";
import type { TenantDocument } from "../../db/models/tenant.model.js";
import type { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
function serializeTenant(tenant: TenantDocument): TenantPublicView {
  const id = (tenant._id as unknown as Types.ObjectId)?.toString() ?? "";
  return {
    id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status as
      "active" | "trial" | "pending" | "pending_verification",
    plan: tenant.plan as "free" | "trial" | "pro",
    createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: tenant.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function listTenants(
  input: ListTenantsInput,
): Promise<ListTenantsResult> {
  const { page, pageSize, status, plan, search } = input;

  // Build filter object
  const filter: Record<string, unknown> = { slug: { $ne: "__documind_platform__" } };

  if (status) {
    filter.status = status;
  }

  if (plan) {
    filter.plan = plan;
  }

  if (search) {
    // Support search by name or slug using case-insensitive regex
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
    ];
  }

  // Get total count for pagination
  const totalRecords = await countTenantsByFilter(filter);

  // Fetch paginated results
  const tenants = await findTenantsByFilter(filter, page, pageSize);

  // Calculate pagination metadata
  const totalPages = Math.ceil(totalRecords / pageSize);

  return {
    tenants: tenants.map(serializeTenant),
    pagination: {
      page,
      pageSize,
      totalPages,
      totalRecords,
    },
  };
}

export async function updateTenant(
  input: UpdateTenantInput,
): Promise<UpdateTenantResult> {
  const { id, ...updateData } = input;

  const updatedTenant = await updateTenantById(id, updateData);

  if (!updatedTenant) {
    throw new AppError(404, "NOT_FOUND", "Tenant not found");
  }

  return serializeTenant(updatedTenant);
}
