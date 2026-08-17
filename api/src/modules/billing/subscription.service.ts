import { Types } from "mongoose";
import SubscriptionModel, {
  type SubscriptionDocument,
} from "../../db/models/subscription.model.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  NOT_FOUND,
  BAD_REQUEST,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type {
  SubscriptionStatus,
  SubscriptionTransition,
} from "./billing.types.js";
import type { BillingActor } from "./package.service.js";

// ── Legal transitions ───────────────────────────────────────────────────────
// Key: current state → array of legal target states

export const LEGAL_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  TRIALING: ["ACTIVE", "INCOMPLETE", "PAST_DUE", "CANCEL_AT_PERIOD_END"],
  INCOMPLETE: ["ACTIVE", "PAST_DUE", "EXPIRED"],
  ACTIVE: ["PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END", "CANCELED", "EXPIRED"],
  PAST_DUE: ["ACTIVE", "PAUSED", "CANCELED", "EXPIRED", "UNPAID"],
  PAUSED: ["ACTIVE", "CANCELED", "EXPIRED"],
  "CANCEL_AT_PERIOD_END": ["ACTIVE", "CANCELED", "EXPIRED"],
  CANCELED: [],
  EXPIRED: ["ACTIVE", "UNPAID"],
  UNPAID: ["ACTIVE", "EXPIRED"],
};

// ── Transition options ──────────────────────────────────────────────────────

export interface TransitionOptions {
  subscriptionId?: string;
  reason?: string;
  triggeredBy?: SubscriptionTransition["triggeredBy"];
  providerEventId?: string;
  periodEnd?: Date;
  packageId?: string;
  packageVersion?: number;
}

export interface SubscriptionFilter {
  status?: SubscriptionStatus;
  tenantId?: string;
}

// ── Plan-change hooks ────────────────────────────────────────────────────────
// Registered-hook pattern so plan-affecting mutations (transitionSubscription,
// the admin PATCH path, the provider-sync path) can notify subscribers — e.g.
// the entitlement module's per-tenant reconcile — WITHOUT a billing→entitlement
// import (which would create a module cycle). Hooks fire AFTER the state change
// is persisted and are failure-isolated: a throwing hook never breaks the
// mutation. The entitlement wiring itself lives in server.ts.

export interface PlanChangeInfo {
  tenantId: string;
  fromPackageId?: string;
  toPackageId?: string;
  fromStatus: SubscriptionStatus;
  toStatus: SubscriptionStatus;
}

export type PlanChangeHook = (info: PlanChangeInfo) => void | Promise<void>;

const planChangeHooks: PlanChangeHook[] = [];

export function registerPlanChangeHook(hook: PlanChangeHook): void {
  planChangeHooks.push(hook);
}

export function getPlanChangeHooks(): readonly PlanChangeHook[] {
  return planChangeHooks;
}

export async function firePlanChangeHooks(info: PlanChangeInfo): Promise<void> {
  await Promise.allSettled(
    planChangeHooks.map((hook) =>
      Promise.resolve().then(() => hook(info)),
    ),
  );
}

// ── Audit helper ────────────────────────────────────────────────────────────

