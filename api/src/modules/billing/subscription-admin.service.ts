import { createHash } from "node:crypto";
import { Types } from "mongoose";
import SubscriptionModel from "../../db/models/subscription.model.js";
import PackageModel, { type PackageEntitlements } from "../../db/models/package.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  PACKAGE_NOT_FOUND,
  SUBSCRIPTION_ALREADY_EXISTS,
  SUBSCRIPTION_IDEMPOTENCY_CONFLICT,
  SUBSCRIPTION_INVALID_TRANSITION,
  SUBSCRIPTION_NO_CHANGE,
  SUBSCRIPTION_NOT_FOUND,
  SUBSCRIPTION_PACKAGE_INACTIVE,
  SUBSCRIPTION_PROTECTED_TENANT,
  SUBSCRIPTION_PROVIDER_ACTION_REQUIRED,
  SUBSCRIPTION_STALE_VERSION,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { LEGACY_PLATFORM_TENANT_SLUGS, PLATFORM_TENANT_SLUG } from "../../common/auth/platformTenant.js";
import { firePlanChangeHooks, LEGAL_TRANSITIONS } from "./subscription.service.js";
import type { SubscriptionStatus } from "./billing.types.js";
import type { BillingActor } from "./package.service.js";

export type AdminSubscriptionAction = "provision" | "update";

export interface AdminSubscriptionMutation {
  expectedVersion: number;
  reason: string;
  packageId?: string;
  status?: SubscriptionStatus;
}

type ExistingSubscription = {
  _id: unknown;
  tenantId: unknown;
  packageId: unknown;
  packageVersion: number;
  status: SubscriptionStatus;
  revision?: number;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerPriceId?: string;
  paymentState?: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: string;
  cancelAtPeriodEnd?: boolean;
  renewsAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  adminOperations?: Array<{
    keyHash: string; payloadHash: string; resultingRevision: number;
    resultingPackageId: unknown; resultingPackageVersion: number; resultingStatus: SubscriptionStatus;
  }>;
};

type TargetPackage = {
  _id: Types.ObjectId;
  name: string;
  code: string;
  version: number;
  active: boolean;
  trialDays: number;
  entitlements: PackageEntitlements;
};

const targetTenantFilter = {
  isSystemTenant: { $ne: true },
  slug: { $nin: [PLATFORM_TENANT_SLUG, ...LEGACY_PLATFORM_TENANT_SLUGS] },
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const fingerprint = (tenantId: string, input: AdminSubscriptionMutation) =>
  hash(JSON.stringify({ tenantId, expectedVersion: input.expectedVersion, packageId: input.packageId ?? null, status: input.status ?? null, reason: input.reason }));

function isDuplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 11000);
}

function hasProviderOwnership(subscription: ExistingSubscription): boolean {
  return Boolean(subscription.providerCustomerId || subscription.providerSubscriptionId || subscription.providerPriceId);
}

export function decideAdminSubscriptionOperation(
  action: AdminSubscriptionAction,
  existing: ExistingSubscription | null,
  targetPackage: TargetPackage | null,
  input: AdminSubscriptionMutation,
) {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  if (action === "provision" && existing) blockingReasons.push("Tenant already has a subscription.");
  if (action === "update" && !existing) blockingReasons.push("Tenant does not have a subscription.");
  if (action === "provision" && input.expectedVersion !== 0) blockingReasons.push("Provisioning expected version must be 0.");
  if (action === "update" && existing && (existing.revision ?? 0) !== input.expectedVersion) blockingReasons.push("Subscription version is stale.");
  if (!targetPackage && input.packageId) blockingReasons.push("Target package was not found.");
  if (targetPackage && !targetPackage.active) blockingReasons.push("Target package is archived or inactive.");

  const packageChanged = Boolean(existing && targetPackage && String(existing.packageId) !== String(targetPackage._id));
  const statusChanged = Boolean(existing && input.status && existing.status !== input.status);
  if (existing && hasProviderOwnership(existing) && (packageChanged || statusChanged)) {
    blockingReasons.push("Provider-managed subscriptions must be changed through the billing provider.");
  }
  if (existing && input.status && statusChanged && !LEGAL_TRANSITIONS[existing.status].includes(input.status)) {
    blockingReasons.push(`Illegal subscription transition: ${existing.status} → ${input.status}.`);
  }
  if (action === "update" && existing && !packageChanged && !statusChanged) {
    blockingReasons.push("The request does not change the subscription.");
  }
  if (packageChanged) warnings.push("The assigned immutable package version and entitlements will change immediately.");
  if (statusChanged) warnings.push("The subscription lifecycle status will be overridden administratively.");
  return {
    packageChanged,
    statusChanged,
    providerManaged: existing ? hasProviderOwnership(existing) : false,
    operationMode: existing && hasProviderOwnership(existing) ? "provider-managed" as const : "local-only" as const,
    warnings,
    blockingReasons,
    transitionAllowed: blockingReasons.length === 0,
  };
}

