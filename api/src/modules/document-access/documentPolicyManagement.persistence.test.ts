import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import DocumentModel from "../../db/models/document.model.js";
import UserModel from "../../db/models/user.model.js";
import { normalizeDocumentAccessPolicy } from "./documentAccess.policy.validator.js";
import { applyManagedPolicy } from "./documentPolicyManagement.persistence.js";
import DocumentPolicyGenerationModel from "../../db/models/documentPolicyGeneration.model.js";
import DocumentPolicyPropagationOutboxModel from "../../db/models/documentPolicyPropagationOutbox.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";

let mongo: MongoMemoryReplSet | null = null; let blocked: string | null = null;
before(async () => { try { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } }); await mongoose.connect(mongo.getUri()); } catch { blocked = "replica-set listener unavailable"; } });
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });

test("CAS apply commits snapshot, pointer, and idempotency together", async (context) => {
  if (blocked) { context.skip(blocked); return; }
  const tenantId = new mongoose.Types.ObjectId(); const actorId = new mongoose.Types.ObjectId(); const documentId = new mongoose.Types.ObjectId(); const policyId = new mongoose.Types.ObjectId();
  await UserModel.create({ _id: actorId, tenantId, name: "Policy Manager", email: "manager@example.test", passwordHash: "hash", role: "COMPANY_ADMIN", status: "active", emailVerified: true });
  await DocumentModel.create({ _id: documentId, tenantId, fileName: "hidden", originalFileName: "hidden", fileSize: 1, mimeType: "text/plain", storageKey: "hidden", checksum: "sum", status: "uploaded", metadata: { title: null, description: null, tags: [] }, classification: "restricted", owner: actorId, uploadedBy: actorId, activePolicyId: policyId, activePolicyVersion: 1 });
  const make = (version: number) => normalizeDocumentAccessPolicy({ contractVersion: 1, tenantId: tenantId.toString(), documentId: documentId.toString(), policyId: policyId.toString(), policyVersion: version, status: "active", effectiveFrom: "2026-07-23T00:00:00.000Z", effectiveUntil: null, inherits: null,
    rules: [{ ruleId: "owner", effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] }], provenance: { createdBy: actorId.toString(), createdAt: "2026-07-23T00:00:00.000Z" }, indexMetadata: { policyId: policyId.toString(), policyVersion: version, classificationId: null, categoryId: null, departmentId: null } });
  const first = make(1); const snapshot = new DocumentAccessPolicyModel({ ...first,
    rules: first.rules.map((rule) => ({ ...rule, subject: { ...rule.subject }, actions: [...rule.actions] })),
    effectiveFrom: new Date(first.effectiveFrom), provenance: { ...first.provenance, createdAt: new Date(first.provenance.createdAt) }, createdAt: new Date(first.provenance.createdAt) });
  await snapshot.save();
  const input = { tenantId: tenantId.toString(), documentId: documentId.toString(), actorId: actorId.toString(), idempotencyKey: "apply-1", requestFingerprint: "a".repeat(64), expectedPolicyId: policyId.toString(), expectedPolicyVersion: 1,
    documentVersion: 1, changeDirection: "tightening" as const, sensitiveBroadening: false, policy: make(2) };
  const applied = await applyManagedPolicy(input);
  assert.equal(applied.outcome, "applied");
  assert.equal((await applyManagedPolicy(input)).outcome, "replay");
  assert.equal((await applyManagedPolicy({ ...input, requestFingerprint: "b".repeat(64) })).outcome, "idempotency_conflict");
  assert.equal((await DocumentModel.findById(documentId).lean())?.activePolicyVersion, 2);
  assert.equal(await DocumentAccessPolicyModel.countDocuments({ tenantId, documentId, policyId }), 2);
  assert.equal(await DocumentPolicyPropagationOutboxModel.countDocuments({ tenantId, documentId }), 1);
  const generation = await DocumentPolicyGenerationModel.findOne({ tenantId, documentId, documentVersion: 1 }).lean();
  assert.equal(generation?.desiredPolicyVersion, 2); assert.equal(generation?.appliedPolicyVersion, 1); assert.equal(generation?.status, "stale");
  const requestedAudits = await AuditLogModel.find({ tenantId, resourceType: "DocumentPolicyPropagation",
    action: "DOCUMENT_POLICY_PROPAGATION_REQUESTED" }).lean();
  assert.equal(requestedAudits.length, 1);
  const requestedAudit = requestedAudits[0];
  assert.ok(requestedAudit?.tenantId instanceof mongoose.Types.ObjectId);
  assert.equal(requestedAudit.tenantId.toString(), tenantId.toString());
  assert.equal(requestedAudit.metadata?.propagationEventId, applied.outcome === "applied" ? applied.propagationEventId : null);
  assert.equal(requestedAudit.metadata?.generationId, generation?.generationId);
});
