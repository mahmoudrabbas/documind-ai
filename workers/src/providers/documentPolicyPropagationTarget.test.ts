import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { MongoDocumentPolicyPropagationTarget } from "./documentPolicyPropagationTarget.js";
import type { DerivedAccessMetadataV1 } from "../contracts/documentPolicyPropagation.js";

const tenantId = "1".repeat(24);
const otherTenantId = "9".repeat(24);
const documentId = "2".repeat(24);
const generationId = "3".repeat(24);
const obsoleteGenerationId = "4".repeat(24);

function metadata(overrides: Partial<DerivedAccessMetadataV1> = {}): DerivedAccessMetadataV1 {
  return { schemaVersion: 1, tenantId, documentId, documentVersion: 1, policyId: "5".repeat(24), policyVersion: 2,
    classificationId: null, categoryId: null, departmentId: null, generationId: "a".repeat(64),
    updatedAt: "2026-08-11T00:00:00.000Z", requiresCurrentPolicyRevalidation: true, ...overrides };
}

function fakeDb(document: Record<string, unknown> | null, initial = { department: "HR", category: "Policies", classification: "internal" }, expected = 1, mutate = true) {
  const calls: Array<{ collection: string; filter: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const chunks = [{ ...initial }]; const embeddings = [{ ...initial }];
  const collections = new Map<string, { findOne?: (filter?: Record<string, unknown>) => Promise<Record<string, unknown> | null>; updateMany: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<{ matchedCount: number; modifiedCount: number }>; countDocuments?: (filter: Record<string, unknown>) => Promise<number> }>();
  const retrieval = (name: string, records: Array<Record<string, unknown>>) => ({
    updateMany: async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      calls.push({ collection: name, filter, update });
      const matches = records.filter(() => expected > 0);
      if (mutate) for (const record of matches) Object.assign(record, update.$set);
      return { matchedCount: matches.length, modifiedCount: matches.length };
    },
    countDocuments: async (filter: Record<string, unknown>) => records.filter((record) =>
      (filter.$or as Array<Record<string, Record<string, unknown>>> | undefined)?.some((condition) => {
        const [key, operator] = Object.entries(condition)[0]!;
        return record[key] !== operator.$ne;
      }) ?? false).length,
  });
  collections.set("documentchunks", retrieval("documentchunks", chunks));
  collections.set("chunkembeddings", retrieval("chunkembeddings", embeddings));
  for (const name of ["extractionartifacts", "ocrpageresults"]) collections.set(name, { updateMany: async (filter, update) => {
    calls.push({ collection: name, filter, update }); return { matchedCount: 0, modifiedCount: 0 };
  } });
  collections.set("documents", { findOne: async () => document, updateMany: async () => ({ matchedCount: 0, modifiedCount: 0 }) });
  collections.set("indexgenerations", { findOne: async () => ({ expectedChunkCount: 1, expectedEmbeddingCount: 1 }), updateMany: async () => ({ matchedCount: 0, modifiedCount: 0 }) });
  return { db: { collection(name: string) { return collections.get(name)!; } }, calls, chunks, embeddings };
}

test("propagates all retrieval taxonomy fields to active chunks and embeddings", async () => {
  const fake = fakeDb({ _id: documentId, activeChunkGeneration: new ObjectId(generationId), department: "HR", category: "Policies", classification: "internal" });
  await new MongoDocumentPolicyPropagationTarget(fake.db as never).updateAccessMetadata(metadata({ generationId: "b".repeat(64) }));
  assert.equal(fake.chunks[0]!.department, "HR");
  assert.equal(fake.chunks[0]!.category, "Policies");
  assert.equal(fake.chunks[0]!.classification, "internal");
  assert.equal(fake.embeddings[0]!.department, "HR");
  const retrievalCalls = fake.calls.filter((call) => call.collection === "documentchunks" || call.collection === "chunkembeddings")
    .filter((call) => "department" in ((call.update.$set ?? {}) as Record<string, unknown>));
  assert.equal(retrievalCalls.length, 2);
  for (const call of retrievalCalls) {
    assert.deepEqual(call.update, { $set: { department: "HR", category: "Policies", classification: "internal" } });
    assert.equal((call.filter.tenantId as ObjectId).toHexString(), tenantId);
    assert.equal((call.filter.documentId as ObjectId).toHexString(), documentId);
    assert.equal((call.filter.generationId as ObjectId).toHexString(), generationId);
  }
});

