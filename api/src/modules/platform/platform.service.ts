import { Types } from "mongoose";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentModel from "../../db/models/document.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import PlatformSettingModel from "../../db/models/platformSetting.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { isMongoConnected } from "../../db/connection.js";
import { isRedisConnected } from "../../db/redis.js";
import { getAuditWriter } from "../../common/observability/index.js";
import * as PackageService from "../billing/package.service.js";
import * as SubscriptionService from "../billing/subscription.service.js";
import type { SubscriptionStatus } from "../billing/billing.types.js";
import {
  LEGACY_PLATFORM_TENANT_SLUGS,
  PLATFORM_TENANT_SLUG,
} from "../../common/auth/platformTenant.js";
import {
  listPlatformAuditLogs,
  type AuditOperationContext,
} from "../audit/audit.service.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";

const tenantFilter = {
  isSystemTenant: { $ne: true },
  slug: { $nin: [PLATFORM_TENANT_SLUG, ...LEGACY_PLATFORM_TENANT_SLUGS] },
};

export async function getOverview(context: AuditOperationContext) {
  const recentAudit = (
    await listPlatformAuditLogs({ page: 1, pageSize: 8 }, context)
  ).logs;
  const [
    companies,
    activeCompanies,
    users,
    documents,
    questions,
    failedJobs,
    storage,
  ] = await Promise.all([
    TenantModel.countDocuments(tenantFilter),
    TenantModel.countDocuments({ ...tenantFilter, status: "active" }),
    UserModel.countDocuments({ role: { $ne: "SUPER_ADMIN" } }),
    DocumentModel.countDocuments(),
    UsageLogModel.countDocuments({ eventType: "QUESTION_ASKED" }),
    DocumentModel.countDocuments({ status: "failed" }),
    DocumentModel.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: "$fileSize" } } },
    ]),
  ]);
  return {
    metrics: {
      companies,
      activeCompanies,
      users,
      documents,
      questions,
      failedJobs,
      storageBytes: storage[0]?.total ?? 0,
      estimatedCost: Number((questions * 0.002).toFixed(2)),
    },
    recentAudit,
  };
}

/**
 * Delegated to {@link PackageService.listPackages}.
 */
export async function listPackages(context: OperationAuthorizationContext) {
  await authorizePlatformOperation(context, Permission.BILLING_READ);
  return PackageService.listPackages();
}

/**
 * Delegated to {@link PackageService.getPackage}.
 */
export async function getPackage(
  id: string,
  context: OperationAuthorizationContext,
) {
  await authorizePlatformOperation(context, Permission.BILLING_READ);
  return PackageService.getPackage(id);
}

/**
 * Create a package — delegates to {@link PackageService.createPackage}.
 *
 * Accepts all FR-PAY-001 fields (annualPrice, trialDays, visibility,
 * entitlements, supportedModels, analyticsLevel, retentionDays, supportLevel).
 */
export async function createPackage(
  input: {
    name: string;
    code: string;
    description: string;
    monthlyPrice: number;
    currency: string;
    entitlements: {
      employees: number;
      admins: number;
      documents: number;
      storageMb: number;
      fileSizeMb: number;
      queriesPerMonth: number;
      tokensPerMonth: number;
      ocrPagesPerMonth: number;
    };
    annualPrice?: number;
    trialDays?: number;
    visibility?: "public" | "internal";
    supportedModels?: string[];
    analyticsLevel?: "basic" | "advanced" | "enterprise";
    retentionDays?: number;
    supportLevel?: "community" | "standard" | "priority" | "dedicated";
  },
  context: OperationAuthorizationContext,
) {
  const actor = await authorizePlatformOperation(
    context,
    Permission.BILLING_MANAGE,
  );
  return PackageService.createPackage(input, {
    userId: actor.actorId,
    email: actor.actorEmail,
    role: actor.actorRole,
    tenantId: actor.tenantId,
  });
}

/**
 * Update a package — applies field changes then delegates version bump
 * to {@link PackageService.createVersion}.
 *
 * @deprecated Any field edit bumps the version. Use dedicated field-level
 * endpoints when they exist.
 *
 * Returns `{ ...updated, versionBumped: true }`.
 */
