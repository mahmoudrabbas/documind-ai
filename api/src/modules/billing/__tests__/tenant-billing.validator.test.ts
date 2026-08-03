import { describe, expect, it } from "vitest";
import { parseBilling, refundEligibilityPreviewSchema, refundRequestSchema } from "../tenant-billing.validator.js";

describe("single remaining-balance refund contract", () => {
  it("accepts only the local preview and idempotency key", () => {
    expect(parseBilling(refundRequestSchema, { previewId: "507f1f77bcf86cd799439011", idempotencyKey: "refund-key-123" })).toEqual({
      previewId: "507f1f77bcf86cd799439011",
      idempotencyKey: "refund-key-123",
    });
  });

  it("rejects legacy customer-controlled reason, amount, mode, and impact fields", () => {
    expect(() => parseBilling(refundRequestSchema, {
      previewId: "507f1f77bcf86cd799439011",
      idempotencyKey: "refund-key-123",
      reason: "BILLING_ERROR",
      amountMinor: 50,
      mode: "PARTIAL",
      subscriptionImpact: "NONE",
    })).toThrow("Validation failed");
  });

  it("does not accept a customer-selected reason when creating a preview", () => {
    expect(() => parseBilling(refundEligibilityPreviewSchema, {
      invoiceId: "507f1f77bcf86cd799439011",
      reason: "VOLUNTARY_CANCELLATION",
    })).toThrow("Validation failed");
  });
});
