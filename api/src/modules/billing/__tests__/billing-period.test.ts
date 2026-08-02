import { describe, expect, it } from "vitest";
import { normalizeBillingPeriod, resolveCanonicalBillingPeriod } from "../billing-period.js";

describe("canonical billing period resolution", () => {
  const start = new Date("2026-08-01T15:08:38.000Z");
  const end = new Date("2026-09-01T15:08:38.000Z");

  it("requires strict start before end", () => {
    expect(normalizeBillingPeriod(start, start)).toBeNull();
    expect(normalizeBillingPeriod(end, start)).toBeNull();
    expect(normalizeBillingPeriod(start, end)).toEqual({ start, end });
  });

  it("uses a provider service-line period before local data", () => {
    const lineStart = new Date("2026-08-02T00:00:00.000Z");
    const lineEnd = new Date("2026-09-02T00:00:00.000Z");
    expect(resolveCanonicalBillingPeriod({
      providerServicePeriodStart: lineStart,
      providerServicePeriodEnd: lineEnd,
      existingPeriodStart: start,
      existingPeriodEnd: end,
    })).toEqual({ start: lineStart, end: lineEnd });
  });

  it("falls back from an invalid local period to the matching subscription period", () => {
    expect(resolveCanonicalBillingPeriod({
      existingPeriodStart: start,
      existingPeriodEnd: start,
      subscriptionCurrentPeriodStart: start,
      subscriptionCurrentPeriodEnd: end,
    })).toEqual({ start, end });
  });

  it("falls back from an invalid provider service-line period", () => {
    expect(resolveCanonicalBillingPeriod({
      providerServicePeriodStart: start,
      providerServicePeriodEnd: start,
      subscriptionCurrentPeriodStart: start,
      subscriptionCurrentPeriodEnd: end,
    })).toEqual({ start, end });
  });
});
