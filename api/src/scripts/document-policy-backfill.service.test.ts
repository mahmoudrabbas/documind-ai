import assert from "node:assert/strict";
import test from "node:test";
import type { BackfillPersistence } from "./document-policy-backfill.service.js";
import { runDocumentPolicyBackfill } from "./document-policy-backfill.service.js";
import type { BackfillPlan, BackfillResult, SourceDocument } from "./document-policy-backfill.contracts.js";

const tenantId = "64a000000000000000000001";
function source(index: number): SourceDocument { const id = `64a0000000000000000000${index}`; return {
  id, tenantId, updatedAt: new Date(0), ownerId: "64a000000000000000000002", uploadedBy: "64a000000000000000000003",
  category: null, department: null, classification: "internal", categoryId: null, departmentId: null,
  classificationId: null, activePolicyId: null, activePolicyVersion: null,
}; }

class FakePersistence implements BackfillPersistence {
  writes = 0;
  constructor(readonly documents: SourceDocument[]) {}
  async scan(tenant: string, afterId: string | undefined, limit: number) { return this.documents.filter((item) => item.tenantId === tenant && (!afterId || item.id > afterId)).slice(0, limit); }
  async userEligible(tenant: string) { return tenant === tenantId; }
  async taxonomyByName() { return null; }
  async apply(plan: BackfillPlan): Promise<BackfillResult> { this.writes += 1; return { tenantId, documentId: plan.document.id, status: "migrated", reasonCode: plan.reason, checkpoint: plan.document.id, policyId: "64a000000000000000000099", policyVersion: 1 }; }
}

test("dry-run is default behavior at service boundary and performs zero writes", async () => {
  const fake = new FakePersistence([source(10)]);
  const report = await runDocumentPolicyBackfill({ apply: false, tenantId, batchSize: 10, limit: 10 }, fake);
  assert.equal(report.counts.would_migrate, 1); assert.equal(fake.writes, 0);
});

test("dry-run and apply share eligibility decisions", async () => {
  const fake = new FakePersistence([source(10)]);
  const dry = await runDocumentPolicyBackfill({ apply: false, tenantId, batchSize: 1, limit: 1 }, fake);
  const applied = await runDocumentPolicyBackfill({ apply: true, tenantId, batchSize: 1, limit: 1 }, fake);
  assert.equal(dry.results[0]?.reasonCode, applied.results[0]?.reasonCode); assert.equal(fake.writes, 1);
});

test("tenant filter, bounded batches, limits, and strict checkpoint resume are enforced", async () => {
  const other = { ...source(12), tenantId: "64a000000000000000000009" };
  const fake = new FakePersistence([source(10), source(11), other]);
  const report = await runDocumentPolicyBackfill({ apply: false, tenantId, batchSize: 1, limit: 1, checkpoint: source(10).id }, fake);
  assert.deepEqual(report.results.map((item) => item.documentId), [source(11).id]);
  assert.equal(report.checkpoint, source(11).id);
});

test("safe results do not contain document content or raw taxonomy values", async () => {
  const report = await runDocumentPolicyBackfill({ apply: false, tenantId, batchSize: 1, limit: 1 }, new FakePersistence([{ ...source(10), category: "Secret Raw Value" }]));
  const serialized = JSON.stringify(report);
  for (const forbidden of ["title", "filename", "description", "tags", "Secret Raw Value"]) assert.equal(serialized.includes(forbidden), false);
});
