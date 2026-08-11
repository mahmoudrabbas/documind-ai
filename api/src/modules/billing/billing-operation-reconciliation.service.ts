import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  BILLING_OPERATION_NOT_ALLOWED,
  BILLING_PROVIDER_OWNERSHIP_MISMATCH,
  BILLING_PROVIDER_UNAVAILABLE,
  BILLING_SUBSCRIPTION_CHANGED,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import BillingOperationModel, { type BillingOperationDocument } from "../../db/models/billingOperation.model.js";
import BillingPreviewModel from "../../db/models/billingPreview.model.js";
import RefundModel from "../../db/models/refund.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import { BillingOperationService, fingerprintBillingRequest } from "./billing-operation.service.js";
import type { PaymentProvider, ProviderOperationContext, ProviderSubscriptionState, ProviderSubscriptionMutationResult, SubscriptionReadParams } from "./ports/payment-provider.port.js";
import { providerSubscriptionStatus, synchronizeProviderSubscription } from "./provider-subscription-sync.service.js";
import { transitionSubscription } from "./subscription.service.js";

type ReconciliationOutcome = "CONFIRMED" | "FAILED" | "RETRY_PENDING";
type ConfirmationDecision =
  | { action: "CONFIRM" }
  | { action: "KEEP_PENDING" }
  | { action: "FAIL"; failureCode: string }
  | { action: "SUPERSEDE" };

type SubscriptionSnapshot = {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  periodEnd: Date | null;
  billingInterval: "monthly" | "annual" | null;
  packageVersionId: string | null;
};

export interface BillingOperationReconciliationInput {
  tenantId: string;
  operationReference?: string;
  providerOperationReference?: string;
  providerObjectReference?: string;
  providerEventId: string;
  outcome: ReconciliationOutcome;
  failureCode?: string;
  authoritativeSubscription?: Record<string, unknown> | null;
}

/** Reusable webhook reconciliation primitive. It never orders by event ID. */
export async function reconcileBillingOperation(
  input: BillingOperationReconciliationInput,
): Promise<{ matched: boolean; operationId: string | null }> {
  const referenceQuery: Record<string, unknown>[] = [];
  if (input.operationReference && Types.ObjectId.isValid(input.operationReference)) {
    referenceQuery.push({ _id: new Types.ObjectId(input.operationReference) });
  }
  if (input.providerOperationReference) {
    referenceQuery.push({ providerOperationReference: input.providerOperationReference });
  }
  if (input.providerObjectReference) {
    referenceQuery.push({ providerObjectReference: input.providerObjectReference });
  }
  if (!referenceQuery.length) return { matched: false, operationId: null };

  const operation = await BillingOperationModel.findOne({
    $or: referenceQuery,
    status: { $in: ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] },
  }).exec();
  if (!operation) return { matched: false, operationId: null };
  if (String(operation.tenantId) !== input.tenantId) {
    throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Provider billing operation ownership mismatch");
  }

  const service = new BillingOperationService();
  if (input.outcome === "CONFIRMED") {
    const decision = await confirmationDecision(operation, input.authoritativeSubscription ?? null);
    if (decision.action === "CONFIRM") {
      await service.confirm(String(operation._id), input.tenantId, input.providerEventId);
      if (operation.operationType === "CANCEL_IMMEDIATELY") {
        await RefundModel.updateMany(
          { tenantId: operation.tenantId, subscriptionImpactOperationId: operation._id, status: "SUCCEEDED" },
          { $set: { subscriptionImpactStatus: "SUCCEEDED" } },
        );
      }
      await writeSpecificAudit(operation, "CONFIRMED");
    } else if (decision.action === "FAIL") {
      await service.fail(String(operation._id), input.tenantId, decision.failureCode);
      await writeSpecificAudit(operation, "FAILED", decision.failureCode);
    } else if (decision.action === "SUPERSEDE") {
      await service.supersede(String(operation._id), input.tenantId);
    }
  } else if (input.outcome === "RETRY_PENDING") {
    await service.markRetryPending(
      String(operation._id),
      input.tenantId,
      input.failureCode ?? "BILLING_PROVIDER_UNAVAILABLE",
      new Date(Date.now() + 60_000),
    );
    if (operation.operationType === "CANCEL_IMMEDIATELY") {
      await RefundModel.updateMany({ subscriptionImpactOperationId: operation._id }, { $set: { subscriptionImpactStatus: "RETRY_PENDING" } });
    }
  } else {
    await service.fail(String(operation._id), input.tenantId, input.failureCode ?? "BILLING_PROVIDER_UNAVAILABLE");
    if (operation.operationType === "CANCEL_IMMEDIATELY") {
      await RefundModel.updateMany({ subscriptionImpactOperationId: operation._id }, { $set: { subscriptionImpactStatus: "FAILED" } });
    }
    await writeSpecificAudit(operation, "FAILED", input.failureCode ?? "BILLING_PROVIDER_UNAVAILABLE");
  }

  return { matched: true, operationId: String(operation._id) };
}

