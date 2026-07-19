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
import { getAuditWriter } from "../../common/observability/index.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import {
  LEGACY_PLATFORM_TENANT_SLUGS,
  PLATFORM_TENANT_SLUG,
} from "../../common/auth/platformTenant.js";
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
  context: OperationAuthorizationContext,
): Promise<ListTenantsResult> {
  await authorizePlatformOperation(context, Permission.COMPANY_SETTINGS_READ);
  const { page, pageSize, status, plan, search } = input;

  // Build filter object
  const filter: Record<string, unknown> = {
    isSystemTenant: { $ne: true },
    slug: { $nin: [PLATFORM_TENANT_SLUG, ...LEGACY_PLATFORM_TENANT_SLUGS] },
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

export async function getTenant(
  id: string,
  context: OperationAuthorizationContext,
): Promise<TenantPublicView> {
  await authorizePlatformOperation(context, Permission.COMPANY_SETTINGS_READ);
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
  context: OperationAuthorizationContext,
): Promise<UpdateTenantResult> {
  const actor = await authorizePlatformOperation(
    context,
    Permission.COMPANY_SETTINGS_UPDATE,
  );
  await authorizePlatformOperation(context, Permission.BILLING_MANAGE);
  const { id, ...updateData } = input;

  const updatedTenant = await updateTenantById(id, updateData);

  if (!updatedTenant) {
    throw new AppError(404, "NOT_FOUND", "Tenant not found");
  }

  await getAuditWriter().write({
    tenantId: updatedTenant._id.toString(),
    resourceType: "Tenant",
    resourceId: id,
    action: "TENANT_UPDATED",
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
    changes: updateData,
    metadata: { traceId: actor.traceId, requestId: actor.requestId },
  });

  const counts = await aggregateTenantStats([updatedTenant._id]);
  return serializeTenant(updatedTenant, {
    users: counts.users.get(id) ?? 0,
    documents: counts.documents.get(id) ?? 0,
    questions: counts.questions.get(id) ?? 0,
  });
}