async function loadTarget(tenantId: string, packageId?: string) {
  const [tenant, subscription, targetPackage] = await Promise.all([
    TenantModel.findOne({ _id: tenantId, ...targetTenantFilter }).select("name slug status").lean().exec(),
    SubscriptionModel.findOne({ tenantId }).select("+adminOperations").lean().exec(),
    packageId ? PackageModel.findById(packageId).lean().exec() : Promise.resolve(null),
  ]);
  if (!tenant) throw new AppError(404, SUBSCRIPTION_PROTECTED_TENANT, "Tenant not found or protected");
  return { tenant, subscription: subscription as ExistingSubscription | null, targetPackage: targetPackage as TargetPackage | null };
}

function throwDecision(decision: ReturnType<typeof decideAdminSubscriptionOperation>, input: AdminSubscriptionMutation) {
  const first = decision.blockingReasons[0] ?? "Subscription operation is blocked";
  if (first.includes("already has")) throw new AppError(409, SUBSCRIPTION_ALREADY_EXISTS, first);
  if (first.includes("does not have")) throw new AppError(404, SUBSCRIPTION_NOT_FOUND, first);
  if (first.includes("not found")) throw new AppError(404, PACKAGE_NOT_FOUND, first);
  if (first.includes("archived")) throw new AppError(409, SUBSCRIPTION_PACKAGE_INACTIVE, first);
  if (first.includes("provider")) throw new AppError(409, SUBSCRIPTION_PROVIDER_ACTION_REQUIRED, first);
  if (first.includes("version")) throw new AppError(409, SUBSCRIPTION_STALE_VERSION, first);
  if (first.includes("Illegal")) throw new AppError(409, SUBSCRIPTION_INVALID_TRANSITION, first, { legalTransitions: input.status ? undefined : [] });
  throw new AppError(409, SUBSCRIPTION_NO_CHANGE, first);
}

function replayOrConflict(existing: ExistingSubscription, keyHash: string, payloadHash: string) {
  const operation = existing.adminOperations?.find((entry) => entry.keyHash === keyHash);
  if (!operation) return null;
  if (operation.payloadHash !== payloadHash) {
    throw new AppError(409, SUBSCRIPTION_IDEMPOTENCY_CONFLICT, "Idempotency key was used for another subscription request");
  }
  return operation;
}

function replayResult(existing: ExistingSubscription, operation: NonNullable<ExistingSubscription["adminOperations"]>[number]) {
  return {
    ...sanitizeSubscription(existing),
    packageId: operation.resultingPackageId,
    packageVersion: operation.resultingPackageVersion,
    status: operation.resultingStatus,
    version: operation.resultingRevision,
    idempotentReplay: true,
  };
}

