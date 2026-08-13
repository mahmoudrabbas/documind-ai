import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  BILLING_INVOICE_NOT_FOUND,
  BILLING_OPERATION_NOT_ALLOWED,
  BILLING_REFUND_REASON_NOT_ALLOWED,
  NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { config } from "../../config/index.js";
import InvoiceModel from "../../db/models/invoice.model.js";
import OcrUsageRecordModel from "../../db/models/ocrUsageRecord.model.js";
import PackageModel from "../../db/models/package.model.js";
import RefundEligibilityPreviewModel, { REFUND_REASON_CODES, type RefundReasonCode } from "../../db/models/refundEligibilityPreview.model.js";
import RefundModel from "../../db/models/refund.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
import { QuotaCounterModel } from "../entitlement/adapters/mongo-quota-counter.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { authorizeTenantOperation, type OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { evaluateRefundEligibility, REFUND_PREVIEW_TTL_MS, REFUND_USAGE_DIMENSIONS, refundEligibilitySnapshotHash } from "./refund-eligibility.policy.js";
import { resolveCanonicalBillingPeriod } from "./billing-period.js";

export const SYSTEM_REFUND_REASON: RefundReasonCode = "SYSTEM_REMAINING_BALANCE_REFUND";
type RefundUsageDimension = (typeof REFUND_USAGE_DIMENSIONS)[number];
type CounterObservation = { tenantId: string; dimension: string; periodStart: string; value: unknown };

export interface RefundUsageReadInput {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  entitlements: Partial<Record<RefundUsageDimension, unknown>>;
  counters: CounterObservation[];
  exactSourceUsage: Partial<Record<RefundUsageDimension, unknown>>;
  readFailed?: boolean;
}

/**
 * Issue 25 counters are labelled YYYY-MM but represent the subscription period
 * whose start falls in that month. Exact timestamp attribution comes from the
 * usage ledgers. When a counter cannot be attributed exactly to a non-calendar
 * period (missing ledger, or counter exceeds the ledger), attribution is
 * conservative: the counter value is treated as consumed inside the period,
 * which shrinks the refund but never over-refunds. Malformed or duplicated
 * counters still fail closed.
 */
export function resolveRefundUsageMetrics(input: RefundUsageReadInput) {
  const periodKeys = refundCounterPeriodKeys(input.periodStart);
  const validRange = Number.isFinite(input.periodStart.getTime()) && Number.isFinite(input.periodEnd.getTime()) && input.periodEnd > input.periodStart;
  return REFUND_USAGE_DIMENSIONS.map((dimension) => {
    const rawLimit = input.entitlements[dimension];
    if (!validRange || input.readFailed || !Number.isSafeInteger(rawLimit) || Number(rawLimit) < 0) {
      return { dimension, usage: null, limit: Number.isSafeInteger(rawLimit) ? Number(rawLimit) : Number.NaN };
    }
    const limit = Number(rawLimit);
    if (limit === 0) return { dimension, usage: 0, limit };
    const matching = input.counters.filter((counter) => counter.tenantId === input.tenantId && counter.dimension === dimension && periodKeys.includes(counter.periodStart));
    if (matching.length > 1 || matching.some((counter) => !Number.isSafeInteger(counter.value) || Number(counter.value) < 0)) {
      return { dimension, usage: null, limit };
    }
    const counterUsage = matching.length === 0 ? 0 : Number(matching[0]!.value);
    const sourceValue = input.exactSourceUsage[dimension];
    if (sourceValue === undefined) {
      // No exact ledger exists for this dimension (e.g. tokens), so the
      // month-labelled counter is the only observation. Attribute it
      // conservatively to the period rather than blocking the refund.
      return { dimension, usage: counterUsage, limit };
    }
    if (!Number.isSafeInteger(sourceValue) || Number(sourceValue) < 0) return { dimension, usage: null, limit };
    const exactUsage = Number(sourceValue);
    return { dimension, usage: Math.max(exactUsage, counterUsage), limit };
  });
}

export function utcPeriodKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Refund snapshots are canonicalized in UTC. The second key only detects
 * counters written by Issue 25's historical process-local key calculation at
 * a UTC month boundary; it is never treated as an additional usage bucket.
 */
export function refundCounterPeriodKeys(value: Date): string[] {
  const utc = utcPeriodKey(value);
  const legacyLocal = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  return legacyLocal === utc ? [utc] : [utc, legacyLocal];
}

export function exactRefundUsageRange(periodStart: Date, periodEnd: Date) {
  return { $gte: periodStart, $lt: periodEnd } as const;
}