async function confirmationDecision(
  operation: BillingOperationDocument,
  authoritativeSubscription: Record<string, unknown> | null,
): Promise<ConfirmationDecision> {
  if (!requiresAuthoritativeSubscription(operation.operationType)) {
    return { action: "CONFIRM" };
  }
  if (!authoritativeSubscription) {
    return { action: "KEEP_PENDING" };
  }

  const subscription = snapshot(authoritativeSubscription);
  if (operation.operationType === "PLAN_CHANGE") {
    return planChangeDecision(operation, subscription);
  }
  if (operation.operationType === "CANCEL_PERIOD_END") {
    return cancellationAtPeriodEndDecision(operation, subscription);
  }
  if (operation.operationType === "CANCEL_IMMEDIATELY") {
    return immediateCancellationDecision(subscription);
  }
  if (operation.operationType === "REACTIVATE") {
    return reactivationDecision(subscription);
  }
  return { action: "CONFIRM" };
}

async function planChangeDecision(
  operation: BillingOperationDocument,
  authoritativeSubscription: SubscriptionSnapshot,
): Promise<ConfirmationDecision> {
  const preview = operation.previewReference && Types.ObjectId.isValid(operation.previewReference)
    ? await BillingPreviewModel.findById(operation.previewReference)
      .select("currentPackageVersionId currentBillingInterval targetPackageVersionId targetBillingInterval")
      .lean()
      .exec()
    : null;

  const targetPackageVersionId = operation.packageVersionId
    ? String(operation.packageVersionId)
    : preview?.targetPackageVersionId
      ? String(preview.targetPackageVersionId)
      : null;
  const targetBillingInterval = preview?.targetBillingInterval === "annual"
    ? "annual"
    : preview?.targetBillingInterval === "monthly"
      ? "monthly"
      : null;
  const currentPackageVersionId = preview?.currentPackageVersionId
    ? String(preview.currentPackageVersionId)
    : null;
  const currentBillingInterval = preview?.currentBillingInterval === "annual"
    ? "annual"
    : preview?.currentBillingInterval === "monthly"
      ? "monthly"
      : null;

  if (!targetPackageVersionId) {
    return { action: "KEEP_PENDING" };
  }

  if (
    authoritativeSubscription.packageVersionId === targetPackageVersionId
    && (!targetBillingInterval || authoritativeSubscription.billingInterval === targetBillingInterval)
  ) {
    return { action: "CONFIRM" };
  }

  if (
    currentPackageVersionId
    && authoritativeSubscription.packageVersionId === currentPackageVersionId
    && (!currentBillingInterval || authoritativeSubscription.billingInterval === currentBillingInterval)
  ) {
    if (terminalLifecycle(authoritativeSubscription.status)) {
      return { action: "FAIL", failureCode: BILLING_SUBSCRIPTION_CHANGED };
    }
    return { action: "KEEP_PENDING" };
  }

  if (!authoritativeSubscription.packageVersionId || !authoritativeSubscription.billingInterval) {
    return { action: "KEEP_PENDING" };
  }

  if (terminalLifecycle(authoritativeSubscription.status)) {
    return { action: "FAIL", failureCode: BILLING_SUBSCRIPTION_CHANGED };
  }

  return { action: "SUPERSEDE" };
}

