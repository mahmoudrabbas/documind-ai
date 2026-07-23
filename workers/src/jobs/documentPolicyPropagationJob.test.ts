import assert from "node:assert/strict";
import test from "node:test";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";
import type { DocumentPolicyPropagationPayload, DerivedAccessMetadataV1 } from "../contracts/documentPolicyPropagation.js";
import { FakeDocumentPolicyPropagationTarget } from "../providers/documentPolicyPropagationTarget.js";
import { processDocumentPolicyPropagation, type PolicyPropagationWorkerRepository } from "./documentPolicyPropagationJob.js";

const payload: DocumentPolicyPropagationPayload = { schemaVersion: 1, eventId: "a".repeat(64), tenantId: "1".repeat(24),
  documentId: "2".repeat(24), documentVersion: 1, policyId: "3".repeat(24), policyVersion: 2, previousPolicyVersion: 1,
  generationId: "b".repeat(64), classificationId: null, categoryId: null, departmentId: null,
  changeDirection: "tightening", sensitiveBroadening: false, propagationReason: "policy_change", requestedAt: "2026-07-23T00:00:00.000Z", correlationId: "operation-1" };

class FakeRepository implements PolicyPropagationWorkerRepository {
  claimResult: Awaited<ReturnType<PolicyPropagationWorkerRepository["claim"]>> = "claimed";
  authority: Awaited<ReturnType<PolicyPropagationWorkerRepository["loadAuthority"]>> = { documentVersion: 1, policyId: payload.policyId,
    policyVersion: 2, classificationId: null, categoryId: null, departmentId: null, lifecycleCurrent: true, snapshotValid: true, reindexRequired: false };
  completed: Array<{ metadata: DerivedAccessMetadataV1; reindexing: boolean }> = []; superseded = 0; failures: string[] = []; audits: string[] = [];
  async claim() { return this.claimResult; } async loadAuthority() { return this.authority; }
  async supersede() { this.superseded += 1; }
  async complete(_payload: DocumentPolicyPropagationPayload, metadata: DerivedAccessMetadataV1, reindexing: boolean) { this.completed.push({ metadata, reindexing }); }
  async fail(_payload: DocumentPolicyPropagationPayload, code: string) { this.failures.push(code); }
  async audit(_payload: DocumentPolicyPropagationPayload, action: string) { this.audits.push(action); }
}
function context(attemptsMade = 0): JobHandlerContext { return { envelope: { jobType: "document.policy.propagate", schemaVersion: "1.0.0",
  tenantId: payload.tenantId, actorId: "4".repeat(24), traceId: payload.eventId, idempotencyKey: payload.eventId, payload,
  createdAt: payload.requestedAt }, traceId: payload.eventId, isRetry: attemptsMade > 0, attemptsMade, maxAttempts: 5,
  signal: new AbortController().signal, progress() {} }; }

test("matching authoritative policy updates metadata and completes idempotently", async () => {
  const repository = new FakeRepository(); const target = new FakeDocumentPolicyPropagationTarget();
  assert.equal((await processDocumentPolicyPropagation(payload, context(), repository, target)).summary?.status, "completed");
  assert.equal(target.metadataUpdates.length, 1); assert.equal(repository.completed[0]?.metadata.policyVersion, 2);
  repository.claimResult = "completed";
  assert.equal((await processDocumentPolicyPropagation(payload, context(), repository, target)).summary?.status, "completed");
  assert.equal(target.metadataUpdates.length, 1);
});

test("older policy or document jobs are superseded without derived writes", async () => {
  const repository = new FakeRepository(); repository.authority = { ...repository.authority!, policyVersion: 3 };
  const target = new FakeDocumentPolicyPropagationTarget();
  assert.equal((await processDocumentPolicyPropagation(payload, context(), repository, target)).summary?.status, "superseded");
  assert.equal(repository.superseded, 1); assert.equal(target.metadataUpdates.length, 0);
});

test("newer-than-current and taxonomy mismatches fail closed", async () => {
  const repository = new FakeRepository(); repository.authority = { ...repository.authority!, policyVersion: 1 };
  await assert.rejects(processDocumentPolicyPropagation(payload, context(), repository, new FakeDocumentPolicyPropagationTarget()));
  assert.equal(repository.failures.at(-1), "DOCUMENT_POLICY_GENERATION_MISMATCH");
  const taxonomy = new FakeRepository(); taxonomy.authority = { ...taxonomy.authority!, categoryId: "5".repeat(24) };
  await assert.rejects(processDocumentPolicyPropagation(payload, context(), taxonomy, new FakeDocumentPolicyPropagationTarget()));
  assert.equal(taxonomy.completed.length, 0);
});

test("durable reindex request does not mark a generation current", async () => {
  const repository = new FakeRepository(); repository.authority = { ...repository.authority!, reindexRequired: true };
  const target = new FakeDocumentPolicyPropagationTarget();
  assert.equal((await processDocumentPolicyPropagation(payload, context(), repository, target)).summary?.status, "reindexing");
  assert.equal(target.reindexRequests.length, 1); assert.equal(repository.completed[0]?.reindexing, true);
});

test("target failures retain safe retry/dead-letter codes without raw errors", async () => {
  const repository = new FakeRepository(); const target = new FakeDocumentPolicyPropagationTarget(); target.failUpdate = true;
  await assert.rejects(processDocumentPolicyPropagation(payload, context(4), repository, target));
  assert.deepEqual(repository.failures, ["DOCUMENT_POLICY_PROPAGATION_RETRY_EXHAUSTED"]);
});