export interface RefundEligibilityPreviewDto {
  id: string;
  invoiceId: string;
  invoiceAmountMinor: number;
  currency: string;
  periodElapsedPercent: number;
  usage: Array<{ dimension: string; percent: number }>;
  maximumEligibleRefundMinor: number;
  consumedValueMinor: number;
  periodStart: Date;
  periodEnd: Date;
  targetPlan: { code: "free"; name: "Free" };
  reason: RefundReasonCode;
  subscriptionImpact: "NONE" | "CANCEL_IMMEDIATELY_AFTER_REFUND" | "CANCEL_AND_MOVE_TO_FREE";
  expiresAt: Date;
  reviewRequired: boolean;
  decisionReason: string;
}

export async function calculateRefundEligibilitySnapshot(input: {
  tenantId: string;
  invoiceId: string;
  reason: RefundReasonCode;
  measuredAt?: Date;
  reservationExclusionMinor?: number;
}) {
  if (!Types.ObjectId.isValid(input.invoiceId)) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  const invoice = await InvoiceModel.findOne({ _id: new Types.ObjectId(input.invoiceId), tenantId: new Types.ObjectId(input.tenantId) }).lean().exec();
  if (!invoice?.subscriptionId) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  const subscription = await SubscriptionModel.findOne({ _id: invoice.subscriptionId, tenantId: invoice.tenantId }).lean().exec();
  if (!subscription) throw new AppError(404, NOT_FOUND, "Subscription not found");
  const period = resolveCanonicalBillingPeriod({
    existingPeriodStart: invoice.periodStart,
    existingPeriodEnd: invoice.periodEnd,
    subscriptionCurrentPeriodStart: subscription.currentPeriodStart,
    subscriptionCurrentPeriodEnd: subscription.currentPeriodEnd,
    subscriptionPeriodStart: subscription.periodStart,
    subscriptionPeriodEnd: subscription.periodEnd,
  });
  if (!period) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund eligibility requires a valid billing period");
  }
  const { start: periodStart, end: periodEnd } = period;
  const pkg = await PackageModel.findById(subscription.packageId).lean().exec();
  const version = pkg?.versions?.find((candidate) => candidate.version === subscription.packageVersion);
  if (!version?.entitlements) throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund eligibility requires package entitlements");
  let counters: CounterObservation[] = [];
  let exactSourceUsage: Partial<Record<RefundUsageDimension, unknown>> = {};
  let usageReadFailed = false;
  try {
    const [counterRows, queryCount, ocrTotals] = await Promise.all([
      QuotaCounterModel.find({ tenantId: invoice.tenantId, periodStart: { $in: refundCounterPeriodKeys(periodStart) }, dimension: { $in: REFUND_USAGE_DIMENSIONS } }).lean().exec(),
      UsageLogModel.countDocuments({ tenantId: invoice.tenantId, eventType: "QUESTION_ASKED", createdAt: exactRefundUsageRange(periodStart, periodEnd) }).exec(),
      OcrUsageRecordModel.aggregate<{ total: number }>([
        { $match: { tenantId: invoice.tenantId, createdAt: exactRefundUsageRange(periodStart, periodEnd) } },
        { $group: { _id: null, total: { $sum: "$pagesProcessed" } } },
      ]).exec(),
    ]);
    counters = counterRows.map((counter) => ({ tenantId: String(counter.tenantId), dimension: counter.dimension, periodStart: counter.periodStart, value: counter.value }));
    exactSourceUsage = { queriesPerMonth: queryCount, ocrPagesPerMonth: ocrTotals[0]?.total ?? 0 };
  } catch {
    usageReadFailed = true;
  }
  const usageMetrics = resolveRefundUsageMetrics({
    tenantId: String(invoice.tenantId), periodStart, periodEnd,
    entitlements: version.entitlements as Partial<Record<RefundUsageDimension, unknown>>,
    counters, exactSourceUsage, readFailed: usageReadFailed,
  });
  const measuredAt = input.measuredAt ?? new Date();
  let retainedConsumedMinor = Number(invoice.retainedConsumedMinor ?? 0);
  if (input.reason === SYSTEM_REFUND_REASON && retainedConsumedMinor === 0) {
    const settledSystemRefund = await RefundModel.findOne({ tenantId: invoice.tenantId, invoiceId: invoice._id, reasonCode: SYSTEM_REFUND_REASON, status: "SUCCEEDED" })
      .sort({ confirmedAt: -1, createdAt: -1 }).select("amountMinor retainedConsumedMinor").lean().exec();
    retainedConsumedMinor = Math.max(Number(settledSystemRefund?.retainedConsumedMinor ?? 0), settledSystemRefund ? Math.max(0, invoice.amountPaidMinor - invoice.refundedAmountMinor - Number(settledSystemRefund.amountMinor ?? 0)) : 0);
  }
  const duplicatePaymentProven = input.reason === "DUPLICATE_CHARGE" && Boolean(await InvoiceModel.exists({
    _id: { $ne: invoice._id }, tenantId: invoice.tenantId, subscriptionId: invoice.subscriptionId,
    status: "paid", currency: invoice.currency, amountPaidMinor: invoice.amountPaidMinor,
    periodStart, periodEnd,
  }));
  const decision = evaluateRefundEligibility({
    reason: input.reason ?? SYSTEM_REFUND_REASON,
    amountPaidMinor: invoice.amountPaidMinor,
    confirmedRefundAmountMinor: invoice.refundedAmountMinor,
    pendingReservedRefundAmountMinor: Math.max(0, invoice.reservedRefundAmountMinor - (input.reservationExclusionMinor ?? 0)),
    retainedConsumedMinor,
    periodStart,
    periodEnd,
    measuredAt,
    usageMetrics,
    duplicatePaymentProven,
    goodwillCapMinor: config.BILLING_GOODWILL_REFUND_CAP_MINOR,
    invoicePaidAt: invoice.paidAt ?? null,
  });
  const snapshot = {
    tenantId: String(invoice.tenantId), invoiceId: String(invoice._id), subscriptionId: String(subscription._id),
    subscriptionRevision: subscription.revision, subscriptionPeriodStart: periodStart, subscriptionPeriodEnd: periodEnd,
    measuredAt, amountPaidMinor: invoice.amountPaidMinor, currency: invoice.currency,
    confirmedRefundAmountMinor: invoice.refundedAmountMinor,
    pendingReservedRefundAmountMinor: Math.max(0, invoice.reservedRefundAmountMinor - (input.reservationExclusionMinor ?? 0)),
    retainedConsumedMinor,
    ...decision,
  };
  return { ...snapshot, snapshotHash: refundEligibilitySnapshotHash(snapshot) };
}

