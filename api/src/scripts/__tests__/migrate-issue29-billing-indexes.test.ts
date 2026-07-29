import { describe, expect, it } from "vitest";
import { ISSUE29_INDEXES, BillingIndexMigrationConflict, migrateIssue29BillingIndexes, type MigrationCollection, type MigrationDatabase } from "../migrate-issue29-billing-indexes.service.js";

function database(seed: Record<string, Array<Record<string, unknown>>> = {}) {
  const state = new Map(Object.entries(seed)); const creates: string[] = [];
  const db: MigrationDatabase = { collection(name) { return {
    indexes: async () => (state.get(name) ?? [{ name: "_id_", key: { _id: 1 } }]) as never,
    createIndex: async (key, options) => { const list = state.get(name) ?? [{ name: "_id_", key: { _id: 1 } }]; list.push({ key, ...options }); state.set(name, list); creates.push(`${name}.${String(options.name)}`); return String(options.name); },
  } satisfies MigrationCollection; } };
  return { db, creates, state };
}
describe("Issue 29 billing index migration", () => {
  it("is dry-run by default and does not mutate collections", async () => {
    const fixture = database(); const report = await migrateIssue29BillingIndexes(fixture.db);
    expect(report).toMatchObject({ mode: "dry-run", businessDocumentsMutated: 0 }); expect(fixture.creates).toHaveLength(0); expect(report.created).toHaveLength(ISSUE29_INDEXES.length);
  });
  it("applies and repeats idempotently", async () => {
    const fixture = database(); const applied = await migrateIssue29BillingIndexes(fixture.db, true);
    expect(applied.created).toHaveLength(ISSUE29_INDEXES.length);
    const repeated = await migrateIssue29BillingIndexes(fixture.db, true); expect(repeated.created).toHaveLength(0); expect(repeated.existing).toHaveLength(ISSUE29_INDEXES.length);
  });
  it("covers the additive billing preview indexes", () => {
    expect(ISSUE29_INDEXES.filter((spec) => spec.collection === "billingpreviews").map((spec) => spec.name)).toEqual([
      "idx_billing_preview_tenant_subscription",
      "idx_billing_preview_tenant_expiry",
      "idx_billing_preview_reuse",
      "tenantId_1",
      "subscriptionId_1",
      "expiresAt_1",
      "consumedByOperationId_1",
    ]);
  });
  it("covers invoice reconciliation lock and provider-object lookup indexes", () => {
    expect(ISSUE29_INDEXES.filter((spec) => spec.collection === "billingoperations").map((spec) => spec.name)).toEqual(expect.arrayContaining([
      "idx_billing_operation_tenant_provider_object",
      "uq_billing_operation_pending_invoice_reconciliation",
    ]));
  });
  it("reports conflicting named indexes without replacing them", async () => {
    const fixture = database({ billingoperations: [{ name: "_id_", key: { _id: 1 } }, { name: "uq_billing_operation_idempotency", key: { wrong: 1 }, unique: true }] });
    await expect(migrateIssue29BillingIndexes(fixture.db, true)).rejects.toBeInstanceOf(BillingIndexMigrationConflict); expect(fixture.creates).not.toContain("billingoperations.uq_billing_operation_idempotency");
  });
});