async function writeAudit(action: "SUBSCRIPTION_PROVISIONED" | "SUBSCRIPTION_PACKAGE_CHANGED" | "SUBSCRIPTION_STATUS_OVERRIDDEN" | "SUBSCRIPTION_COMBINED_UPDATED", subscription: ExistingSubscription, previous: ExistingSubscription | null, reason: string, keyHash: string, actor: BillingActor) {
  await getAuditWriter().write({
    action,
    resourceType: "Subscription",
    resourceId: String(subscription._id),
    tenantId: actor.tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    actorKind: "USER",
    outcome: "SUCCESS",
    changes: {
      targetTenantId: String(subscription.tenantId),
      previousPackageId: previous ? String(previous.packageId) : null,
      previousPackageVersion: previous?.packageVersion ?? null,
      newPackageId: String(subscription.packageId),
      newPackageVersion: subscription.packageVersion,
      previousStatus: previous?.status ?? null,
      newStatus: subscription.status,
      reason,
      triggeredBy: "admin",
      idempotencyReference: keyHash,
    },
    metadata: { traceId: actor.traceId, requestId: actor.requestId },
  });
}

async function writeDeniedAudit(tenantId: string, subscription: ExistingSubscription | null, reason: string, keyHash: string, blockingReasons: string[], actor: BillingActor) {
  await getAuditWriter().write({
    action: "SUBSCRIPTION_OVERRIDE_DENIED", resourceType: "Subscription",
    resourceId: subscription ? String(subscription._id) : tenantId,
    tenantId: actor.tenantId, actorId: actor.userId, actorEmail: actor.email,
    actorRole: actor.role, actorKind: "USER", outcome: "DENIED",
    changes: { targetTenantId: tenantId, reason, blockingReasons, triggeredBy: "admin", idempotencyReference: keyHash },
    metadata: { traceId: actor.traceId, requestId: actor.requestId },
  });
}

export async function getAdminSubscriptionDetail(tenantId: string) {
  const { tenant, subscription } = await loadTarget(tenantId);
  if (!subscription) return { tenant, subscription: null, legalTransitions: [] };
  const populated = await SubscriptionModel.populate(subscription, [
    { path: "packageId", select: "name code version entitlements active" },
  ]);
  return {
    tenant,
    subscription: { ...sanitizeSubscription(populated as unknown as ExistingSubscription), tenantId: tenant },
    legalTransitions: [...LEGAL_TRANSITIONS[subscription.status]],
  };
}

export async function previewAdminSubscriptionOperation(tenantId: string, action: AdminSubscriptionAction, input: Omit<AdminSubscriptionMutation, "reason">) {
  const normalized = { ...input, reason: "preview" };
  const { tenant, subscription, targetPackage } = await loadTarget(tenantId, input.packageId);
  const decision = decideAdminSubscriptionOperation(action, subscription, targetPackage, normalized);
  const currentPackage = subscription ? await packageSummary(subscription.packageId, subscription.packageVersion) : null;
  const entitlementChanges = entitlementDelta(currentPackage?.entitlements, targetPackage?.entitlements);
  return {
    tenant,
    subscription: subscription ? sanitizeSubscription(subscription) : null,
    targetPackage: targetPackage ? { id: String(targetPackage._id), name: targetPackage.name, code: targetPackage.code, version: targetPackage.version, entitlements: targetPackage.entitlements } : null,
    currentPackage,
    entitlementChanges,
    legalTransitions: subscription ? [...LEGAL_TRANSITIONS[subscription.status]] : [],
    ...decision,
    checkoutOrProviderActionRequired: decision.providerManaged && (decision.packageChanged || decision.statusChanged),
  };
}

function entitlementDelta(current?: PackageEntitlements, target?: PackageEntitlements) {
  if (!target) return [];
  return (Object.keys(target) as Array<keyof PackageEntitlements>).map((key) => {
    const from = current?.[key] ?? 0;
    const to = target[key];
    return { entitlement: key, from, to, direction: to === from ? "unchanged" as const : to > from ? "increase" as const : "decrease" as const };
  });
}