export async function updatePackage(
  id: string,
  input: Record<string, unknown>,
  context: OperationAuthorizationContext,
) {
  const actor = await authorizePlatformOperation(
    context,
    Permission.BILLING_MANAGE,
  );
  const existing = await PackageModel.findById(id).exec();
  if (!existing) throw new AppError(404, "NOT_FOUND", "Package not found");

  // Apply field changes before version bump
  Object.assign(existing, input);
  await existing.save();

  // Delegate version bump + snapshot to billing domain
  await PackageService.createVersion(id, {
    userId: actor.actorId,
    email: actor.actorEmail,
    role: actor.actorRole,
    tenantId: actor.tenantId,
  });

  // Re-read for full backward-compat document shape (includes _id, __v, virtuals)
  const updated = await PackageModel.findById(id).lean().exec();

  return { ...updated, versionBumped: true };
}

/**
 * Create a subscription — delegates to {@link SubscriptionService.createSubscription}.
 */
export async function createSubscription(
  tenantId: string,
  packageId: string,
  context: OperationAuthorizationContext,
) {
  const actor = await authorizePlatformOperation(
    context,
    Permission.BILLING_MANAGE,
  );
  const pkg = await PackageService.getPackage(packageId);
  return SubscriptionService.createSubscription(
    tenantId,
    packageId,
    pkg.version,
    "TRIALING",
    {
      userId: actor.actorId,
      email: actor.actorEmail,
      role: actor.actorRole,
      tenantId: actor.tenantId,
    },
  );
}

/**
 * List subscriptions — delegates to {@link SubscriptionService.listSubscriptions}
 * then populates tenant and package references for backward compat.
 */
export async function listSubscriptions(
  context: OperationAuthorizationContext,
  filter?: { status?: string },
) {
  await authorizePlatformOperation(context, Permission.BILLING_READ);
  const status = filter?.status?.toUpperCase() as SubscriptionStatus | undefined;
  const subs = await SubscriptionService.listSubscriptions(
    status ? { status } : undefined,
  );
  return SubscriptionModel.populate(subs, [
    { path: "tenantId", select: "name slug status" },
    { path: "packageId", select: "name code version monthlyPrice currency" },
  ]);
}

/**
 * Update (transition) a subscription — delegates to
 * {@link SubscriptionService.transitionSubscription}.
 *
 * Maps legacy lowercase status values to UPPERCASE model statuses.
 * Maps legacy `renewsAt` to `periodEnd`.
 */
export async function updateSubscription(
  tenantId: string,
  input: { packageId: string; status: string; renewsAt?: string | null },
  context: OperationAuthorizationContext,
) {
  const actor = await authorizePlatformOperation(
    context,
    Permission.BILLING_MANAGE,
  );
  // Validate tenant and package existence first
  const [tenant, pkg] = await Promise.all([
    TenantModel.findOne({ _id: tenantId, ...tenantFilter })
      .lean()
      .exec(),
    PackageModel.findOne({ _id: input.packageId, active: true }).lean().exec(),
  ]);
  if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant not found");
  if (!pkg) throw new AppError(404, "NOT_FOUND", "Active package not found");

  const status = input.status.toUpperCase() as SubscriptionStatus;

  return SubscriptionService.transitionSubscription(
    tenantId,
    status,
    {
      packageId: input.packageId,
      packageVersion: pkg.version,
      periodEnd: input.renewsAt ? new Date(input.renewsAt) : undefined,
      triggeredBy: "admin",
    },
    {
      userId: actor.actorId,
      email: actor.actorEmail,
      role: actor.actorRole,
      tenantId: actor.tenantId,
    },
  );
}

export async function listPlatformUsers(input: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}, context: OperationAuthorizationContext) {
  await authorizePlatformOperation(context, Permission.USERS_READ);
  const filter: Record<string, unknown> = { role: { $ne: "SUPER_ADMIN" } };
  if (input.status) filter.status = input.status;
  if (input.search)
    filter.$or = [
      { name: { $regex: input.search, $options: "i" } },
      { email: { $regex: input.search, $options: "i" } },
    ];
  const [users, totalRecords] = await Promise.all([
    UserModel.find(filter)
      .select("name email role status emailVerified tenantId createdAt")
      .populate("tenantId", "name slug")
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .lean()
      .exec(),
    UserModel.countDocuments(filter),
  ]);
  return {
    users,
    pagination: {
      ...input,
      totalRecords,
      totalPages: Math.ceil(totalRecords / input.pageSize),
    },
  };
}

