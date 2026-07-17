import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { PaymentProvider } from "../payment-provider.port.js";

export function paymentProviderContractTests(
  label: string,
  createAdapter: () => PaymentProvider,
  cleanup?: () => Promise<void>,
): void {
  describe(`${label} — PaymentProvider contract`, () => {
    let provider: PaymentProvider;

    beforeEach(() => {
      provider = createAdapter();
    });

    afterEach(async () => {
      await cleanup?.();
    });

    it("creates a customer and returns an id", async () => {
      const id = await provider.createCustomer({
        tenantId: "tenant-1",
        email: "test@example.com",
        name: "Test Company",
      });
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
    });

    it("creates a checkout session with a url", async () => {
      const customerId = await provider.createCustomer({
        tenantId: "tenant-1",
        email: "test@example.com",
        name: "Test Company",
      });

      const session = await provider.createCheckoutSession({
        customerId,
        priceId: "price_test_monthly",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        metadata: { tenantId: "tenant-1", packageId: "pkg-1" },
      });

      expect(session.id).toBeTruthy();
      expect(session.url).toBeTruthy();
      expect(session.status).toBe("open");
      expect(session.metadata.tenantId).toBe("tenant-1");
    });

    it("retrieves a checkout session by id", async () => {
      const customerId = await provider.createCustomer({
        tenantId: "tenant-1",
        email: "test@example.com",
        name: "Test Company",
      });

      const session = await provider.createCheckoutSession({
        customerId,
        priceId: "price_test",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        metadata: {},
      });

      const retrieved = await provider.retrieveCheckoutSession(session.id);
      expect(retrieved.id).toBe(session.id);
    });

    it("verifies webhook signature", () => {
      const result = provider.verifyWebhookSignature(
        '{"test": true}',
        "test_signature",
      );
      expect(typeof result).toBe("boolean");
    });

    it("parses a webhook event", () => {
      const event = provider.parseWebhookEvent({
        id: "evt_test_123",
        type: "invoice.paid",
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: "sub_123" } },
      });

      expect(event.id).toBe("evt_test_123");
      expect(event.type).toBe("invoice.paid");
      expect(event.provider).toBeTruthy();
      expect(event.raw).toBeTruthy();
    });

    it("createCustomer is idempotent for same tenantId", async () => {
      const id1 = await provider.createCustomer({
        tenantId: "tenant-dup",
        email: "dup@example.com",
        name: "Dup",
      });
      const id2 = await provider.createCustomer({
        tenantId: "tenant-dup",
        email: "dup@example.com",
        name: "Dup",
      });
      expect(id2).toBe(id1);
    });
  });
}
