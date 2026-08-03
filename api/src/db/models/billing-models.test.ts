import { describe, expect, it } from "vitest";
import BillingOperationModel from "./billingOperation.model.js";
import InvoiceModel from "./invoice.model.js";
import RefundModel from "./refund.model.js";

describe("Issue 29 billing schemas", () => {
  it("declares durable operation and concurrency indexes", () => {
    const indexes = BillingOperationModel.schema.indexes() as Array<[Record<string, number>, Record<string, unknown>]>;
    expect(indexes.some(([, options]) => options.name === "uq_billing_operation_idempotency" && options.unique)).toBe(true);
    expect(indexes.some(([, options]) => options.name === "uq_billing_operation_pending_conflict_group" && options.unique)).toBe(true);
    expect(BillingOperationModel.schema.path("idempotencyKeyHash").options.select).toBe(false);
  });
  it("declares tenant invoice indexes and hides links by default", () => {
    expect((InvoiceModel.schema.indexes() as Array<[Record<string, number>, Record<string, unknown>]>).map(([, options]) => options.name)).toEqual(expect.arrayContaining(["uq_provider_invoice", "idx_invoice_tenant_created", "idx_invoice_tenant_status", "idx_invoice_tenant_subscription"]));
    expect(InvoiceModel.schema.path("hostedInvoiceUrl").options.select).toBe(false);
    expect(InvoiceModel.schema.path("invoicePdfUrl").options.select).toBe(false);
    expect(InvoiceModel.schema.path("receiptUrl").options.select).toBe(false);
    expect(InvoiceModel.schema.path("hostedInvoiceAvailable").options.default).toBe(false);
  });
  it("supports multiple partial refunds without using subscription payment state", () => {
    expect((RefundModel.schema.indexes() as Array<[Record<string, number>, Record<string, unknown>]>).map(([, options]) => options.name)).toEqual(expect.arrayContaining(["uq_provider_refund", "idx_refund_tenant_invoice", "uq_refund_operation"]));
    expect((RefundModel.schema.indexes() as Array<[Record<string, number>, Record<string, unknown>]>).find(([, options]) => options.name === "uq_provider_refund")?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { providerRefundId: { $type: "string" } },
    });
    expect(RefundModel.schema.path("amountMinor").options.min).toBe(1);
    expect(RefundModel.schema.path("providerRefundId").options.default).toBeUndefined();
  });
});
