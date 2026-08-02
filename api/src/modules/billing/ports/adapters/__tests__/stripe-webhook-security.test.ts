import { describe, expect, it, vi } from "vitest";
vi.mock("../../../../../config/index.js", () => ({ config: { STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", BILLING_PORTAL_ALLOWED_ORIGIN: "https://example.com", NODE_ENV: "test" } }));
import { StripePaymentProvider } from "../stripe-payment-provider.js";
import { FakePaymentProvider } from "../../fakes/fake-payment-provider.js";

describe("webhook signature configuration", () => {
  it("fails closed when no Stripe webhook secret is configured", () => {
    expect(new StripePaymentProvider().verifyWebhookSignature("{}", "anything")).toBe(false);
  });
  it("does not impose Stripe secret configuration on the explicit fake provider", () => {
    expect(new FakePaymentProvider().verifyWebhookSignature("{}", "deterministic-test-signature")).toBe(true);
  });
});
