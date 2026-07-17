import { Types } from "mongoose";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentModel from "../../db/models/document.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import PlatformSettingModel from "../../db/models/platformSetting.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { isMongoConnected } from "../../db/connection.js";
import { isRedisConnected } from "../../db/redis.js";
import type { AuthIdentity } from "../auth/auth.types.js";
import { getAuditWriter } from "../../common/observability/index.js";
import * as PackageService from "../billing/package.service.js";
import * as SubscriptionService from "../billing/subscription.service.js";
import type { SubscriptionStatus } from "../billing/billing.types.js";

const tenantFilter = {
  isSystemTenant: { $ne: true },
  slug: { $nin: ["documind-ai", "__documind_platform__"] },
};

export async function getOverview() {
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
  const recentAudit = await AuditLogModel.find()
    .sort({ createdAt: -1 })
    .limit(8)
    .lean()
    .exec();
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
export async function listPackages() {
  return PackageService.listPackages();
}

/**
 * Delegated to {@link PackageService.getPackage}.
 */
export async function getPackage(id: string) {
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
  actor: AuthIdentity,
) {
  return PackageService.createPackage(input, {
    userId: actor.userId,
    email: actor.email,
    role: actor.role,
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
  actor: AuthIdentity,
) {
  const existing = await PackageModel.findById(id).exec();
  if (!existing) throw new AppError(404, "NOT_FOUND", "Package not found");

  // Apply field changes before version bump
  Object.assign(existing, input);
  await existing.save();

  // Delegate version bump + snapshot to billing domain
  const { package: snapshot } = await PackageService.createVersion(id, {
    userId: actor.userId,
    email: actor.email,
    role: actor.role,
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
  actor: AuthIdentity,
) {
  const pkg = await PackageService.getPackage(packageId);
  return SubscriptionService.createSubscription(
    tenantId,
    packageId,
    pkg.version,
    "TRIALING",
    { userId: actor.userId, email: actor.email, role: actor.role },
  );
}

/**
 * List subscriptions — delegates to {@link SubscriptionService.listSubscriptions}
 * then populates tenant and package references for backward compat.
 */
export async function listSubscriptions(filter?: { status?: string }) {
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
  actor: AuthIdentity,
) {
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
    { userId: actor.userId, email: actor.email, role: actor.role },
  );
}

export async function listPlatformUsers(input: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}) {
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

export async function getUsage() {
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
}) {
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

export function getSystemHealth() {
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
}) {
  const filter: Record<string, unknown> = {};
  if (input.status) filter.action = input.status;
  if (input.search)
    filter.$or = [
      { actorEmail: { $regex: input.search, $options: "i" } },
      { action: { $regex: input.search, $options: "i" } },
      { resourceType: { $regex: input.search, $options: "i" } },
    ];
  const [logs, totalRecords] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .lean()
      .exec(),
    AuditLogModel.countDocuments(filter),
  ]);
  return {
    logs,
    pagination: {
      ...input,
      totalRecords,
      totalPages: Math.ceil(totalRecords / input.pageSize),
    },
  };
}

export async function getSetting(key: string) {
  return (
    (await PlatformSettingModel.findOne({ key }).lean().exec())?.value ?? {}
  );
}

export async function updateSetting(
  key: string,
  value: Record<string, unknown>,
  actor: AuthIdentity,
) {
  const setting = await PlatformSettingModel.findOneAndUpdate(
    { key },
    { $set: { value, updatedBy: new Types.ObjectId(actor.userId) } },
    { upsert: true, new: true, runValidators: true },
  )
    .lean()
    .exec();
  await getAuditWriter().write({
    action: "PLATFORM_SETTING_UPDATED",
    resourceType: "PlatformSetting",
    resourceId: key,
    changes: value,
    tenantId: "system",
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
  });
  return setting?.value ?? value;
}