async function packageSummary(packageId: unknown, version: number) {
  const pkg = await PackageModel.findById(packageId).lean().exec();
  if (!pkg) return null;
  const snapshot = pkg.versions?.find((entry) => entry.version === version);
  return { id: String(pkg._id), name: snapshot?.name ?? pkg.name, code: pkg.code, version, entitlements: snapshot?.entitlements ?? pkg.entitlements };
}

export async function provisionAdminSubscription(tenantId: string, input: AdminSubscriptionMutation & { packageId: string; status: "TRIALING" | "ACTIVE" }, idempotencyKey: string, actor: BillingActor) {
  const keyHash = hash(idempotencyKey);
  const payloadHash = fingerprint(tenantId, input);
  const loaded = await loadTarget(tenantId, input.packageId);
  if (loaded.subscription) {
    const replay = replayOrConflict(loaded.subscription, keyHash, payloadHash);
    if (replay) return replayResult(loaded.subscription, replay);
  }
  const decision = decideAdminSubscriptionOperation("provision", loaded.subscription, loaded.targetPackage, input);
  if (!decision.transitionAllowed) {
    await writeDeniedAudit(tenantId, loaded.subscription, input.reason, keyHash, decision.blockingReasons, actor);
    throwDecision(decision, input);
  }
  if (input.expectedVersion !== 0) throw new AppError(409, SUBSCRIPTION_STALE_VERSION, "A missing subscription has expectedVersion 0");
  const pkg = loaded.targetPackage!;
  if (input.status === "TRIALING" && pkg.trialDays <= 0) throw new AppError(409, SUBSCRIPTION_INVALID_TRANSITION, "The selected package does not support a trial");
  const now = new Date();
  try {
    const created = new SubscriptionModel({
      tenantId: new Types.ObjectId(tenantId), packageId: pkg._id, packageVersion: pkg.version,
      status: input.status, startedAt: now,
      trialStart: input.status === "TRIALING" ? now : null,
      trialEnd: input.status === "TRIALING" ? new Date(now.getTime() + pkg.trialDays * 86_400_000) : null,
      adminOperations: [{ keyHash, payloadHash, resultingRevision: 1, resultingPackageId: pkg._id, resultingPackageVersion: pkg.version, resultingStatus: input.status, createdAt: now }],
    });
    await created.save();
    const value = created.toObject() as unknown as ExistingSubscription;
    await writeAudit("SUBSCRIPTION_PROVISIONED", value, null, input.reason, keyHash, actor);
    return { ...sanitizeSubscription(value), idempotentReplay: false };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const existing = await SubscriptionModel.findOne({ tenantId }).select("+adminOperations").lean().exec() as ExistingSubscription | null;
    if (existing) {
      const replay = replayOrConflict(existing, keyHash, payloadHash);
      if (replay) return replayResult(existing, replay);
    }
    throw new AppError(409, SUBSCRIPTION_ALREADY_EXISTS, "Tenant already has a subscription");
  }
}

