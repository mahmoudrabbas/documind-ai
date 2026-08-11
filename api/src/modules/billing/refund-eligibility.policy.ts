import { createHash } from "node:crypto";
import type { RefundReasonCode, RefundSubscriptionImpact } from "../../db/models/refundEligibilityPreview.model.js";

export const REFUND_ELIGIBILITY_POLICY_VERSION = "2026-08-conservative-attribution-v1";
export const REFUND_USAGE_DIMENSIONS = ["queriesPerMonth", "tokensPerMonth", "ocrPagesPerMonth"] as const;
export const REFUND_PREVIEW_TTL_MS = 15 * 60 * 1000;
export const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface UsageMetricInput { dimension: string; usage: number | null; limit: number }
export interface RefundEligibilityInput {
  reason: RefundReasonCode;
  amountPaidMinor: number;
  confirmedRefundAmountMinor: number;
  pendingReservedRefundAmountMinor: number;
  retainedConsumedMinor?: number;
  periodStart: Date;
  periodEnd: Date;
  measuredAt: Date;
  usageMetrics: UsageMetricInput[];
  duplicatePaymentProven?: boolean;
  directProviderCostMinor?: number | null;
  goodwillCapMinor?: number;
  invoicePaidAt?: Date | null;
}
export interface RefundEligibilityDecision {
  policyVersion: string;
  subscriptionImpact: RefundSubscriptionImpact;
  elapsedPeriodRatioBps: number;
  includedUsageMetrics: Array<{ dimension: string; usage: number; limit: number; ratioBps: number }>;
  consumedRatioBps: number;
  consumedValueMinor: number;
  maximumEligibleRefundMinor: number;
  reviewRequired: boolean;
  decisionReason: string;
}

const clampBps = (value: number) => Math.max(0, Math.min(10_000, Math.trunc(value)));
const ratioBps = (used: number, limit: number) => clampBps(Number((BigInt(used) * 10_000n + BigInt(limit) - 1n) / BigInt(limit)));
const proportionalMinor = (amountMinor: number, consumedBps: number) =>
  Number((BigInt(amountMinor) * BigInt(consumedBps) + 9_999n) / 10_000n);

export function evaluateRefundEligibility(input: RefundEligibilityInput): RefundEligibilityDecision {
  if (![input.amountPaidMinor, input.confirmedRefundAmountMinor, input.pendingReservedRefundAmountMinor, input.retainedConsumedMinor ?? 0].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("Refund money values must be non-negative integer minor units");
  }
  const duration = input.periodEnd.getTime() - input.periodStart.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(input.measuredAt.getTime())) {
    throw new Error("Refund eligibility requires a valid positive subscription period");
  }
  const elapsed = Math.max(0, input.measuredAt.getTime() - input.periodStart.getTime());
  const elapsedPeriodRatioBps = clampBps(Number((BigInt(Math.trunc(elapsed)) * 10_000n + BigInt(Math.trunc(duration)) - 1n) / BigInt(Math.trunc(duration))));
  const invalidUsage = input.usageMetrics.some((metric) =>
    !Number.isSafeInteger(metric.limit) || metric.limit < 0
    || (metric.limit > 0 && (metric.usage === null || !Number.isSafeInteger(metric.usage) || metric.usage < 0)),
  );
  const finiteMetrics = input.usageMetrics.filter((metric) => Number.isSafeInteger(metric.limit) && metric.limit > 0);
  const includedUsageMetrics = finiteMetrics
    .filter((metric): metric is UsageMetricInput & { usage: number } => metric.usage !== null && Number.isSafeInteger(metric.usage) && metric.usage >= 0)
    .map((metric) => ({ ...metric, usage: metric.usage, ratioBps: ratioBps(metric.usage, metric.limit) }));
  const usageRatio = includedUsageMetrics.reduce((maximum, metric) => Math.max(maximum, metric.ratioBps), 0);
  const financialRemaining = Math.max(0, input.amountPaidMinor - (input.retainedConsumedMinor ?? 0) - input.confirmedRefundAmountMinor - input.pendingReservedRefundAmountMinor);

  if (input.reason === "DUPLICATE_CHARGE") {
    return decision("NONE", 0, 0, input.duplicatePaymentProven ? financialRemaining : 0, !input.duplicatePaymentProven,
      input.duplicatePaymentProven ? "DUPLICATE_PAYMENT_PROVEN" : "DUPLICATE_PAYMENT_NOT_PROVEN");
  }
  if (input.reason === "SERVICE_NOT_DELIVERED") {
    return decision("CANCEL_IMMEDIATELY_AFTER_REFUND", elapsedPeriodRatioBps, 0, financialRemaining, true, "PLATFORM_REVIEW_REQUIRED");
  }
  if (input.reason === "BILLING_ERROR") {
    return decision("NONE", elapsedPeriodRatioBps, 0, 0, true, "PLATFORM_REVIEW_REQUIRED");
  }
  if (input.reason === "GOODWILL_CREDIT") {
    const cap = Number.isSafeInteger(input.goodwillCapMinor) ? Math.max(0, input.goodwillCapMinor!) : 0;
    return decision("NONE", elapsedPeriodRatioBps, 0, Math.min(financialRemaining, cap), true, "PLATFORM_ONLY_REASON");
  }
  if (input.reason === "SYSTEM_REMAINING_BALANCE_REFUND" && input.invoicePaidAt
    && input.measuredAt.getTime() > input.invoicePaidAt.getTime() + REFUND_WINDOW_MS) {
    return decision("NONE", elapsedPeriodRatioBps, 0, 0, false, "REFUND_WINDOW_EXPIRED");
  }
  if (invalidUsage) {
    return decision("CANCEL_AND_MOVE_TO_FREE", elapsedPeriodRatioBps, 0, 0, true, "USAGE_DATA_UNAVAILABLE");
  }
  const consumedRatioBps = Math.max(elapsedPeriodRatioBps, usageRatio);
  const consumedValueMinor = Math.max(
    proportionalMinor(input.amountPaidMinor, consumedRatioBps),
    Number.isSafeInteger(input.directProviderCostMinor) ? Math.max(0, input.directProviderCostMinor!) : 0,
  );
  const rawEligible = Math.max(0, input.amountPaidMinor - consumedValueMinor);
  return decision("CANCEL_AND_MOVE_TO_FREE", consumedRatioBps, consumedValueMinor, Math.min(rawEligible, financialRemaining), false, "USAGE_PROPORTIONAL");

  function decision(subscriptionImpact: RefundSubscriptionImpact, consumedRatioBps: number, consumedValueMinor: number, maximumEligibleRefundMinor: number, reviewRequired: boolean, decisionReason: string): RefundEligibilityDecision {
    return { policyVersion: REFUND_ELIGIBILITY_POLICY_VERSION, subscriptionImpact, elapsedPeriodRatioBps,
      includedUsageMetrics, consumedRatioBps, consumedValueMinor, maximumEligibleRefundMinor, reviewRequired, decisionReason };
  }
}

export function refundEligibilitySnapshotHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