function cancellationAtPeriodEndDecision(
  operation: BillingOperationDocument,
  authoritativeSubscription: SubscriptionSnapshot,
): ConfirmationDecision {
  const effectiveEnd = authoritativeSubscription.currentPeriodEnd ?? authoritativeSubscription.periodEnd;
  if (
    authoritativeSubscription.cancelAtPeriodEnd
    && (!operation.effectiveAt || sameInstant(operation.effectiveAt, effectiveEnd))
  ) {
    return { action: "CONFIRM" };
  }
  if (!authoritativeSubscription.cancelAtPeriodEnd && lifecycleStillActive(authoritativeSubscription.status)) {
    return { action: "KEEP_PENDING" };
  }
  if (terminalLifecycle(authoritativeSubscription.status)) {
    return { action: "FAIL", failureCode: BILLING_SUBSCRIPTION_CHANGED };
  }
  return { action: "KEEP_PENDING" };
}

function immediateCancellationDecision(
  authoritativeSubscription: SubscriptionSnapshot,
): ConfirmationDecision {
  if (["CANCELED", "EXPIRED"].includes(authoritativeSubscription.status)) {
    return { action: "CONFIRM" };
  }
  if (["ACTIVE", "TRIALING", "PAST_DUE", "CANCEL_AT_PERIOD_END", "INCOMPLETE"].includes(authoritativeSubscription.status)) {
    return { action: "KEEP_PENDING" };
  }
  return { action: "FAIL", failureCode: BILLING_OPERATION_NOT_ALLOWED };
}

function reactivationDecision(
  authoritativeSubscription: SubscriptionSnapshot,
): ConfirmationDecision {
  if (
    !authoritativeSubscription.cancelAtPeriodEnd
    && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(authoritativeSubscription.status)
  ) {
    return { action: "CONFIRM" };
  }
  if (authoritativeSubscription.cancelAtPeriodEnd && lifecycleStillActive(authoritativeSubscription.status)) {
    return { action: "KEEP_PENDING" };
  }
  if (terminalLifecycle(authoritativeSubscription.status)) {
    return { action: "FAIL", failureCode: BILLING_OPERATION_NOT_ALLOWED };
  }
  return { action: "KEEP_PENDING" };
}

function requiresAuthoritativeSubscription(operationType: string): boolean {
  return [
    "PLAN_CHANGE",
    "CANCEL_PERIOD_END",
    "CANCEL_IMMEDIATELY",
    "REACTIVATE",
  ].includes(operationType);
}

function snapshot(value: Record<string, unknown>): SubscriptionSnapshot {
  return {
    status: String(value.status || ""),
    cancelAtPeriodEnd: Boolean(value.cancelAtPeriodEnd),
    currentPeriodEnd: dateOrNull(value.currentPeriodEnd),
    periodEnd: dateOrNull(value.periodEnd),
    billingInterval: value.billingInterval === "annual"
      ? "annual"
      : value.billingInterval === "monthly"
        ? "monthly"
        : null,
    packageVersionId: value.packageVersionId ? String(value.packageVersionId) : null,
  };
}

function lifecycleStillActive(status: string): boolean {
  return ["TRIALING", "ACTIVE", "PAST_DUE", "CANCEL_AT_PERIOD_END"].includes(status);
}

function terminalLifecycle(status: string): boolean {
  return ["CANCELED", "EXPIRED", "UNPAID", "PAUSED"].includes(status);
}

function dateOrNull(value: unknown): Date | null {
  return value instanceof Date
    ? value
    : typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : null;
}