export async function getUsage(context: OperationAuthorizationContext) {
  await authorizePlatformOperation(context, Permission.ANALYTICS_READ);
  const [byTenant, byDay, documents] = await Promise.all([
    UsageLogModel.aggregate([
      { $match: { eventType: "QUESTION_ASKED" } },
      { $group: { _id: "$tenantId", questions: { $sum: 1 } } },
      { $sort: { questions: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "tenants",
          localField: "_id",
          foreignField: "_id",
          as: "tenant",
        },
      },
      { $unwind: "$tenant" },
      {
        $project: {
          tenantId: "$_id",
          tenantName: "$tenant.name",
          questions: 1,
          estimatedCost: { $multiply: ["$questions", 0.002] },
        },
      },
    ]),
    UsageLogModel.aggregate([
      { $match: { eventType: "QUESTION_ASKED" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          questions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]),
    DocumentModel.aggregate([
      {
        $group: {
          _id: null,
          storageBytes: { $sum: "$fileSize" },
          documents: { $sum: 1 },
        },
      },
    ]),
  ]);
  return {
    byTenant,
    byDay,
    storage: documents[0] ?? { storageBytes: 0, documents: 0 },
  };
}

export async function listJobs(input: {
  page: number;
  pageSize: number;
  status?: string;
}, context: OperationAuthorizationContext) {
  await authorizePlatformOperation(context, Permission.DOCUMENTS_READ);
  const filter: Record<string, unknown> = {};
  if (input.status) filter.status = input.status;
  const [jobs, totalRecords] = await Promise.all([
    DocumentModel.find(filter)
      .select("tenantId fileName status createdAt updatedAt")
      .populate("tenantId", "name slug")
      .sort({ updatedAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .lean()
      .exec(),
    DocumentModel.countDocuments(filter),
  ]);
  return {
    jobs,
    pagination: {
      ...input,
      totalRecords,
      totalPages: Math.ceil(totalRecords / input.pageSize),
    },
  };
}

export async function getSystemHealth(context: OperationAuthorizationContext) {
  await authorizePlatformOperation(
    context,
    Permission.COMPANY_SETTINGS_READ,
  );
  return {
    status: isMongoConnected() && isRedisConnected() ? "healthy" : "degraded",
    services: [
      { name: "API", status: "healthy" },
      {
        name: "MongoDB",
        status: isMongoConnected() ? "healthy" : "unavailable",
      },
      { name: "Redis", status: isRedisConnected() ? "healthy" : "unavailable" },
      { name: "Background workers", status: "not_configured" },
    ],
    checkedAt: new Date().toISOString(),
  };
}

export async function listAudit(input: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}, context: AuditOperationContext) {
  return listPlatformAuditLogs(input, context);
}

export async function getSetting(
  key: string,
  context: OperationAuthorizationContext,
) {
  await authorizePlatformOperation(context, Permission.COMPANY_SETTINGS_READ);
  return sanitizeSettingValue(
    (await PlatformSettingModel.findOne({ key }).lean().exec())?.value ?? {}
  );
}

export async function updateSetting(
  key: string,
  value: Record<string, unknown>,
  context: OperationAuthorizationContext,
) {
  const actor = await authorizePlatformOperation(
    context,
    Permission.COMPANY_SETTINGS_UPDATE,
  );
  const setting = await PlatformSettingModel.findOneAndUpdate(
    { key },
    { $set: { value, updatedBy: new Types.ObjectId(actor.actorId) } },
    { upsert: true, returnDocument: "after", runValidators: true },
  )
    .lean()
    .exec();
  await getAuditWriter().write({
    action: "PLATFORM_SETTING_UPDATED",
    resourceType: "PlatformSetting",
    resourceId: key,
    changes: { changedFields: Object.keys(value).sort() },
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });
  return sanitizeSettingValue(setting?.value ?? value);
}

function sanitizeSettingValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeSettingValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      /(secret|password|token|api[-_]?key|private[-_]?key|credential)/i.test(key)
        ? "[REDACTED]"
        : sanitizeSettingValue(nested),
    ]),
  );
}
