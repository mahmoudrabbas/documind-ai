import {
  countTenantsByFilter,
  findTenantsByFilter,
  findTenantById,
  findAnyTenantById,
  aggregateTenantStats,
  updateTenantById,
  aggregateUserSummary,
  findSubscriptionForTenant,
  countDocumentsForTenant,
  sumStorageForTenant,
  findRecentAuditForTenant,
  atomicStatusTransition,
  findTenantIdsByEffectivePackage,
  findEffectiveSubscriptionsForTenants,
} from "./admin.repository.js";
import type {
  ListTenantsResult,
  TenantPublicView,
  ListTenantsInput,
  UpdateTenantInput,
  UpdateTenantResult,
  TenantDetailView,
  TenantLifecycleInput,
  TenantLifecyclePreview,
  TenantLifecycleResult,
  TenantPreviewInput,
  TenantLifecycleStatus,
  TenantLifecycleTargetStatus,
} from "./admin.types.js";
import type { TenantDocument } from "../../db/models/tenant.model.js";
import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import {
  isLegacyPlatformTenantSlug,
  isPlatformTenantSlug,
  PLATFORM_TENANT_SLUG,
} from "../../common/auth/platformTenant.js";
import { LEGACY_PLATFORM_TENANT_SLUGS } from "../../common/auth/platformTenant.js";
import {
  TENANT_INVALID_TRANSITION,
  TENANT_PROTECTED,
} from "../../common/errors/errorCodes.js";
import { randomUUID } from "node:crypto";
import { notifyCompanyLifecycleTransition } from "./admin.lifecycleNotifications.js";

function serializeTenant(
  tenant: TenantDocument,
  stats: TenantPublicView["stats"] = { users: 0, documents: 0, questions: 0 },
  effectivePackage: {
    packageId: string | null;
    packageName: string | null;
    status: string | null;
  } = {
    packageId: null,
    packageName: null,
    status: null,
  },
): TenantPublicView {
  const id = (tenant._id as unknown as Types.ObjectId)?.toString() ?? "";
  return {
    id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status as TenantLifecycleStatus,
    plan: tenant.plan as "free" | "trial" | "pro",
    effectivePackageId: effectivePackage.packageId,
    effectivePackageName: effectivePackage.packageName,
    effectiveSubscriptionStatus: effectivePackage.status,
    createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: tenant.updatedAt?.toISOString() ?? new Date().toISOString(),
    stats,
  };
}

const VALID_SUSPEND_TRANSITIONS: Record<string, string> = {
  active: "suspended",
  trial: "suspended",
  pending: "suspended",
  pending_verification: "suspended",
};

const VALID_REINSTATE_TRANSITIONS: Record<string, string> = {
  suspended: "active",
};

function isProtectedTenant(tenant: TenantDocument): boolean {
  return (
    tenant.isSystemTenant === true ||
    isPlatformTenantSlug(tenant.slug) ||
    isLegacyPlatformTenantSlug(tenant.slug)
  );
}