function writeAudit(
  action: string,
  resourceId: string,
  changes: Record<string, unknown>,
  tenantId: string,
  actor?: BillingActor,
): void {
  const writer = getAuditWriter();
  writer.write({
    action: action as never,
    resourceType: "Subscription" as never,
    resourceId,
    changes,
    tenantId,
    actorId: actor?.userId,
    actorEmail: actor?.email,
    actorRole: actor?.role,
    actorKind: actor ? "USER" : "SYSTEM",
  }).catch((err: unknown) => {
    console.error("Audit write failed (non-blocking):", err);
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new subscription for a tenant. Defaults to TRIALING if no status
 * is provided. When `trialDays` is provided and the subscription is in
 * TRIALING status, `trialEnd` is computed from `trialStart + trialDays`.
 *
 * When `periodStart`/`periodEnd` are provided they are written directly
 * (used by Free / local subscriptions that need a concrete entitlement
 * period without a provider billing cycle).
 */
export async function createSubscription(
  tenantId: string,
  packageId: string,
  packageVersion: number,
  status?: SubscriptionStatus,
  actor?: BillingActor,
  trialDays?: number,
  periodStart?: Date,
  periodEnd?: Date,
): Promise<SubscriptionDocument> {
  const targetStatus: SubscriptionStatus = status ?? "TRIALING";
  const now = new Date();

  let trialEnd: Date | null = null;
  if (targetStatus === "TRIALING" && typeof trialDays === "number" && trialDays > 0) {
    trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  }

  const sub = await SubscriptionModel.create({
    tenantId: new Types.ObjectId(tenantId),
    packageId: new Types.ObjectId(packageId),
    packageVersion,
    status: targetStatus,
    startedAt: now,
    trialStart: targetStatus === "TRIALING" ? now : null,
    trialEnd,
    periodStart: periodStart ?? null,
    periodEnd: periodEnd ?? null,
    currentPeriodStart: periodStart ?? null,
    currentPeriodEnd: periodEnd ?? null,
  });

  writeAudit(
    "SUBSCRIPTION_UPDATED",
    String(sub._id),
    { tenantId, packageId, packageVersion, status: targetStatus, action: "created" },
    tenantId,
    actor,
  );

  return sub.toJSON();
}

/**
 * Transition a subscription to a new state. Validates the transition against
 * the legal state machine. Throws if the transition is illegal.
 */
export async function transitionSubscription(
  tenantId: string,
  targetState: SubscriptionStatus,
  options?: TransitionOptions,
  actor?: BillingActor,
): Promise<SubscriptionDocument> {
  const existing = await SubscriptionModel.findOne({
    tenantId,
    ...(options?.subscriptionId && Types.ObjectId.isValid(options.subscriptionId)
      ? { _id: new Types.ObjectId(options.subscriptionId) }
      : { status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] } }),
  }).exec();
  if (!existing) {
    throw new AppError(404, NOT_FOUND, "Subscription not found for tenant");
  }

  const fromState = existing.status as SubscriptionStatus;
  const fromPackageId = existing.packageId ? String(existing.packageId) : undefined;
  const legalTargets = LEGAL_TRANSITIONS[fromState];

  if (!legalTargets.includes(targetState)) {
    throw new AppError(
      400,
      BAD_REQUEST,
      `Illegal subscription transition: ${fromState} → ${targetState}`,
    );
  }

  const now = new Date();
  const update: Record<string, unknown> = {
    status: targetState,
    periodEnd: options?.periodEnd ?? existing.periodEnd,
  };

  // Side-effect fields based on the transition path
  if (options?.packageId) {
    update.packageId = new Types.ObjectId(options.packageId);
  }
  if (options?.packageVersion !== undefined) {
    update.packageVersion = options.packageVersion;
  }

  if (
    targetState === "CANCELED" &&
    fromState === "CANCEL_AT_PERIOD_END"
  ) {
    update.cancelledAt = now;
  }

  if (targetState === "ACTIVE" && fromState === "TRIALING") {
    update.trialEnd = now;
  }

  if (targetState === "EXPIRED") {
    update.periodEnd = now;
  }

  Object.assign(existing, update);
  await existing.save();

  if (options?.packageId !== undefined || options?.packageVersion !== undefined) {
    await firePlanChangeHooks({
      tenantId,
      fromPackageId,
      toPackageId: options?.packageId ? String(options.packageId) : undefined,
      fromStatus: fromState,
      toStatus: targetState,
    });
  }

  const transition: SubscriptionTransition = {
    from: fromState,
    to: targetState,
    reason: options?.reason,
    triggeredBy: options?.triggeredBy ?? "system",
    providerEventId: options?.providerEventId,
  };

  writeAudit(
    "SUBSCRIPTION_UPDATED",
    String(existing._id),
    transition as unknown as Record<string, unknown>,
    tenantId,
    actor,
  );

  return existing.toJSON();
}

/**
 * Get a subscription by tenant ID. Throws if not found.
 */
export async function getSubscription(
  tenantId: string,
): Promise<SubscriptionDocument> {
  const sub = await SubscriptionModel.findOne({ tenantId, status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] } }).lean().exec();
  if (!sub) {
    throw new AppError(404, NOT_FOUND, "Subscription not found for tenant");
  }
  return sub;
}

/**
 * List subscriptions with an optional status filter. Super Admin scope.
 */
export async function listSubscriptions(
  filter?: SubscriptionFilter,
): Promise<SubscriptionDocument[]> {
  const query: Record<string, unknown> = {};
  if (filter?.status) {
    query.status = filter.status;
  }
  if (filter?.tenantId) {
    query.tenantId = new Types.ObjectId(filter.tenantId);
  }
  return SubscriptionModel.find(query)
    .sort({ createdAt: -1 })
    .exec();
}

/**
 * Return the list of legal target states from a given subscription status.
 */
export function getLegalTransitions(
  fromStatus: SubscriptionStatus,
): readonly SubscriptionStatus[] {
  return LEGAL_TRANSITIONS[fromStatus];
}