function sameInstant(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

async function writeSpecificAudit(
  operation: {
    _id: unknown;
    tenantId: unknown;
    operationType: string;
    actorId: unknown;
    actorRole: string;
  },
  outcome: "CONFIRMED" | "FAILED",
  failureCode?: string,
): Promise<void> {
  const action = specificAction(operation.operationType, outcome);
  if (!action) return;
  await getAuditWriter().write({
    action,
    resourceType: "BillingOperation",
    resourceId: String(operation._id),
    tenantId: String(operation.tenantId),
    actorId: String(operation.actorId),
    actorRole:
      operation.actorRole === "SUPER_ADMIN"
      || operation.actorRole === "COMPANY_ADMIN"
      || operation.actorRole === "EMPLOYEE"
        ? operation.actorRole
        : null,
    changes: {
      operationType: operation.operationType,
      failureCode: failureCode || undefined,
    },
  });
}

function specificAction(operationType: string, outcome: "CONFIRMED" | "FAILED") {
  if (operationType === "PLAN_CHANGE") {
    return outcome === "CONFIRMED" ? "BILLING_PLAN_CHANGE_CONFIRMED" : "BILLING_PLAN_CHANGE_FAILED";
  }
  if (operationType === "CANCEL_PERIOD_END" || operationType === "CANCEL_IMMEDIATELY") {
    return outcome === "CONFIRMED" ? "BILLING_CANCELLATION_CONFIRMED" : "BILLING_CANCELLATION_FAILED";
  }
  if (operationType === "REACTIVATE") {
    return outcome === "CONFIRMED" ? "BILLING_REACTIVATION_CONFIRMED" : "BILLING_REACTIVATION_FAILED";
  }
  return null;
}

// ── Provider-pending sweep ──────────────────────────────────────────────────

export interface ReconcileProviderPendingOperationsOptions {
  provider: PaymentProvider;
  limit?: number;
  graceMs?: number;
  staleMs?: number;
}

export interface ProviderPendingOperationsReconciliationResult {
  examined: number;
  synchronized: number;
  repaired: number;
  confirmed: number;
  failed: number;
  pending: number;
  providerUnavailable: number;
}

export const PROVIDER_PENDING_RECONCILE_DEFAULT_GRACE_MS = 5 * 60 * 1000;
export const PROVIDER_PENDING_RECONCILE_DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;
export const PROVIDER_PENDING_RECONCILE_DEFAULT_LIMIT = 50;

type PendingOperationRecord = {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  subscriptionId: Types.ObjectId | null;
  operationType: string;
  targetPackageId: Types.ObjectId | null;
  packageVersionId: Types.ObjectId | null;
  previewReference: string | null;
  effectiveAt: Date | null;
  requestedAt: Date;
  nextRetryAt: Date | null;
  status: string;
  actorId: Types.ObjectId;
  actorRole: string;
};

type PendingSubscriptionRecord = {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  status: string;
  packageVersionId: Types.ObjectId | null;
  billingInterval: "monthly" | "annual" | null;
  periodEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

type PendingMutationPlan =
  | { reissue: false }
  | { reissue: true; apply: (provider: PaymentProvider) => Promise<ProviderSubscriptionMutationResult> };

/**
 * Reconcile billing operations that are stuck in PROVIDER_PENDING /
 * RETRY_PENDING. For each stale candidate it:
 *   1. Reads the provider's authoritative subscription state.
 *   2. When the provider drifted from the recorded intent (e.g. a plan change
 *      whose Stripe metadata never received the target package reference, or a
 *      cancellation that never reached the provider), re-issues the mutation
 *      under a deterministic `reconcile:<opId>` idempotency key.
 *   3. Projects provider truth into the local subscription and runs the
 *      confirmation decision.
 * Candidates that cannot be repaired are failed after a staleness window so a
 * flaky provider or a concurrently canceled subscription never lingers.
 */
export async function reconcileProviderPendingOperations(
  options: ReconcileProviderPendingOperationsOptions,
): Promise<ProviderPendingOperationsReconciliationResult> {
  const now = new Date();
  const graceMs = options.graceMs ?? PROVIDER_PENDING_RECONCILE_DEFAULT_GRACE_MS;
  const staleMs = options.staleMs ?? PROVIDER_PENDING_RECONCILE_DEFAULT_STALE_MS;
  const limit = Math.max(1, Math.min(200, options.limit ?? PROVIDER_PENDING_RECONCILE_DEFAULT_LIMIT));

  const candidates = await BillingOperationModel.find({
    status: { $in: ["PROVIDER_PENDING", "RETRY_PENDING"] },
    operationType: { $in: ["PLAN_CHANGE", "CANCEL_PERIOD_END", "CANCEL_IMMEDIATELY", "REACTIVATE"] },
    requestedAt: { $lt: new Date(now.getTime() - graceMs) },
  })
    .sort({ requestedAt: 1 })
    .limit(limit)
    .lean<PendingOperationRecord[]>()
    .exec();

  const result: ProviderPendingOperationsReconciliationResult = {
    examined: 0, synchronized: 0, repaired: 0, confirmed: 0, failed: 0, pending: 0, providerUnavailable: 0,
  };
  const service = new BillingOperationService();

  for (const operation of candidates) {
    result.examined += 1;
    const tenantId = String(operation.tenantId);

    if (operation.status === "RETRY_PENDING" && operation.nextRetryAt && operation.nextRetryAt.getTime() > now.getTime()) {
      result.pending += 1;
      continue;
    }

    const subscription = await SubscriptionModel.findOne({
      _id: operation.subscriptionId,
      tenantId: new Types.ObjectId(tenantId),
    })
      .select("_id tenantId provider providerCustomerId providerSubscriptionId providerPriceId status packageVersionId billingInterval periodEnd currentPeriodEnd cancelAtPeriodEnd")
      .lean<PendingSubscriptionRecord | null>()
      .exec();

    if (!subscription) {
      await failPendingOperation(service, operation, tenantId, BILLING_SUBSCRIPTION_CHANGED);
      result.failed += 1;
      continue;
    }

    const readParams: SubscriptionReadParams = {
      subscriptionId: subscription.providerSubscriptionId,
      expectedCustomerId: subscription.providerCustomerId,
    };

    let state: ProviderSubscriptionState;
    try {
      state = await options.provider.retrieveCurrentSubscriptionState(readParams);
    } catch (error) {
      if (isProviderObjectMissing(error)) {
        await resolveProviderSubscriptionMissing(service, operation, tenantId, subscription);
        await countResolution(operation._id, result);
      } else if (isStale(operation.requestedAt, now, staleMs)) {
        await failPendingOperation(service, operation, tenantId, BILLING_PROVIDER_UNAVAILABLE);
        result.failed += 1;
      } else {
        result.providerUnavailable += 1;
      }
      continue;
    }

    const repair = await repairProviderStateIfNeeded({
      provider: options.provider,
      service,
      operation,
      tenantId,
      subscription,
      state,
      staleMs,
      now,
    });
    if (repair.status === "missing") {
      await countResolution(operation._id, result);
      continue;
    }
    if (repair.status === "stale") {
      result.failed += 1;
      continue;
    }
    if (repair.status === "unavailable") {
      result.providerUnavailable += 1;
      continue;
    }
    if (repair.status === "reissued") result.repaired += 1;
    state = repair.state;

    const synced = await synchronizeProviderSubscription({
      providerSubscription: state,
      tenantId,
      provider: subscription.provider,
      sourceId: `reconcile:${String(operation._id)}`,
      sourceType: "webhook",
      sourceTimestamp: state.observedAt,
      providerStateObservedAt: state.observedAt,
    });
    if (synced.changed) result.synchronized += 1;

    await reconcileBillingOperation({
      tenantId,
      operationReference: String(operation._id),
      providerEventId: `reconcile:${String(operation._id)}`,
      outcome: "CONFIRMED",
      authoritativeSubscription: synced.subscription,
    });

    await countResolution(operation._id, result, { staleMs, now, service, operation, tenantId });
  }

  return result;
}

async function repairProviderStateIfNeeded(input: {
  provider: PaymentProvider;
  service: BillingOperationService;
  operation: PendingOperationRecord;
  tenantId: string;
  subscription: PendingSubscriptionRecord;
  state: ProviderSubscriptionState;
  staleMs: number;
  now: Date;
}): Promise<
  | { status: "ok"; state: ProviderSubscriptionState }
  | { status: "reissued"; state: ProviderSubscriptionState }
  | { status: "missing" }
  | { status: "stale" }
  | { status: "unavailable" }
> {
  const plan = await planPendingMutation(input.operation, input.subscription, input.tenantId, input.state);
  if (!plan.reissue) return { status: "ok", state: input.state };

  try {
    const result = await plan.apply(input.provider);
    await input.service.recordProviderResult(String(input.operation._id), input.tenantId, {
      operationReference: result.operationReference,
      objectReference: result.state.id,
    });
    return { status: "reissued", state: result.state };
  } catch (error) {
    if (isProviderObjectMissing(error)) {
      await resolveProviderSubscriptionMissing(input.service, input.operation, input.tenantId, input.subscription);
      return { status: "missing" };
    }
    if (isStale(input.operation.requestedAt, input.now, input.staleMs)) {
      await failPendingOperation(input.service, input.operation, input.tenantId, BILLING_PROVIDER_UNAVAILABLE);
      return { status: "stale" };
    }
    return { status: "unavailable" };
  }
}

async function planPendingMutation(
  operation: PendingOperationRecord,
  subscription: PendingSubscriptionRecord,
  tenantId: string,
  state: ProviderSubscriptionState,
): Promise<PendingMutationPlan> {
  const internalStatus = providerSubscriptionStatus(state.status);
  const readParams: SubscriptionReadParams = {
    subscriptionId: subscription.providerSubscriptionId,
    expectedCustomerId: subscription.providerCustomerId,
  };
  const operationContext: ProviderOperationContext = {
    idempotencyKey: `reconcile:${String(operation._id)}`,
    requestFingerprint: fingerprintBillingRequest({
      type: operation.operationType,
      id: String(operation._id),
      tenantReference: tenantId,
    }),
    tenantReference: tenantId,
    operationReference: String(operation._id),
  };

  if (operation.operationType === "PLAN_CHANGE") {
    if (terminalLifecycle(internalStatus)) return { reissue: false };
    const preview = operation.previewReference && Types.ObjectId.isValid(operation.previewReference)
      ? await BillingPreviewModel.findById(operation.previewReference)
        .select("+targetProviderPriceReference targetPackageVersionId targetPackageVersion targetBillingInterval")
        .lean()
        .exec()
      : null;
    const targetPackageVersionId = operation.packageVersionId
      ? String(operation.packageVersionId)
      : preview?.targetPackageVersionId
        ? String(preview.targetPackageVersionId)
        : null;
    const targetPriceReference = preview?.targetProviderPriceReference;
    if (!targetPackageVersionId || !targetPriceReference || !operation.targetPackageId) {
      return { reissue: false };
    }
    if (
      state.metadata?.packageVersionId === targetPackageVersionId
      && state.priceId === targetPriceReference
    ) {
      return { reissue: false };
    }
    return {
      reissue: true,
      apply: (provider) => provider.updateSubscription({
        ...readParams,
        targetPriceReference,
        targetPackage: {
          packageId: String(operation.targetPackageId),
          packageVersionId: targetPackageVersionId,
          packageVersion: preview?.targetPackageVersion ?? 0,
          billingInterval: preview?.targetBillingInterval === "annual" ? "annual" : "monthly",
        },
        previewReference: operation.previewReference ?? undefined,
        operationContext,
      }),
    };
  }

  if (!internalStatus) return { reissue: false };

  if (operation.operationType === "CANCEL_PERIOD_END") {
    if (state.cancelAtPeriodEnd || terminalLifecycle(internalStatus)) return { reissue: false };
    if (!lifecycleStillActive(internalStatus)) return { reissue: false };
    return {
      reissue: true,
      apply: (provider) => provider.scheduleCancellation({ ...readParams, operationContext }),
    };
  }

  if (operation.operationType === "CANCEL_IMMEDIATELY") {
    if (terminalLifecycle(internalStatus)) return { reissue: false };
    if (!activeForCancellation(internalStatus)) return { reissue: false };
    return {
      reissue: true,
      apply: (provider) => provider.cancelImmediately({ ...readParams, operationContext }),
    };
  }

  if (operation.operationType === "REACTIVATE") {
    if (!state.cancelAtPeriodEnd || terminalLifecycle(internalStatus)) return { reissue: false };
    if (!lifecycleStillActive(internalStatus)) return { reissue: false };
    return {
      reissue: true,
      apply: (provider) => provider.reactivateSubscription({ ...readParams, operationContext }),
    };
  }

  return { reissue: false };
}

async function resolveProviderSubscriptionMissing(
  service: BillingOperationService,
  operation: PendingOperationRecord,
  tenantId: string,
  subscription: PendingSubscriptionRecord,
): Promise<void> {
  try {
    await transitionSubscription(tenantId, "CANCELED", {
      subscriptionId: String(subscription._id),
      triggeredBy: "system",
      reason: "Provider subscription no longer exists",
      providerEventId: `reconcile:${String(operation._id)}`,
    });
  } catch {
    // The local subscription is already terminal; reconciliation below still
    // converges the recorded operation against the recorded cancellation.
  }
  await reconcileBillingOperation({
    tenantId,
    operationReference: String(operation._id),
    providerEventId: `reconcile:${String(operation._id)}`,
    outcome: "CONFIRMED",
    authoritativeSubscription: {
      status: "CANCELED",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: subscription.currentPeriodEnd ?? null,
      periodEnd: subscription.periodEnd ?? null,
      billingInterval: subscription.billingInterval,
      packageVersionId: subscription.packageVersionId ? String(subscription.packageVersionId) : null,
    },
  });
}

async function countResolution(
  operationId: Types.ObjectId,
  result: ProviderPendingOperationsReconciliationResult,
  fallback?: {
    staleMs: number;
    now: Date;
    service: BillingOperationService;
    operation: PendingOperationRecord;
    tenantId: string;
  },
): Promise<void> {
  const after = await BillingOperationModel.findById(operationId).lean().exec();
  if (after?.status === "CONFIRMED" || after?.status === "SUPERSEDED") {
    result.confirmed += 1;
    return;
  }
  if (after?.status === "FAILED") {
    result.failed += 1;
    return;
  }
  if (fallback && isStale(fallback.operation.requestedAt, fallback.now, fallback.staleMs)) {
    await failPendingOperation(fallback.service, fallback.operation, fallback.tenantId, BILLING_PROVIDER_UNAVAILABLE);
    result.failed += 1;
    return;
  }
  result.pending += 1;
}

async function failPendingOperation(
  service: BillingOperationService,
  operation: { _id: unknown; tenantId: unknown; operationType: string; actorId: unknown; actorRole: string },
  tenantId: string,
  failureCode: string,
): Promise<void> {
  await service.fail(String(operation._id), tenantId, failureCode);
  await writeSpecificAudit(operation, "FAILED", failureCode);
}

function isProviderObjectMissing(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === "resource_missing"
    || /no such .*(subscription|customer)|(subscription|customer).*(not found|does not exist)|resource.*missing/i.test(error.message)
  );
}

function isStale(requestedAt: Date, now: Date, staleMs: number): boolean {
  return requestedAt.getTime() < now.getTime() - staleMs;
}

function activeForCancellation(status: string): boolean {
  return ["ACTIVE", "TRIALING", "PAST_DUE", "CANCEL_AT_PERIOD_END", "INCOMPLETE"].includes(status);
}
