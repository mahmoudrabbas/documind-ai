import { describe, expect, it } from "vitest";
import { evaluateSubscriptionAccess } from "./subscription-access-policy.js";

const periodEnd = new Date("2026-08-01T00:00:00.000Z");
const decision = (now: string, status: "CANCEL_AT_PERIOD_END" | "CANCELED" = "CANCEL_AT_PERIOD_END") => evaluateSubscriptionAccess({
  status, now: new Date(now), periodEnd, trialEnd: null,
  cancelAtPeriodEnd: status === "CANCEL_AT_PERIOD_END", pastDueSince: null, pastDueGraceDays: 7,
});

describe("subscription access period-end boundaries", () => {
  it("allows a scheduled cancellation before period end", () => {
    expect(decision("2026-07-31T23:59:59.999Z")).toMatchObject({ eligible: true, reason: "CANCELS_AT_PERIOD_END" });
  });
  it.each(["2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z"])("denies access at or after period end (%s)", (now) => {
    expect(decision(now)).toMatchObject({ eligible: false, reason: "CANCELLATION_EFFECTIVE" });
  });
  it("denies already canceled subscriptions", () => {
    expect(decision("2026-07-31T23:59:59.999Z", "CANCELED")).toMatchObject({ eligible: false, reason: "STATUS_CANCELED" });
  });
});
