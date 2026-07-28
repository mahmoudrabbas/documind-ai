import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setAuditWriter } from "../../../common/observability/index.js";
import BillingOperationModel from "../../../db/models/billingOperation.model.js";
import RefundModel from "../../../db/models/refund.model.js";
import { BillingOperationService } from "../billing-operation.service.js";
import { reconcileBillingOperation } from "../billing-operation-reconciliation.service.js";
import { migrateIssue29BillingIndexes, type MigrationDatabase } from "../../../scripts/migrate-issue29-billing-indexes.service.js";

const tenantId = new Types.ObjectId(); const otherTenantId = new Types.ObjectId(); const actorId = new Types.ObjectId(); const subscriptionId = new Types.ObjectId();
const actor = { tenantId: String(tenantId), actorId: String(actorId), actorEmail: "billing@example.test", actorRole: "COMPANY_ADMIN" as const, traceId: "trace-1", requestId: "request-1" };
function input(key: string, normalizedRequest: Record<string, unknown> = { targetPackage: "pro" }, operationType: "PLAN_CHANGE" | "CANCEL_PERIOD_END" | "CANCEL_IMMEDIATELY" | "REACTIVATE" | "REFUND" = "PLAN_CHANGE") { return { tenantId: String(tenantId), actor, operationType, idempotencyKey: key, normalizedRequest, subscriptionId: String(subscriptionId), provider: "fake", expectedSubscriptionRevision: 1 }; }

