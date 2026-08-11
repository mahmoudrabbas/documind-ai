import { describe, expect, it } from "vitest";
import { evaluateRefundEligibility } from "../refund-eligibility.policy.js";

const start = new Date("2026-01-01T00:00:00.000Z");
const end = new Date("2026-01-11T00:00:00.000Z");
const metrics = (queryUsage: number | null, tokenUsage = 0, ocrUsage = 0) => [
  { dimension: "queriesPerMonth", usage: queryUsage, limit: 100 },
  { dimension: "tokensPerMonth", usage: tokenUsage, limit: 1_000 },
  { dimension: "ocrPagesPerMonth", usage: ocrUsage, limit: 100 },
  { dimension: "unlimited", usage: 999, limit: 0 },
];
const decision = (overrides: Partial<Parameters<typeof evaluateRefundEligibility>[0]> = {}) => evaluateRefundEligibility({
  reason: "VOLUNTARY_CANCELLATION", amountPaidMinor: 200, confirmedRefundAmountMinor: 0,
  pendingReservedRefundAmountMinor: 0, periodStart: start, periodEnd: end,
  measuredAt: new Date("2026-01-03T00:00:00.000Z"), usageMetrics: metrics(0), ...overrides,
});

describe("RefundEligibilityPolicy", () => {
  it("uses the greater of elapsed time and authoritative variable usage", () => {
    expect(decision({ usageMetrics: metrics(60) })).toMatchObject({ consumedRatioBps: 6000, maximumEligibleRefundMinor: 80 });
    expect(decision({ measuredAt: new Date("2026-01-06T00:00:00.000Z") })).toMatchObject({ consumedRatioBps: 5000, maximumEligibleRefundMinor: 100 });
  });
  it("calculates voluntary cancellation as the unused value and mandates Free transition", () => {
    const result = decision({ measuredAt: new Date("2026-01-01T01:00:00.000Z") });
    expect(result).toMatchObject({
      consumedRatioBps: 42,
      consumedValueMinor: 1,
      maximumEligibleRefundMinor: 199,
      subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE",
    });
  });
  it("does not expose retained consumed value as refundable after settlement", () => {
    expect(decision({ amountPaidMinor: 1000, confirmedRefundAmountMinor: 999, retainedConsumedMinor: 1 })).toMatchObject({ maximumEligibleRefundMinor: 0, subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE" });
  });
  it("uses OCR above elapsed time and produces zero at quota", () => {
    expect(decision({ usageMetrics: metrics(0, 0, 70) }).maximumEligibleRefundMinor).toBe(60);
    expect(decision({ usageMetrics: metrics(100) }).maximumEligibleRefundMinor).toBe(0);
  });
  it("excludes unlimited metrics and fails closed for missing authoritative usage", () => {
    expect(decision().includedUsageMetrics.some((metric) => metric.dimension === "unlimited")).toBe(false);
    expect(decision({ usageMetrics: metrics(null) })).toMatchObject({ reviewRequired: true, maximumEligibleRefundMinor: 0, decisionReason: "USAGE_DATA_UNAVAILABLE" });
  });
  it("subtracts confirmed refunds and pending reservations", () => {
    expect(decision({ confirmedRefundAmountMinor: 30, pendingReservedRefundAmountMinor: 20 }).maximumEligibleRefundMinor).toBe(150);
  });
  it("requires proof for duplicate charges and never cancels proven duplicates", () => {
    expect(decision({ reason: "DUPLICATE_CHARGE" })).toMatchObject({ reviewRequired: true, maximumEligibleRefundMinor: 0, subscriptionImpact: "NONE" });
    expect(decision({ reason: "DUPLICATE_CHARGE", duplicatePaymentProven: true })).toMatchObject({ reviewRequired: false, maximumEligibleRefundMinor: 200, subscriptionImpact: "NONE" });
  });
  it("requires review for service and billing errors while deriving impact", () => {
    expect(decision({ reason: "SERVICE_NOT_DELIVERED" })).toMatchObject({ reviewRequired: true, maximumEligibleRefundMinor: 200, subscriptionImpact: "CANCEL_IMMEDIATELY_AFTER_REFUND" });
    expect(decision({ reason: "BILLING_ERROR" })).toMatchObject({ reviewRequired: true, maximumEligibleRefundMinor: 0 });
  });
  it("caps platform-only goodwill credit without changing subscription access", () => {
    expect(decision({ reason: "GOODWILL_CREDIT", goodwillCapMinor: 75 })).toMatchObject({
      reviewRequired: true,
      maximumEligibleRefundMinor: 75,
      subscriptionImpact: "NONE",
      decisionReason: "PLATFORM_ONLY_REASON",
    });
    expect(decision({ reason: "GOODWILL_CREDIT" }).maximumEligibleRefundMinor).toBe(0);
  });
  it("limits system remaining-balance refunds to 7 days after the invoice payment", () => {
    const system = (invoicePaidAt: Date) => decision({ reason: "SYSTEM_REMAINING_BALANCE_REFUND", invoicePaidAt });
    expect(system(new Date("2025-12-28T00:00:00.000Z"))).toMatchObject({ decisionReason: "USAGE_PROPORTIONAL", maximumEligibleRefundMinor: 160 });
    expect(system(new Date("2025-12-27T00:00:00.000Z"))).toMatchObject({ decisionReason: "USAGE_PROPORTIONAL", maximumEligibleRefundMinor: 160 });
    expect(system(new Date("2025-12-26T23:59:59.999Z"))).toMatchObject({ decisionReason: "REFUND_WINDOW_EXPIRED", maximumEligibleRefundMinor: 0, reviewRequired: false });
  });
  it("uses integer minor units and honors a reliable direct-cost floor only when supplied", () => {
    expect(decision({ amountPaidMinor: 201, measuredAt: new Date("2026-01-01T00:00:00.001Z") }).maximumEligibleRefundMinor).toBe(200);
    expect(decision({ directProviderCostMinor: 150 }).maximumEligibleRefundMinor).toBe(50);
  });
  it.each([
    ["zero", new Date("2026-01-01T00:00:00.000Z"), 0, 200],
    ["one basis point", new Date("2026-01-01T00:01:26.400Z"), 1, 199],
    ["fifty percent", new Date("2026-01-06T00:00:00.000Z"), 5000, 100],
    ["99.99 percent", new Date("2026-01-10T23:58:33.600Z"), 9999, 0],
    ["one hundred percent", end, 10000, 0],
  ])("handles elapsed boundary %s", (_label, measuredAt, consumedRatioBps, maximumEligibleRefundMinor) => {
    expect(decision({ measuredAt })).toMatchObject({ consumedRatioBps, maximumEligibleRefundMinor });
  });
  it("clamps above-quota usage and safely handles the largest valid minor amount", () => {
    expect(decision({ usageMetrics: metrics(1_000_000) }).consumedRatioBps).toBe(10_000);
    expect(decision({
      amountPaidMinor: Number.MAX_SAFE_INTEGER,
      measuredAt: new Date("2026-01-06T00:00:00.000Z"),
    }).maximumEligibleRefundMinor).toBe(4_503_599_627_370_495);
  });
  it("rejects invalid periods and negative money", () => {
    expect(() => decision({ periodEnd: start })).toThrow("valid positive subscription period");
    expect(() => decision({ amountPaidMinor: -1 })).toThrow("non-negative integer minor units");
  });
  it("uses elapsed time alone when every variable metric is disabled", () => {
    expect(decision({ usageMetrics: metrics(0).map((metric) => ({ ...metric, limit: 0 })) })).toMatchObject({
      reviewRequired: false,
      consumedRatioBps: 2000,
      maximumEligibleRefundMinor: 160,
    });
  });
});
