import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import DocumentPolicyPropagationOutboxModel from "../../db/models/documentPolicyPropagationOutbox.model.js";
import { DocumentPolicyPropagationDispatcher, type PolicyPropagationQueuePort } from "./documentPolicyPropagation.dispatcher.js";
import { setAuditWriter } from "../../common/observability/index.js";
import { InMemoryAuditWriter } from "../../common/observability/auditWriter.js";

setAuditWriter(new InMemoryAuditWriter());

const tenantId = new mongoose.Types.ObjectId(); const documentId = new mongoose.Types.ObjectId(); const actorId = new mongoose.Types.ObjectId();
const payload = { schemaVersion: 1 as const, eventId: "a".repeat(64), tenantId: tenantId.toString(), documentId: documentId.toString(),
  documentVersion: 1, policyId: new mongoose.Types.ObjectId().toString(), policyVersion: 2, previousPolicyVersion: 1,
  generationId: "b".repeat(64), classificationId: null, categoryId: null, departmentId: null, changeDirection: "tightening" as const, sensitiveBroadening: false,
  propagationReason: "policy_change" as const, requestedAt: "2026-07-23T00:00:00.000Z", correlationId: "operation-1" };
const event = { tenantId, documentId, actorId, eventId: payload.eventId, payload, attempts: 0 };

function query<T>(value: T) { return { lean: () => ({ exec: async () => value }) }; }
function writeQuery() { return { exec: async () => ({ modifiedCount: 1 }) }; }

test("dispatcher conditionally claims and publishes with deterministic event identity", async (context) => {
  context.mock.method(DocumentPolicyPropagationOutboxModel, "findOneAndUpdate", () => query(event) as never);
  context.mock.method(DocumentPolicyPropagationOutboxModel, "updateOne", () => writeQuery() as never);
  const calls: unknown[] = []; const queue: PolicyPropagationQueuePort = { async enqueue(input) { calls.push(input); return { ok: true, jobId: payload.eventId }; } };
  const result = await new DocumentPolicyPropagationDispatcher(queue).dispatchEvent(tenantId.toString(), payload.eventId);
  assert.equal(result, "dispatched"); assert.equal(calls.length, 1);
  assert.equal((calls[0] as { idempotencyKey: string }).idempotencyKey, payload.eventId);
});

test("duplicate claim is skipped and queue failure schedules a safe retry", async (context) => {
  context.mock.method(DocumentPolicyPropagationOutboxModel, "findOneAndUpdate", () => query(null) as never);
  const queue: PolicyPropagationQueuePort = { async enqueue() { throw new Error("raw provider details"); } };
  assert.equal(await new DocumentPolicyPropagationDispatcher(queue).dispatchEvent(tenantId.toString(), payload.eventId), "skipped");
});

test("dispatcher maps publication failure to retry_pending without storing raw errors", async (context) => {
  context.mock.method(DocumentPolicyPropagationOutboxModel, "findOneAndUpdate", () => query(event) as never);
  let update: unknown;
  context.mock.method(DocumentPolicyPropagationOutboxModel, "updateOne", (_filter: unknown, value: unknown) => { update = value; return writeQuery() as never; });
  const queue: PolicyPropagationQueuePort = { async enqueue() { return { ok: false, error: "raw provider details" }; } };
  assert.equal(await new DocumentPolicyPropagationDispatcher(queue).dispatchEvent(tenantId.toString(), payload.eventId), "retry_pending");
  const serialized = JSON.stringify(update); assert.equal(serialized.includes("raw provider details"), false);
  assert.equal(serialized.includes("DOCUMENT_POLICY_PROPAGATION_DISPATCH_FAILED"), true);
});