export async function listTenants(
  input: ListTenantsInput,
  context: OperationAuthorizationContext,
): Promise<ListTenantsResult> {
  await authorizePlatformOperation(context, Permission.COMPANY_SETTINGS_READ);
  const { page, pageSize, status, plan, packageId, search } = input;

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

  // Authoritative Companies Plan filter: restrict to tenants whose current
  // effective subscription references `packageId`. This is independent of the
  // legacy `tenant.plan` field and is applied before pagination so totals are
  // computed against the filtered result set.
  if (packageId) {
    const tenantIds = await findTenantIdsByEffectivePackage(
      new Types.ObjectId(packageId),
    );
    if (tenantIds.length === 0) {
      return {
        tenants: [],
        pagination: { page, pageSize, totalPages: 0, totalRecords: 0 },
      };
    }
    filter._id = { $in: tenantIds };
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
    ];
  }

  const totalRecords = await countTenantsByFilter(filter);
  if (totalRecords === 0) {
    return {
      tenants: [],
      pagination: { page, pageSize, totalPages: 0, totalRecords: 0 },
    };
  }
  const tenants = await findTenantsByFilter(filter, page, pageSize);
  const counts = await aggregateTenantStats(
    tenants.map((tenant) => tenant._id),
  );
  const totalPages = Math.ceil(totalRecords / pageSize);

  const effectiveSubscriptions = await findEffectiveSubscriptionsForTenants(
    tenants.map((tenant) => tenant._id),
  );

  return {
    tenants: tenants.map((tenant) => {
      const id = tenant._id.toString();
      return serializeTenant(
        tenant,
        {
          users: counts.users.get(id) ?? 0,
          documents: counts.documents.get(id) ?? 0,
          questions: counts.questions.get(id) ?? 0,
        },
        effectiveSubscriptions.get(id) ?? {
          packageId: null,
          packageName: null,
          status: null,
        },
      );
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

export async function getTenantDetail(
  id: string,
  context: OperationAuthorizationContext,
): Promise<TenantDetailView> {
  await authorizePlatformOperation(context, Permission.COMPANY_SETTINGS_READ);
  const tenant = await findAnyTenantById(id);
  if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant not found");
  if (isProtectedTenant(tenant)) {
    throw new AppError(403, TENANT_PROTECTED, "Cannot view protected system tenant");
  }

  const tenantId = tenant._id.toString();
  const [userSummary, subscription, documentCount, storageBytes, recentAudit] =
    await Promise.all([
      aggregateUserSummary(tenantId),
      findSubscriptionForTenant(tenantId),
      countDocumentsForTenant(tenantId),
      sumStorageForTenant(tenantId),
      findRecentAuditForTenant(tenantId, 10),
    ]);

  let packageSummary: TenantDetailView["package"] = null;
  if (
    subscription &&
    subscription.packageId &&
    typeof subscription.packageId === "object" &&
    "_id" in subscription.packageId
  ) {
    const pkg = subscription.packageId as unknown as {
      _id: Types.ObjectId;
      name: string;
      code: string;
      version: number;
      entitlements: TenantDetailView["package"] extends { entitlements: infer E }
        ? E
        : never;
    };
    packageSummary = {
      packageId: pkg._id.toString(),
      packageName: pkg.name,
      packageCode: pkg.code,
      packageVersion: pkg.version,
      entitlements: pkg.entitlements ?? null,
    };
  }

  let subscriptionSummary: TenantDetailView["subscription"] = null;
  if (subscription) {
    subscriptionSummary = {
      subscriptionId: (subscription._id as Types.ObjectId).toString(),
      status: subscription.status,
      provider: subscription.providerSubscriptionId ? "stripe" : "none",
      periodStart: subscription.periodStart?.toISOString() ?? null,
      periodEnd: subscription.periodEnd?.toISOString() ?? null,
      trialEnd: subscription.trialEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
    };
  }

  return {
    id: tenantId,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status as TenantLifecycleStatus,
    plan: tenant.plan as "free" | "trial" | "pro",
    isSystemTenant: tenant.isSystemTenant,
    createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: tenant.updatedAt?.toISOString() ?? new Date().toISOString(),
    users: userSummary,
    package: packageSummary,
    subscription: subscriptionSummary,
    usage: {
      documents: documentCount,
      storageBytes,
      questions: (
        await aggregateTenantStats([tenant._id])
      ).questions.get(tenantId) ?? 0,
    },
    recentAudit: recentAudit.map((entry) => ({
      id: (entry._id as Types.ObjectId).toString(),
      action: entry.action,
      actorEmail: entry.actorEmail ?? null,
      actorRole: entry.actorRole ?? null,
      outcome: entry.outcome,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export async function previewTenantLifecycle(
  input: TenantPreviewInput,
  targetStatus: TenantLifecycleTargetStatus,
  context: OperationAuthorizationContext,
): Promise<TenantLifecyclePreview> {
  await authorizePlatformOperation(context, Permission.COMPANY_SETTINGS_READ);
  const tenant = await findAnyTenantById(input.id);
  if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant not found");
  if (isProtectedTenant(tenant)) {
    throw new AppError(403, TENANT_PROTECTED, "Cannot modify protected system tenant");
  }

  const tenantId = tenant._id.toString();
  const currentStatus = tenant.status as TenantLifecycleStatus;

  const validTransitions =
    targetStatus === "suspended"
      ? VALID_SUSPEND_TRANSITIONS
      : VALID_REINSTATE_TRANSITIONS;
  const alreadyInTargetState = currentStatus === targetStatus;
  const transitionAllowed =
    alreadyInTargetState || validTransitions[currentStatus] === targetStatus;

  const [userSummary, subscription, documentCount] = await Promise.all([
    aggregateUserSummary(tenantId),
    findSubscriptionForTenant(tenantId),
    countDocumentsForTenant(tenantId),
  ]);

  const warnings: string[] = [];
  const blockingReasons: string[] = [];

  if (alreadyInTargetState) {
    warnings.push(`Tenant is already ${targetStatus}. No status change is required.`);
  } else if (transitionAllowed) {
    if (targetStatus === "suspended") {
      warnings.push("All user access to this tenant will be blocked.");
      warnings.push(
        "New registrations and invitations for this tenant will be unavailable.",
      );
      warnings.push("Tenant operations will be restricted.");
    } else {
      warnings.push(
        "User access will be restored. Verify that subscription and billing are in order.",
      );
    }
  } else {
    blockingReasons.push(
      `Transition from "${currentStatus}" to "${targetStatus}" is not allowed.`,
    );
  }

  return {
    tenantId,
    tenantName: tenant.name,
    currentStatus,
    targetStatus,
    transitionAllowed,
    alreadyInTargetState,
    totalUsersAffected: userSummary.total,
    activeUsersAffected: userSummary.active,
    activeCompanyAdminsAffected: userSummary.companyAdmins,
    currentSubscriptionStatus: subscription?.status ?? null,
    documentCount,
    warnings,
    blockingReasons,
  };
}

export async function suspendTenant(
  input: TenantLifecycleInput,
  context: OperationAuthorizationContext,
): Promise<TenantLifecycleResult> {
  const actor = await authorizePlatformOperation(
    context,
    Permission.COMPANY_SETTINGS_UPDATE,
  );

  const tenant = await findAnyTenantById(input.id);
  if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant not found");
  if (isProtectedTenant(tenant)) {
    throw new AppError(403, TENANT_PROTECTED, "Cannot suspend protected system tenant");
  }

  const currentStatus = tenant.status;
  if (currentStatus === "suspended") {
    return {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      status: "suspended",
      plan: tenant.plan as "free" | "trial" | "pro",
      createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: tenant.updatedAt?.toISOString() ?? new Date().toISOString(),
      alreadyInTargetState: true,
    };
  }

  const targetStatus = VALID_SUSPEND_TRANSITIONS[currentStatus];
  if (!targetStatus) {
    throw new AppError(
      409,
      TENANT_INVALID_TRANSITION,
      `Cannot suspend tenant from status "${currentStatus}"`,
    );
  }

  const updated = await atomicStatusTransition(input.id, currentStatus, "suspended");
  if (!updated) {
    throw new AppError(
      409,
      TENANT_INVALID_TRANSITION,
      "Tenant status changed concurrently. Please retry.",
    );
  }

  const transitionId = randomUUID();

  await getAuditWriter().write({
    tenantId: input.id,
    resourceType: "Tenant",
    resourceId: input.id,
    action: "TENANT_SUSPENDED",
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
    changes: { previousStatus: currentStatus, newStatus: "suspended", reason: input.reason },
    metadata: { traceId: actor.traceId, requestId: actor.requestId, transitionId },
  });

  // Trigger notification AFTER the transition is applied and audited. Email
  // enqueue failures are logged and swallowed by the helper, so a provider or
  // queue problem can never fail an already-completed suspension.
  await notifyCompanyLifecycleTransition({
    tenantId: input.id,
    companyName: updated.name,
    transition: "suspended",
    eventId: transitionId,
    reason: input.reason,
    effectiveDate: updated.updatedAt?.toISOString(),
    language: tenant.settings?.defaultLanguage,
    actorId: actor.actorId,
    correlationId: actor.requestId,
  });

  return {
    id: updated._id.toString(),
    name: updated.name,
    slug: updated.slug,
    status: "suspended",
    plan: updated.plan as "free" | "trial" | "pro",
    createdAt: updated.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: updated.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function reinstateTenant(
  input: TenantLifecycleInput,
  context: OperationAuthorizationContext,
): Promise<TenantLifecycleResult> {
  const actor = await authorizePlatformOperation(
    context,
    Permission.COMPANY_SETTINGS_UPDATE,
  );

  const tenant = await findAnyTenantById(input.id);
  if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant not found");
  if (isProtectedTenant(tenant)) {
    throw new AppError(403, TENANT_PROTECTED, "Cannot reinstate protected system tenant");
  }

  const currentStatus = tenant.status;
  if (currentStatus === "active") {
    return {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      status: "active",
      plan: tenant.plan as "free" | "trial" | "pro",
      createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: tenant.updatedAt?.toISOString() ?? new Date().toISOString(),
      alreadyInTargetState: true,
    };
  }

  const targetStatus = VALID_REINSTATE_TRANSITIONS[currentStatus];
  if (!targetStatus) {
    throw new AppError(
      409,
      TENANT_INVALID_TRANSITION,
      `Cannot reinstate tenant from status "${currentStatus}"`,
    );
  }

  const updated = await atomicStatusTransition(input.id, currentStatus, "active");
  if (!updated) {
    throw new AppError(
      409,
      TENANT_INVALID_TRANSITION,
      "Tenant status changed concurrently. Please retry.",
    );
  }

  const transitionId = randomUUID();

  await getAuditWriter().write({
    tenantId: input.id,
    resourceType: "Tenant",
    resourceId: input.id,
    action: "TENANT_REINSTATED",
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
    changes: { previousStatus: currentStatus, newStatus: "active", reason: input.reason },
    metadata: { traceId: actor.traceId, requestId: actor.requestId, transitionId },
  });

  // Trigger notification AFTER the transition is applied and audited. Email
  // enqueue failures are logged and swallowed by the helper, so a provider or
  // queue problem can never fail an already-completed reactivation.
  await notifyCompanyLifecycleTransition({
    tenantId: input.id,
    companyName: updated.name,
    transition: "reactivated",
    eventId: transitionId,
    reason: input.reason,
    effectiveDate: updated.updatedAt?.toISOString(),
    language: tenant.settings?.defaultLanguage,
    actorId: actor.actorId,
    correlationId: actor.requestId,
  });

  return {
    id: updated._id.toString(),
    name: updated.name,
    slug: updated.slug,
    status: "active",
    plan: updated.plan as "free" | "trial" | "pro",
    createdAt: updated.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: updated.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
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
