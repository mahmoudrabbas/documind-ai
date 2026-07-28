export interface IndexSpec { collection: string; name: string; key: Record<string, 1 | -1>; unique?: boolean; sparse?: boolean; partialFilterExpression?: Record<string, unknown> }
export const ISSUE29_INDEXES: readonly IndexSpec[] = [
  { collection: "billingoperations", name: "uq_billing_operation_idempotency", key: { tenantId: 1, idempotencyKeyHash: 1 }, unique: true },
  { collection: "billingoperations", name: "idx_billing_operation_tenant_status", key: { tenantId: 1, status: 1, createdAt: -1 } },
  { collection: "billingoperations", name: "idx_billing_operation_retry", key: { status: 1, nextRetryAt: 1 } },
  { collection: "billingoperations", name: "idx_billing_operation_subscription_type", key: { subscriptionId: 1, operationType: 1 } },
  { collection: "billingoperations", name: "idx_billing_operation_trace", key: { traceId: 1 }, sparse: true },
  { collection: "billingoperations", name: "uq_billing_operation_pending_conflict_group", key: { tenantId: 1, subscriptionId: 1, conflictGroup: 1 }, unique: true, partialFilterExpression: { status: { $in: ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] }, subscriptionId: { $type: "objectId" }, conflictGroup: { $type: "string" } } },
  { collection: "invoices", name: "uq_provider_invoice", key: { provider: 1, providerInvoiceId: 1 }, unique: true },
  { collection: "invoices", name: "idx_invoice_tenant_created", key: { tenantId: 1, createdAtProvider: -1 } },
  { collection: "invoices", name: "idx_invoice_tenant_status", key: { tenantId: 1, status: 1 } },
  { collection: "invoices", name: "idx_invoice_tenant_subscription", key: { tenantId: 1, subscriptionId: 1 } },
  {
    collection: "refunds",
    name: "uq_provider_refund",
    key: { provider: 1, providerRefundId: 1 },
    unique: true,
    partialFilterExpression: { providerRefundId: { $type: "string" } },
  },
  { collection: "refunds", name: "idx_refund_tenant_created", key: { tenantId: 1, createdAt: -1 } },
  { collection: "refunds", name: "idx_refund_tenant_invoice", key: { tenantId: 1, invoiceId: 1 } },
  { collection: "refunds", name: "uq_refund_operation", key: { operationId: 1 }, unique: true },
];

export interface MigrationCollection {
  indexes(): Promise<Array<{ name?: string; key: Record<string, unknown>; unique?: boolean; sparse?: boolean; partialFilterExpression?: Record<string, unknown> }>>;
  createIndex(key: Record<string, 1 | -1>, options: Record<string, unknown>): Promise<string>;
}
export interface MigrationDatabase { collection(name: string): MigrationCollection }
export interface BillingIndexMigrationReport { mode: "dry-run" | "apply"; created: string[]; existing: string[]; conflicts: string[]; businessDocumentsMutated: 0 }

export async function migrateIssue29BillingIndexes(db: MigrationDatabase, apply = false): Promise<BillingIndexMigrationReport> {
  const report: BillingIndexMigrationReport = { mode: apply ? "apply" : "dry-run", created: [], existing: [], conflicts: [], businessDocumentsMutated: 0 };
  for (const spec of ISSUE29_INDEXES) {
    const collection = db.collection(spec.collection);
    let existing: Awaited<ReturnType<MigrationCollection["indexes"]>>;
    try { existing = await collection.indexes(); }
    catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 26) existing = [];
      else throw error;
    }
    const named = existing.find((item) => item.name === spec.name);
    if (named) {
      if (sameIndex(named, spec)) report.existing.push(`${spec.collection}.${spec.name}`);
      else report.conflicts.push(`${spec.collection}.${spec.name}`);
      continue;
    }
    const equivalent = existing.find((item) => JSON.stringify(item.key) === JSON.stringify(spec.key));
    if (equivalent) { report.conflicts.push(`${spec.collection}.${spec.name}`); continue; }
    if (apply) await collection.createIndex(spec.key, { name: spec.name, ...(spec.unique ? { unique: true } : {}), ...(spec.sparse ? { sparse: true } : {}), ...(spec.partialFilterExpression ? { partialFilterExpression: spec.partialFilterExpression } : {}) });
    report.created.push(`${spec.collection}.${spec.name}`);
  }
  if (report.conflicts.length) throw new BillingIndexMigrationConflict(report);
  return report;
}

export class BillingIndexMigrationConflict extends Error {
  constructor(public readonly report: BillingIndexMigrationReport) { super("ISSUE29_BILLING_INDEX_CONFLICT"); }
}
function sameIndex(existing: Record<string, unknown>, desired: IndexSpec): boolean {
  return JSON.stringify(existing.key) === JSON.stringify(desired.key) && Boolean(existing.unique) === Boolean(desired.unique) && Boolean(existing.sparse) === Boolean(desired.sparse) && JSON.stringify(existing.partialFilterExpression ?? null) === JSON.stringify(desired.partialFilterExpression ?? null);
}
