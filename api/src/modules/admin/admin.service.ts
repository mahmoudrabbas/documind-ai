import {
  countTenantsByFilter,
  findTenantsByFilter,
  findTenantById,
  aggregateTenantStats,
  updateTenantById,
} from "./admin.repository.js";
import type {
  ListTenantsResult,
  TenantPublicView,
  ListTenantsInput,
  UpdateTenantInput,
  UpdateTenantResult,
} from "./admin.types.js";
import type { TenantDocument } from "../../db/models/tenant.model.js";
import type { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
function serializeTenant(
  tenant: TenantDocument,
  stats: TenantPublicView["stats"] = { users: 0, documents: 0, questions: 0 },
): TenantPublicView {
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
    stats,
  };
}

export async function listTenants(
  input: ListTenantsInput,
): Promise<ListTenantsResult> {
  const { page, pageSize, status, plan, search } = input;

  // Build filter object
  const filter: Record<string, unknown> = {
    isSystemTenant: { $ne: true },
    slug: { $nin: ["documind-ai", "__documind_platform__"] },
  };

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
  const counts = await aggregateTenantStats(
    tenants.map((tenant) => tenant._id),
  );

  // Calculate pagination metadata
  const totalPages = Math.ceil(totalRecords / pageSize);

  return {
    tenants: tenants.map((tenant) => {
      const id = tenant._id.toString();
      return serializeTenant(tenant, {
        users: counts.users.get(id) ?? 0,
        documents: counts.documents.get(id) ?? 0,
        questions: counts.questions.get(id) ?? 0,
      });
    }),
    pagination: {
      page,
      pageSize,
      totalPages,
      totalRecords,
    },
  };
}

export async function getTenant(id: string): Promise<TenantPublicView> {
  const tenant = await findTenantById(id);
  if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant not found");
  const counts = await aggregateTenantStats([tenant._id]);
  return serializeTenant(tenant, {
    users: counts.users.get(id) ?? 0,
    documents: counts.documents.get(id) ?? 0,
    questions: counts.questions.get(id) ?? 0,
  });
}

export async function updateTenant(
  input: UpdateTenantInput,
): Promise<UpdateTenantResult> {
  const { id, ...updateData } = input;

  const updatedTenant = await updateTenantById(id, updateData);

  if (!updatedTenant) {
    throw new AppError(404, "NOT_FOUND", "Tenant not found");
  }

  const counts = await aggregateTenantStats([updatedTenant._id]);
  return serializeTenant(updatedTenant, {
    users: counts.users.get(id) ?? 0,
    documents: counts.documents.get(id) ?? 0,
    questions: counts.questions.get(id) ?? 0,
  });
}