export async function createRefundEligibilityPreview(input: {
  tenantId: string;
  invoiceId: string;
  reason?: RefundReasonCode;
  explanation?: string;
  context: OperationAuthorizationContext;
}): Promise<RefundEligibilityPreviewDto> {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_MANAGE);
  if (actor.tenantId !== input.tenantId) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  const reason = input.reason ?? SYSTEM_REFUND_REASON;
  if (!REFUND_REASON_CODES.includes(reason)) {
    throw new AppError(409, BILLING_REFUND_REASON_NOT_ALLOWED, "Refund reason is not allowed");
  }
  const snapshot = await calculateRefundEligibilitySnapshot({ ...input, reason });
  const expiresAt = new Date(snapshot.measuredAt.getTime() + REFUND_PREVIEW_TTL_MS);
  const preview = await RefundEligibilityPreviewModel.create({ ...snapshot, reason, explanation: input.explanation?.trim() ?? "", expiresAt });
  await getAuditWriter().write({
    action: "BILLING_REFUND_ELIGIBILITY_PREVIEWED", resourceType: "RefundEligibilityPreview", resourceId: String(preview._id), tenantId: input.tenantId,
    actorId: actor.actorId, actorEmail: actor.actorEmail, actorRole: actor.actorRole,
    changes: { policyVersion: snapshot.policyVersion, reason, reviewRequired: snapshot.reviewRequired, subscriptionImpact: snapshot.subscriptionImpact,
      usageRatios: snapshot.includedUsageMetrics.map((metric) => ({ dimension: metric.dimension, ratioBps: metric.ratioBps })) },
  });
  return toPreviewDto(preview);
}

export function toPreviewDto(preview: { _id: unknown; invoiceId: unknown; amountPaidMinor: number; currency: string; elapsedPeriodRatioBps: number; includedUsageMetrics: Array<{ dimension: string; ratioBps: number }>; consumedValueMinor: number; subscriptionPeriodStart: Date; subscriptionPeriodEnd: Date; maximumEligibleRefundMinor: number; reason: RefundReasonCode; subscriptionImpact: "NONE" | "CANCEL_IMMEDIATELY_AFTER_REFUND" | "CANCEL_AND_MOVE_TO_FREE"; expiresAt: Date; reviewRequired: boolean; decisionReason: string }): RefundEligibilityPreviewDto {
  return {
    id: String(preview._id), invoiceId: String(preview.invoiceId), invoiceAmountMinor: preview.amountPaidMinor, currency: preview.currency,
    periodElapsedPercent: preview.elapsedPeriodRatioBps / 100,
    usage: preview.includedUsageMetrics.map((metric) => ({ dimension: metric.dimension, percent: metric.ratioBps / 100 })),
    consumedValueMinor: preview.consumedValueMinor, periodStart: preview.subscriptionPeriodStart, periodEnd: preview.subscriptionPeriodEnd,
    targetPlan: { code: "free", name: "Free" },
    maximumEligibleRefundMinor: preview.maximumEligibleRefundMinor, reason: preview.reason, subscriptionImpact: preview.subscriptionImpact,
    expiresAt: preview.expiresAt, reviewRequired: preview.reviewRequired, decisionReason: preview.decisionReason,
  };
}
