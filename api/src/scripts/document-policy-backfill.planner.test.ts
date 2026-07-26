import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { planDocumentBackfill, type PlannerLookups } from "./document-policy-backfill.planner.js";
import type { SourceDocument, TaxonomyIdentity } from "./document-policy-backfill.contracts.js";

const tenantId = "64a000000000000000000001";
const ownerId = "64a000000000000000000002";
const uploaderId = "64a000000000000000000003";

function document(changes: Partial<SourceDocument> = {}): SourceDocument {
  return { id: "64a000000000000000000010", tenantId, updatedAt: new Date("2026-01-01T00:00:00Z"),
    ownerId, uploadedBy: uploaderId, category: "  Human   Resources ", department: null,
    classification: "internal", categoryId: null, departmentId: null, classificationId: null,
    activePolicyId: null, activePolicyVersion: null, ...changes };
}

function lookups(input: { eligible?: string[]; records?: TaxonomyIdentity[] } = {}): PlannerLookups {
  const eligible = new Set(input.eligible ?? [ownerId, uploaderId]);
  return {
    userEligible: async (tenant, user) => tenant === tenantId && eligible.has(user),
    taxonomyByName: async (tenant, kind, normalizedName) => input.records?.find((record) => tenant === tenantId && record.kind === kind && record.normalizedName === normalizedName) ?? null,
  };
}

test("preserves an eligible owner and plans normalized tenant taxonomy", async () => {
  const plan = await planDocumentBackfill(document(), lookups());
  assert.equal(plan.ownerId, ownerId);
  assert.equal(plan.quarantined, false);
  assert.deepEqual(plan.taxonomy.map(({ kind, normalizedName, create }) => ({ kind, normalizedName, create })), [
    { kind: "category", normalizedName: "human resources", create: true },
    { kind: "classification", normalizedName: "internal", create: true },
  ]);
});

test("falls back to uploadedBy but never to an arbitrary user", async () => {
  assert.equal((await planDocumentBackfill(document(), lookups({ eligible: [uploaderId] }))).ownerId, uploaderId);
  const missing = await planDocumentBackfill(document(), lookups({ eligible: [] }));
  assert.equal(missing.reason, "OWNER_UNRESOLVED");
  assert.equal(missing.quarantined, true);
});

test("cross-tenant or malformed owner identity is indistinguishable from missing", async () => {
  const plan = await planDocumentBackfill(document({ ownerId: new mongoose.Types.ObjectId().toHexString(), uploadedBy: "invalid" }), lookups());
  assert.equal(plan.reason, "OWNER_UNRESOLVED");
});

test("reuses active identities and quarantines archived conflicts", async () => {
  const active: TaxonomyIdentity = { id: "64a000000000000000000020", kind: "category", normalizedName: "human resources", status: "active" };
  const reused = await planDocumentBackfill(document(), lookups({ records: [active] }));
  assert.equal(reused.taxonomy[0]?.existingId, active.id);
  const archived = await planDocumentBackfill(document(), lookups({ records: [{ ...active, status: "archived" }] }));
  assert.equal(archived.reason, "TAXONOMY_ARCHIVED_CONFLICT");
});

test("blank optional names remain absent and invalid classification defaults to restricted", async () => {
  const plan = await planDocumentBackfill(document({ category: " ", department: null, classification: "public" }), lookups());
  assert.equal(plan.reason, "DEFAULTED_TO_RESTRICTED");
  assert.deepEqual(plan.taxonomy.map((item) => [item.kind, item.normalizedName]), [["classification", "restricted"]]);
});

test("an active policy is deterministically already migrated", async () => {
  const plan = await planDocumentBackfill(document({ activePolicyId: ownerId, activePolicyVersion: 1 }), lookups());
  assert.equal(plan.reason, "ALREADY_MIGRATED");
  assert.equal(plan.taxonomy.length, 0);
});