export async function updateAdminSubscription(tenantId: string, input: AdminSubscriptionMutation, idempotencyKey: string, actor: BillingActor) {
  const keyHash = hash(idempotencyKey);
  const payloadHash = fingerprint(tenantId, input);
  const loaded = await loadTarget(tenantId, input.packageId);
  if (!loaded.subscription) throw new AppError(404, SUBSCRIPTION_NOT_FOUND, "Subscription not found for tenant");
  const replay = replayOrConflict(loaded.subscription, keyHash, payloadHash);
  if (replay) return replayResult(loaded.subscription, replay);
  if ((loaded.subscription.revision ?? 0) !== input.expectedVersion) {
    await writeDeniedAudit(tenantId, loaded.subscription, input.reason, keyHash, ["Subscription version is stale."], actor);
    throw new AppError(409, SUBSCRIPTION_STALE_VERSION, "Subscription was changed by another operation", { currentVersion: loaded.subscription.revision ?? 0 });
  }
  const decision = decideAdminSubscriptionOperation("update", loaded.subscription, loaded.targetPackage, input);
  if (!decision.transitionAllowed) {
    await writeDeniedAudit(tenantId, loaded.subscription, input.reason, keyHash, decision.blockingReasons, actor);
    throwDecision(decision, input);
  }
  const set: Record<string, unknown> = {};
  if (decision.packageChanged) { set.packageId = loaded.targetPackage!._id; set.packageVersion = loaded.targetPackage!.version; }
  if (decision.statusChanged) {
    set.status = input.status;
    if (input.status === "CANCELED") set.cancelledAt = new Date();
    if (input.status === "EXPIRED") set.periodEnd = new Date();
    if (input.status === "ACTIVE" && loaded.subscription.status === "TRIALING") set.trialEnd = new Date();
  }
  const resultingRevision = input.expectedVersion + 1;
  const resultingPackageId = decision.packageChanged ? loaded.targetPackage!._id : loaded.subscription.packageId;
  const resultingPackageVersion = decision.packageChanged ? loaded.targetPackage!.version : loaded.subscription.packageVersion;
  const resultingStatus = decision.statusChanged ? input.status! : loaded.subscription.status;
  const updated = await SubscriptionModel.findOneAndUpdate(
    { tenantId: new Types.ObjectId(tenantId), revision: input.expectedVersion },
    { $set: set, $push: { adminOperations: { keyHash, payloadHash, resultingRevision, resultingPackageId, resultingPackageVersion, resultingStatus, createdAt: new Date() } } },
    { returnDocument: "after", runValidators: true },
  ).select("+adminOperations").lean().exec() as ExistingSubscription | null;
  if (!updated) {
    await writeDeniedAudit(tenantId, loaded.subscription, input.reason, keyHash, ["Subscription changed during the operation."], actor);
    throw new AppError(409, SUBSCRIPTION_STALE_VERSION, "Subscription was changed by another operation");
  }
  const action = decision.packageChanged && decision.statusChanged ? "SUBSCRIPTION_COMBINED_UPDATED" : decision.packageChanged ? "SUBSCRIPTION_PACKAGE_CHANGED" : "SUBSCRIPTION_STATUS_OVERRIDDEN";
  await writeAudit(action, updated, loaded.subscription, input.reason, keyHash, actor);
  if (decision.packageChanged || decision.statusChanged) {
    await firePlanChangeHooks({
      tenantId,
      fromPackageId: loaded.subscription.packageId ? String(loaded.subscription.packageId) : undefined,
      toPackageId: decision.packageChanged ? String(loaded.targetPackage!._id) : undefined,
      fromStatus: loaded.subscription.status,
      toStatus: resultingStatus,
    });
  }
  return { ...sanitizeSubscription(updated), idempotentReplay: false };
}

export function sanitizeSubscription(subscription: ExistingSubscription) {
  return {
    _id: String(subscription._id), tenantId: subscription.tenantId, packageId: subscription.packageId,
    packageVersion: subscription.packageVersion, status: subscription.status, version: subscription.revision ?? 0,
    periodStart: subscription.periodStart ?? null, periodEnd: subscription.periodEnd ?? null,
    currentPeriodStart: subscription.periodStart ?? null, currentPeriodEnd: subscription.periodEnd ?? null,
    renewsAt: subscription.renewsAt ?? subscription.periodEnd ?? null,
    trialStart: subscription.trialStart ?? null, trialEnd: subscription.trialEnd ?? null,
    cancelledAt: subscription.cancelledAt ?? null, cancellationReason: subscription.cancellationReason ?? "",
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false, paymentState: subscription.paymentState ?? "pending",
    providerManaged: hasProviderOwnership(subscription),
    providerState: { hasCustomer: Boolean(subscription.providerCustomerId), hasSubscription: Boolean(subscription.providerSubscriptionId), hasPrice: Boolean(subscription.providerPriceId) },
    createdAt: subscription.createdAt ?? null, updatedAt: subscription.updatedAt ?? null,
  };
}
