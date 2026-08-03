import { describe, expect, it } from "vitest";
import { conflictGroupFor, fingerprintBillingRequest, hashIdempotencyKey, mapBillingProviderError, validateBillingPreview } from "../billing-operation.service.js";
import { toCompanyBillingSummary } from "../company-billing-summary.js";
import { evaluateSubscriptionAccess } from "../subscription-access-policy.js";
import { providerStateFingerprint, shouldApplyProviderProjection } from "../provider-projection-policy.js";
import { assertBillingPortalReturnUrl } from "../portal-url-policy.js";

describe("Issue 29 billing foundation", () => {
  it("canonicalizes fingerprints and hashes idempotency keys without storing raw keys", () => {
    expect(fingerprintBillingRequest({ b: 2, a: { d: 4, c: 3 } })).toBe(fingerprintBillingRequest({ a: { c: 3, d: 4 }, b: 2 }));
    expect(fingerprintBillingRequest({ a: 1, traceId: "one", providerMetadata: { unsafe: true } })).toBe(fingerprintBillingRequest({ a: 1, traceId: "two" }));
    expect(hashIdempotencyKey("private-key")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashIdempotencyKey("private-key")).not.toContain("private-key");
  });

  it("groups only incompatible subscription mutations", () => {
    expect(conflictGroupFor("PLAN_CHANGE")).toBe("SUBSCRIPTION_MUTATION");
    expect(conflictGroupFor("CANCEL_PERIOD_END")).toBe("SUBSCRIPTION_MUTATION");
    expect(conflictGroupFor("CANCEL_IMMEDIATELY")).toBe("SUBSCRIPTION_MUTATION");
    expect(conflictGroupFor("REACTIVATE")).toBe("SUBSCRIPTION_MUTATION");
    expect(conflictGroupFor("REFUND")).toBeNull();
  });

  it("rejects stale and revision-changed previews", () => {
    const valid = { now: new Date("2026-01-01"), expiresAt: new Date("2026-01-02"), expectedSubscriptionRevision: 2, actualSubscriptionRevision: 2, expectedPackageVersionId: "v1", actualPackageVersionId: "v1", expectedCurrency: "usd", actualCurrency: "USD", targetAvailable: true };
    expect(() => validateBillingPreview(valid)).not.toThrow();
    expect(() => validateBillingPreview({ ...valid, expiresAt: valid.now })).toThrowError(expect.objectContaining({ code: "BILLING_PREVIEW_STALE" }));
    expect(() => validateBillingPreview({ ...valid, actualSubscriptionRevision: 3 })).toThrowError(expect.objectContaining({ code: "BILLING_SUBSCRIPTION_CHANGED" }));
  });

  it("maps provider failures to a stable safe error", () => {
    const mapped = mapBillingProviderError(new Error("secret Stripe detail"));
    expect(mapped).toMatchObject({ statusCode: 503, code: "BILLING_PROVIDER_UNAVAILABLE" });
    expect(mapped.message).not.toContain("Stripe");
  });

  it("sanitizes the company billing summary", () => {
    const summary = toCompanyBillingSummary({ _id: "sub-local", tenantId: "tenant", packageId: { _id: "pkg", name: "Pro", code: "pro", version: 2, monthlyPrice: 10, providerPriceId: "price_leak" }, packageVersion: 2, status: "ACTIVE", paymentState: "paid", providerCustomerId: "cus_secret", providerSubscriptionId: "sub_secret", providerPriceId: "price_secret", providerMetadata: { secret: true }, lastProviderEventId: "evt_secret", billingInterval: "monthly", cancelAtPeriodEnd: false });
    const json = JSON.stringify(summary);
    expect(summary).toMatchObject({ providerManaged: true, providerLinked: true, canOpenPortal: true });
    expect(json).not.toMatch(/cus_secret|sub_secret|price_secret|price_leak|evt_secret|providerMetadata|providerCustomerId|providerSubscriptionId|providerPriceId/);
  });

  it("presents provider-less Free payment as not applicable without changing paid history", () => {
    const free = toCompanyBillingSummary({ _id: "free-sub", tenantId: "tenant", packageId: { _id: "free-pkg", name: "Free", code: "free", version: 1 }, packageVersion: 1, status: "ACTIVE", paymentState: "paid", providerCustomerId: "", providerSubscriptionId: "", cancelAtPeriodEnd: false });
    const historicalPaid = toCompanyBillingSummary({ _id: "paid-sub", tenantId: "tenant", packageId: { _id: "paid-pkg", name: "Pro", code: "pro", version: 1 }, packageVersion: 1, status: "CANCELED", paymentState: "paid", providerCustomerId: "customer", providerSubscriptionId: "subscription", cancelAtPeriodEnd: false });
    expect(free.paymentState).toBe("not_applicable");
    expect(historicalPaid.paymentState).toBe("paid");
  });

  it("does not let an unrelated refund disable subscription lifecycle capabilities", () => {
    const subscription = { _id: "sub-local", tenantId: "tenant", packageId: { _id: "pkg" }, packageVersion: 1, status: "ACTIVE", paymentState: "paid", providerCustomerId: "customer", providerSubscriptionId: "subscription", cancelAtPeriodEnd: false };
    const refundPending = toCompanyBillingSummary(subscription, { operationType: "REFUND", status: "REQUESTED", requestedAt: new Date(), conflictGroup: null }, false);
    expect(refundPending).toMatchObject({ canChangePlan: false, canCancel: false, canRequestRefund: false });
    const mutationPending = toCompanyBillingSummary(subscription, { operationType: "PLAN_CHANGE", status: "REQUESTED", requestedAt: new Date(), conflictGroup: "SUBSCRIPTION_MUTATION" }, true);
    expect(mutationPending).toMatchObject({ canChangePlan: false, canCancel: false, canRequestRefund: false });
  });

  it("enforces exact portal origins and HTTPS outside localhost", () => {
    expect(() => assertBillingPortalReturnUrl("https://app.example.test/checkout", "https://app.example.test")).not.toThrow();
    expect(() => assertBillingPortalReturnUrl("https://evil.example/checkout", "https://app.example.test")).toThrow();
    expect(() => assertBillingPortalReturnUrl("http://app.example.test/checkout", "http://app.example.test")).toThrow();
  });

  it("applies lifecycle and configurable past-due grace deterministically", () => {
    const base = { now: new Date("2026-01-10"), periodEnd: new Date("2026-02-01"), trialEnd: null, cancelAtPeriodEnd: false, pastDueSince: null, pastDueGraceDays: 7 };
    expect(evaluateSubscriptionAccess({ ...base, status: "ACTIVE" }).eligible).toBe(true);
    expect(evaluateSubscriptionAccess({ ...base, status: "CANCEL_AT_PERIOD_END" }).eligible).toBe(true);
    expect(evaluateSubscriptionAccess({ ...base, status: "CANCELED" }).eligible).toBe(false);
    expect(evaluateSubscriptionAccess({ ...base, status: "UNPAID" }).eligible).toBe(false);
    expect(evaluateSubscriptionAccess({ ...base, status: "PAST_DUE", pastDueSince: new Date("2026-01-05") })).toMatchObject({ eligible: true, inGracePeriod: true });
    expect(evaluateSubscriptionAccess({ ...base, status: "PAST_DUE", pastDueSince: new Date("2026-01-01") }).eligible).toBe(false);
    expect(evaluateSubscriptionAccess({ ...base, status: "PAST_DUE", now: new Date("2026-01-08"), pastDueSince: new Date("2026-01-01") }).eligible).toBe(false);
    expect(evaluateSubscriptionAccess({ ...base, status: "CANCEL_AT_PERIOD_END", now: new Date("2026-02-01") }).eligible).toBe(false);
  });

  it("never orders projections by event ID and requires a current provider read", () => {
    const incoming = { currentlyAppliedObservedAt: new Date("2026-01-02"), incomingObservedAt: new Date("2026-01-01"), currentFingerprint: "new", incomingFingerprint: "old", readCurrentProviderState: true };
    expect(shouldApplyProviderProjection(incoming)).toBe(false);
    expect(shouldApplyProviderProjection({ ...incoming, currentFingerprint: "same", incomingFingerprint: "same" })).toBe(true);
    expect(shouldApplyProviderProjection({ ...incoming, readCurrentProviderState: false })).toBe(false);
    expect(providerStateFingerprint({ status: "active", lastProviderEventId: "evt_z" })).toBe(providerStateFingerprint({ status: "active", lastProviderEventId: "evt_a" }));
  });
});