test("HR -> Finance updates the active retrieval representation and is idempotent", async () => {
  const fake = fakeDb({ _id: documentId, activeChunkGeneration: new ObjectId(generationId), department: "Finance", category: null, classification: "internal" });
  fake.chunks[0].department = "HR"; fake.embeddings[0].department = "HR";
  await new MongoDocumentPolicyPropagationTarget(fake.db as never).updateAccessMetadata(metadata());
  assert.equal(fake.chunks[0].department, "Finance");
  assert.equal(fake.embeddings[0].department, "Finance");
  await new MongoDocumentPolicyPropagationTarget(fake.db as never).updateAccessMetadata(metadata());
  assert.equal(fake.chunks[0].department, "Finance");
});

test("propagates all department transitions in both directions, including null", async () => {
  for (const [from, to] of [[null, "HR"], ["Finance", "HR"], ["Finance", null]] as const) {
    const fake = fakeDb({ _id: documentId, activeChunkGeneration: new ObjectId(generationId), department: to, category: null, classification: "internal" },
      { department: from, category: null, classification: "internal" });
    await new MongoDocumentPolicyPropagationTarget(fake.db as never).updateAccessMetadata(metadata());
    assert.equal(fake.chunks[0]!.department, to);
    assert.equal(fake.embeddings[0]!.department, to);
  }
});

test("clears changed taxonomy values and never targets another tenant or obsolete generation", async () => {
  const fake = fakeDb({ _id: documentId, activeChunkGeneration: new ObjectId(generationId), department: null, category: null, classification: "internal" });
  await new MongoDocumentPolicyPropagationTarget(fake.db as never).updateAccessMetadata(metadata({ tenantId: otherTenantId }));
  const retrieval = fake.calls.filter((call) => call.collection === "documentchunks" || call.collection === "chunkembeddings")
    .filter((call) => "department" in ((call.update.$set ?? {}) as Record<string, unknown>));
  assert.equal((retrieval[0]!.filter.tenantId as ObjectId).toHexString(), otherTenantId);
  assert.notEqual((retrieval[0]!.filter.generationId as ObjectId).toHexString(), obsoleteGenerationId);
  assert.deepEqual(retrieval[0]!.update, { $set: { department: null, category: null, classification: "internal" } });
});

test("fails closed when expected active chunks are missing", async () => {
  const fake = fakeDb({ _id: documentId, activeChunkGeneration: new ObjectId(generationId), department: "Finance", category: null, classification: "internal" }, undefined, 0);
  await assert.rejects(
    new MongoDocumentPolicyPropagationTarget(fake.db as never).updateAccessMetadata(metadata()),
    /DOCUMENT_POLICY_PROPAGATION_ACTIVE_CHUNKS_NOT_FOUND/,
  );
});

test("fails closed when a matched active representation remains stale", async () => {
  const fake = fakeDb({ _id: documentId, activeChunkGeneration: new ObjectId(generationId), department: "Finance", category: null, classification: "internal" },
    { department: "HR", category: null, classification: "internal" }, 1, false);
  await assert.rejects(
    new MongoDocumentPolicyPropagationTarget(fake.db as never).updateAccessMetadata(metadata()),
    /DOCUMENT_POLICY_PROPAGATION_ACTIVE_CHUNKS_INCONSISTENT/,
  );
});

test("fails propagation when the authoritative document is not current", async () => {
  const fake = fakeDb(null);
  await assert.rejects(
    new MongoDocumentPolicyPropagationTarget(fake.db as never).updateAccessMetadata(metadata()),
    /DOCUMENT_POLICY_PROPAGATION_DOCUMENT_NOT_CURRENT/,
  );
  assert.equal(fake.calls.filter((call) => call.collection === "documentchunks").length, 0);
});
