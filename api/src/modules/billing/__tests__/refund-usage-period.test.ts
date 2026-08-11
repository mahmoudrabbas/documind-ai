import { describe, expect, it } from "vitest";
import { exactRefundUsageRange, refundCounterPeriodKeys, resolveRefundUsageMetrics, utcPeriodKey } from "../refund-eligibility.service.js";

const tenantId = "507f1f77bcf86cd799439011";
const entitlements = { queriesPerMonth: 100, tokensPerMonth: 1_000, ocrPagesPerMonth: 100 };

function resolve(start: string, end: string, overrides: Partial<Parameters<typeof resolveRefundUsageMetrics>[0]> = {}) {
  const periodStart = new Date(start);
  const periodEnd = new Date(end);
  return resolveRefundUsageMetrics({
    tenantId,
    periodStart,
    periodEnd,
    entitlements,
    counters: [],
    exactSourceUsage: { queriesPerMonth: 0, ocrPagesPerMonth: 0 },
    ...overrides,
  });
}

describe("refund exact-period usage semantics", () => {
  it.each([
    ["Jul 28 to Aug 28", "2026-07-28T00:00:00.000Z", "2026-08-28T00:00:00.000Z"],
    ["Dec 15 to Jan 15", "2026-12-15T00:00:00.000Z", "2027-01-15T00:00:00.000Z"],
    ["annual cross-year", "2026-07-28T00:00:00.000Z", "2027-07-28T00:00:00.000Z"],
  ])("uses exact ledgers across %s and conservatively attributes an unproven counter surplus", (_label, start, end) => {
    const accepted = resolve(start, end, {
      counters: [{ tenantId, dimension: "queriesPerMonth", periodStart: utcPeriodKey(new Date(start)), value: 6 }],
      exactSourceUsage: { queriesPerMonth: 6, ocrPagesPerMonth: 2 },
    });
    expect(accepted).toContainEqual({ dimension: "queriesPerMonth", usage: 6, limit: 100 });
    expect(accepted).toContainEqual({ dimension: "ocrPagesPerMonth", usage: 2, limit: 100 });

    const unproven = resolve(start, end, {
      counters: [{ tenantId, dimension: "queriesPerMonth", periodStart: utcPeriodKey(new Date(start)), value: 7 }],
      exactSourceUsage: { queriesPerMonth: 6, ocrPagesPerMonth: 2 },
    });
    expect(unproven.find((metric) => metric.dimension === "queriesPerMonth")?.usage).toBe(7);
  });

  it("uses UTC period keys consistently", () => {
    const value = new Date("2026-07-31T23:30:00-02:00");
    expect(utcPeriodKey(value)).toBe("2026-08");
    expect(refundCounterPeriodKeys(value)[0]).toBe("2026-08");
  });

  it("uses inclusive start and exclusive end boundaries", () => {
    const start = new Date("2026-07-28T00:00:00.000Z");
    const end = new Date("2026-08-28T00:00:00.000Z");
    const range = exactRefundUsageRange(start, end);
    expect(range.$gte).toBe(start);
    expect(range.$lt).toBe(end);
    expect(start >= range.$gte && start < range.$lt).toBe(true);
    expect(end >= range.$gte && end < range.$lt).toBe(false);
    expect(new Date("2026-07-27T23:59:59.999Z") >= range.$gte).toBe(false);
    expect(new Date("2026-08-28T00:00:00.001Z") < range.$lt).toBe(false);
  });

  it("aggregates each exact source once without summing month-labelled counters", () => {
    const metrics = resolve("2026-07-28T00:00:00.000Z", "2026-08-28T00:00:00.000Z", {
      counters: [
        { tenantId, dimension: "queriesPerMonth", periodStart: "2026-07", value: 9 },
        { tenantId, dimension: "queriesPerMonth", periodStart: "2026-08", value: 999 },
      ],
      exactSourceUsage: { queriesPerMonth: 9, ocrPagesPerMonth: 0 },
    });
    expect(metrics.find((metric) => metric.dimension === "queriesPerMonth")?.usage).toBe(9);
  });

  it("treats absent enabled counters as authoritative zero and accepts explicit zero", () => {
    expect(resolve("2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z")
      .every((metric) => metric.usage === 0)).toBe(true);
    expect(resolve("2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", {
      counters: [{ tenantId, dimension: "tokensPerMonth", periodStart: "2026-07", value: 0 }],
    }).find((metric) => metric.dimension === "tokensPerMonth")?.usage).toBe(0);
  });

  it("excludes disabled limits and fails closed for missing quota definitions or read failure", () => {
    const disabled = resolve("2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", {
      entitlements: { queriesPerMonth: 100, tokensPerMonth: 0, ocrPagesPerMonth: 100 },
    });
    expect(disabled.find((metric) => metric.dimension === "tokensPerMonth")).toEqual({ dimension: "tokensPerMonth", usage: 0, limit: 0 });
    expect(resolve("2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", {
      entitlements: { queriesPerMonth: 100, ocrPagesPerMonth: 100 },
    }).find((metric) => metric.dimension === "tokensPerMonth")?.usage).toBeNull();
    expect(resolve("2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", { readFailed: true })
      .filter((metric) => metric.limit > 0).every((metric) => metric.usage === null)).toBe(true);
  });

  it("ignores counters from another tenant or period and rejects malformed matching counters", () => {
    const ignored = resolve("2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", {
      counters: [
        { tenantId: "507f1f77bcf86cd799439099", dimension: "tokensPerMonth", periodStart: "2026-07", value: 50 },
        { tenantId, dimension: "tokensPerMonth", periodStart: "2026-06", value: 50 },
      ],
    });
    expect(ignored.find((metric) => metric.dimension === "tokensPerMonth")?.usage).toBe(0);
    expect(resolve("2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", {
      counters: [{ tenantId, dimension: "tokensPerMonth", periodStart: "2026-07", value: -1 }],
    }).find((metric) => metric.dimension === "tokensPerMonth")?.usage).toBeNull();
  });
});
