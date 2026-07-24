import mongoose from "mongoose";
import { createHash } from "node:crypto";
import AuditLogModel from "../../db/models/auditLog.model.js";
import DocumentModel from "../../db/models/document.model.js";
import DocumentPolicyGenerationModel from "../../db/models/documentPolicyGeneration.model.js";
import DocumentPolicyPropagationOutboxModel from "../../db/models/documentPolicyPropagationOutbox.model.js";
import { schedulePolicyPropagationDispatch } from "./documentPolicyPropagation.dispatcher.js";
import type { DocumentPolicyPropagationJobV1 } from "./documentPolicyPropagation.contracts.js";

const PAGE_SIZE = 50;

export async function requestClassificationPropagation(input: { tenantId: string; classificationId: string; taxonomyVersion: number; actorId: string }) {
  let after: mongoose.Types.ObjectId | null = null;
  while (true) {
    const documents = await DocumentModel.find({ tenantId: input.tenantId, classificationId: input.classificationId, deletedAt: null,
      ...(after ? { _id: { $gt: after } } : {}) }).sort({ _id: 1 }).limit(PAGE_SIZE).select("_id").lean().exec();
    if (!documents.length) break;
    for (const item of documents) {
      const eventId = await createTaxonomyEvent(input, item._id.toString());
      if (eventId) schedulePolicyPropagationDispatch(input.tenantId, eventId);
    }
    after = documents.at(-1)!._id; if (documents.length < PAGE_SIZE) break;
  }
}

async function createTaxonomyEvent(input: { tenantId: string; classificationId: string; taxonomyVersion: number; actorId: string }, documentId: string) {
  const session = await mongoose.startSession(); let eventId: string | null = null;
  try {
    await session.withTransaction(async () => {
      const document = await DocumentModel.findOne({ _id: documentId, tenantId: input.tenantId, classificationId: input.classificationId,
        deletedAt: null, activePolicyId: { $ne: null }, activePolicyVersion: { $gte: 1 } }).session(session).lean().exec();
      if (!document?.activePolicyId || !document.activePolicyVersion) return;
      const generationId = hash(`${input.tenantId}:${documentId}:${document.version}`);
      eventId = hash(`taxonomy:${input.tenantId}:${input.classificationId}:${input.taxonomyVersion}:${documentId}:${document.version}:${document.activePolicyVersion}`);
      const requestedAt = new Date(); const correlationId = `taxonomy-${input.classificationId}-${input.taxonomyVersion}`;
      const payload: DocumentPolicyPropagationJobV1 = { schemaVersion: 1, eventId, tenantId: input.tenantId, documentId,
        documentVersion: document.version, policyId: document.activePolicyId.toString(), policyVersion: document.activePolicyVersion,
        previousPolicyVersion: document.activePolicyVersion, generationId, classificationId: document.classificationId?.toString() ?? null,
        categoryId: document.categoryId?.toString() ?? null, departmentId: document.departmentId?.toString() ?? null,
        changeDirection: "mixed", sensitiveBroadening: false, propagationReason: "taxonomy_change", requestedAt: requestedAt.toISOString(), correlationId };
      await DocumentPolicyGenerationModel.updateOne({ tenantId: input.tenantId, documentId, documentVersion: document.version }, {
        $set: { generationId, desiredPolicyId: document.activePolicyId, desiredPolicyVersion: document.activePolicyVersion,
          classificationId: document.classificationId, categoryId: document.categoryId, departmentId: document.departmentId,
          status: "stale", reindexRequired: false, metadataUpdateRequired: true, lastPropagationEventId: eventId,
          requestedAt, completedAt: null, failureCode: null },
        $setOnInsert: { appliedPolicyId: document.activePolicyId, appliedPolicyVersion: document.activePolicyVersion, attemptCount: 0 },
      }, { session, upsert: true, runValidators: true });
      await DocumentPolicyPropagationOutboxModel.updateOne({ eventId }, { $setOnInsert: { eventId, tenantId: input.tenantId,
        documentId, actorId: input.actorId, operationCorrelationId: correlationId, payload, state: "pending", attempts: 0,
        nextAttemptAt: requestedAt } }, { session, upsert: true, runValidators: true });
      await AuditLogModel.updateOne({ tenantId: input.tenantId, action: "DOCUMENT_POLICY_PROPAGATION_REQUESTED", resourceId: eventId },
        { $setOnInsert: { tenantId: input.tenantId, userId: null, resourceType: "DocumentPolicyPropagation", resourceId: eventId,
          action: "DOCUMENT_POLICY_PROPAGATION_REQUESTED", actorId: null, actorEmail: null, actorRole: null, actorKind: "SYSTEM",
          changes: {}, outcome: "SUCCESS", metadata: { actorId: input.actorId, documentId, policyId: payload.policyId,
            policyVersion: payload.policyVersion, propagationEventId: eventId, generationId, propagationReason: "taxonomy_change" }, createdAt: requestedAt } },
      { session, upsert: true, runValidators: true });
    });
    return eventId;
  } finally { await session.endSession(); }
}

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