describe("BillingOperation durable persistence", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI!);
    setAuditWriter({ write: async () => true });
    await BillingOperationModel.syncIndexes();
  });
  beforeEach(async () => { await Promise.all([BillingOperationModel.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } }), RefundModel.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } })]); });
  afterAll(async () => { await Promise.all([BillingOperationModel.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } }), RefundModel.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } })]); setAuditWriter(null); });

  it("replays same key/request and conflicts for a changed request", async () => {
    const service = new BillingOperationService(); const first = await service.begin(input("key-1")); const replay = await service.begin(input("key-1"));
    expect(replay.replayed).toBe(true); expect(String(replay.operation._id)).toBe(String(first.operation._id));
    await expect(service.begin(input("key-1", { targetPackage: "enterprise" }))).rejects.toMatchObject({ code: "BILLING_IDEMPOTENCY_KEY_REUSED" });
    expect(await BillingOperationModel.countDocuments({ tenantId })).toBe(1);
  });

  it("converges concurrent identical requests and prevents conflicting pending operations", async () => {
    const service = new BillingOperationService(); const results = await Promise.all([service.begin(input("same")), service.begin(input("same"))]);
    expect(new Set(results.map((result) => String(result.operation._id))).size).toBe(1);
    await expect(service.begin(input("other", { targetPackage: "enterprise" }))).rejects.toMatchObject({ code: "BILLING_OPERATION_ALREADY_PENDING" });
  });

  it("blocks package/cancellation/reactivation conflicts but allows independent refunds", async () => {
    const service = new BillingOperationService();
    await service.begin(input("plan-pending"));
    await expect(service.begin(input("cancel-conflict", { cancellation: "period_end" }, "CANCEL_PERIOD_END"))).rejects.toMatchObject({ code: "BILLING_OPERATION_ALREADY_PENDING" });
    await expect(service.begin(input("reactivate-conflict", { reactivate: true }, "REACTIVATE"))).rejects.toMatchObject({ code: "BILLING_OPERATION_ALREADY_PENDING" });
    const [firstRefund, secondRefund] = await Promise.all([
      service.begin(input("refund-a", { invoiceId: "invoice-a", amountMinor: 100 }, "REFUND")),
      service.begin(input("refund-b", { invoiceId: "invoice-b", amountMinor: 200 }, "REFUND")),
    ]);
    expect(firstRefund.operation.conflictGroup).toBeNull();
    expect(secondRefund.operation.conflictGroup).toBeNull();
    expect(await BillingOperationModel.countDocuments({ tenantId, status: "REQUESTED" })).toBe(3);
  });

  it("persists intent before provider invocation and survives service restart", async () => {
    const firstService = new BillingOperationService(); const started = await firstService.begin(input("crash-before-provider"));
    expect((await BillingOperationModel.findById(started.operation._id))?.status).toBe("REQUESTED");
    const afterRestart = await new BillingOperationService().begin(input("crash-before-provider")); expect(afterRestart.replayed).toBe(true);
  });

  it("records timeout as retryable and resumes with the durable operation", async () => {
    const service = new BillingOperationService();
    await expect(service.execute(input("timeout"), async () => { throw new Error("timeout detail"); })).rejects.toMatchObject({ code: "BILLING_PROVIDER_UNAVAILABLE" });
    const pending = await BillingOperationModel.findOne({ tenantId, status: "RETRY_PENDING" }); expect(pending?.retryCount).toBe(1);
    const resumed = await new BillingOperationService().resume(String(pending?._id), String(tenantId), async () => ({ operationReference: "provider-op" }));
    expect(resumed.result.operationReference).toBe("provider-op");
    expect((await BillingOperationModel.findById(pending?._id))?.providerOperationReference).toBe("provider-op");
  });

  it("keeps provider success durable and retryable when local result persistence fails", async () => {
    const service = new BillingOperationService(); vi.spyOn(service, "recordProviderResult").mockRejectedValueOnce(new Error("temporary local write failure"));
    await expect(service.execute(input("provider-success-local-failure"), async () => ({ operationReference: "provider-succeeded" }))).rejects.toMatchObject({ code: "BILLING_PROVIDER_UNAVAILABLE" });
    const durable = await BillingOperationModel.findOne({ tenantId, status: "RETRY_PENDING" }); expect(durable).not.toBeNull();
    await expect(new BillingOperationService().resume(String(durable?._id), String(tenantId), async () => ({ operationReference: "provider-succeeded" }))).resolves.toMatchObject({ result: { operationReference: "provider-succeeded" } });
  });

  it("denies cross-tenant operation lookup without revealing existence", async () => {
    const operation = await new BillingOperationService().begin(input("tenant-scope"));
    await expect(new BillingOperationService().findForTenant(String(operation.operation._id), String(otherTenantId))).rejects.toMatchObject({ code: "BILLING_OPERATION_NOT_FOUND", statusCode: 404 });
  });

  it("supports superseding a pending operation", async () => {
    const service = new BillingOperationService(); const started = await service.begin(input("supersede")); await service.supersede(String(started.operation._id), String(tenantId));
    expect((await BillingOperationModel.findById(started.operation._id))?.status).toBe("SUPERSEDED");
  });

  it("applies indexes idempotently against the disposable database without business mutation", async () => {
    if (!mongoose.connection.db) throw new Error("Disposable test database unavailable");
    const sentinelId = new Types.ObjectId(); await mongoose.connection.db.collection("subscriptions").insertOne({ _id: sentinelId, sentinel: "preserve" });
    const first = await migrateIssue29BillingIndexes(mongoose.connection.db as unknown as MigrationDatabase, true);
    const repeated = await migrateIssue29BillingIndexes(mongoose.connection.db as unknown as MigrationDatabase, true);
    expect(first.businessDocumentsMutated).toBe(0); expect(repeated.created).toHaveLength(0);
    expect(await mongoose.connection.db.collection("subscriptions").findOne({ _id: sentinelId })).toMatchObject({ sentinel: "preserve" });
    await mongoose.connection.db.collection("subscriptions").deleteOne({ _id: sentinelId });
  }, 20_000);

  it("allows multiple refund records before provider IDs are assigned", async () => {
    await RefundModel.syncIndexes();
    const common = { tenantId, subscriptionId, invoiceId: null, paymentReference: "payment", amountMinor: 100, currency: "USD", reason: "requested", requestedBy: actorId, provider: "fake" };
    await expect(RefundModel.create([{ ...common, operationId: new Types.ObjectId() }, { ...common, operationId: new Types.ObjectId() }])).resolves.toHaveLength(2);
  });

  it("reconciles provider response/webhook order and tolerates missing local operations", async () => {
    const service = new BillingOperationService(); const started = await service.begin(input("webhook-order")); const pending = await service.markProviderPending(started.operation);
    await service.recordProviderResult(String(pending._id), String(tenantId), { operationReference: "provider-operation-1", objectReference: "provider-object-1" });
    const confirmed = await reconcileBillingOperation({ tenantId: String(tenantId), providerObjectReference: "provider-object-1", providerEventId: "evt-late", outcome: "CONFIRMED" });
    expect(confirmed.matched).toBe(true); expect((await BillingOperationModel.findById(pending._id))?.confirmingProviderEventIds).toContain("evt-late");
    expect(await reconcileBillingOperation({ tenantId: String(tenantId), providerOperationReference: "missing", providerEventId: "evt-missing", outcome: "CONFIRMED" })).toEqual({ matched: false, operationId: null });
    const next = await service.begin(input("ownership-check", { targetPackage: "next" }));
    await expect(reconcileBillingOperation({ tenantId: String(otherTenantId), operationReference: String(next.operation._id), providerEventId: "evt-wrong", outcome: "CONFIRMED" })).rejects.toMatchObject({ code: "BILLING_PROVIDER_OWNERSHIP_MISMATCH" });
    expect(await reconcileBillingOperation({ tenantId: String(tenantId), operationReference: String(next.operation._id), providerEventId: "evt-before-response", outcome: "CONFIRMED" })).toMatchObject({ matched: true });
  });
});
