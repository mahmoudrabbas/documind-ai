import assert from "node:assert/strict";
import test from "node:test";
import { isDerivedAccessMetadataCurrent, requireCurrentPolicyGeneration, validateDerivedAccessMetadata,
  validateDocumentPolicyPropagationJobV1 } from "./documentPolicyPropagation.contracts.js";

const id = (digit: string) => digit.repeat(24);
const eventId = "a".repeat(64); const generationId = "b".repeat(64);
const job = { schemaVersion: 1, eventId, tenantId: id("1"), documentId: id("2"), documentVersion: 1,
  policyId: id("3"), policyVersion: 2, previousPolicyVersion: 1, generationId, classificationId: null,
  categoryId: null, departmentId: null, changeDirection: "tightening", sensitiveBroadening: false, propagationReason: "policy_change",
  requestedAt: "2026-07-23T00:00:00.000Z", correlationId: "operation-1" };

test("propagation job V1 accepts a bounded strict payload", () => {
  assert.deepEqual(validateDocumentPolicyPropagationJobV1(job), job);
});

test("propagation job rejects unknown schema, malformed IDs, versions, direction, and fields", () => {
  assert.throws(() => validateDocumentPolicyPropagationJobV1({ ...job, schemaVersion: 2 }));
  assert.throws(() => validateDocumentPolicyPropagationJobV1({ ...job, tenantId: "bad" }));
  assert.throws(() => validateDocumentPolicyPropagationJobV1({ ...job, policyVersion: 0 }));
  assert.throws(() => validateDocumentPolicyPropagationJobV1({ ...job, changeDirection: "no_change" }));
  assert.throws(() => validateDocumentPolicyPropagationJobV1({ ...job, title: "forbidden" }));
});

test("derived access metadata is serializable, versioned, and requires current revalidation", () => {
  const metadata = { schemaVersion: 1, tenantId: job.tenantId, documentId: job.documentId, documentVersion: 1,
    policyId: job.policyId, policyVersion: 2, classificationId: null, categoryId: null, departmentId: null,
    generationId, updatedAt: job.requestedAt, requiresCurrentPolicyRevalidation: true };
  assert.ok(validateDerivedAccessMetadata(JSON.parse(JSON.stringify(metadata))));
  assert.equal(isDerivedAccessMetadataCurrent(metadata, { tenantId: job.tenantId, documentId: job.documentId,
    documentVersion: 1, policyId: job.policyId, policyVersion: 2, generationId, classificationId: null, categoryId: null, departmentId: null }), true);
  assert.equal(isDerivedAccessMetadataCurrent(metadata, { tenantId: job.tenantId, documentId: job.documentId,
    documentVersion: 1, policyId: job.policyId, policyVersion: 3, generationId, classificationId: null, categoryId: null, departmentId: null }), false);
  assert.throws(() => requireCurrentPolicyGeneration(undefined, { tenantId: job.tenantId, documentId: job.documentId,
    documentVersion: 1, policyId: job.policyId, policyVersion: 2, generationId, classificationId: null, categoryId: null, departmentId: null }));
});
