import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  BILLING_OPERATION_NOT_ALLOWED,
  BILLING_PROVIDER_OWNERSHIP_MISMATCH,
  BILLING_SUBSCRIPTION_CHANGED,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import BillingOperationModel, { type BillingOperationDocument } from "../../db/models/billingOperation.model.js";
import BillingPreviewModel from "../../db/models/billingPreview.model.js";
import { BillingOperationService } from "./billing-operation.service.js";

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
  } else {
    await service.fail(String(operation._id), input.tenantId, input.failureCode ?? "BILLING_PROVIDER_UNAVAILABLE");
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
    return { action: "KEEP_PENDING" };
  }

  if (!authoritativeSubscription.packageVersionId || !authoritativeSubscription.billingInterval) {
    return { action: "KEEP_PENDING" };
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
