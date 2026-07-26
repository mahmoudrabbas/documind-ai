import mongoose from "mongoose";
import { createHash } from "node:crypto";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import DocumentPolicyIdempotencyModel from "../../db/models/documentPolicyIdempotency.model.js";
import DocumentPolicyGenerationModel from "../../db/models/documentPolicyGeneration.model.js";
import DocumentPolicyPropagationOutboxModel from "../../db/models/documentPolicyPropagationOutbox.model.js";
import DocumentModel from "../../db/models/document.model.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";
import { DOCUMENT_POLICY_PROPAGATION_SCHEMA_VERSION, type DocumentPolicyPropagationJobV1 } from "./documentPolicyPropagation.contracts.js";
import type { PolicyImpactDirection } from "./documentPolicyManagement.types.js";
import type { ClassificationLevel } from "../document-taxonomy/documentTaxonomy.types.js";

export type ManagementApplyResult =
  | { outcome: "applied"; policyId: string; policyVersion: number; propagationEventId: string }
  | { outcome: "replay"; policyId: string; policyVersion: number; propagationEventId: string | null }
  | { outcome: "idempotency_conflict" }
  | { outcome: "version_conflict" };

class VersionConflict extends Error {}
class IdempotencyConflict extends Error {}

export async function applyManagedPolicy(input: {
  tenantId: string; documentId: string; actorId: string; idempotencyKey: string; requestFingerprint: string;
  expectedPolicyId: string; expectedPolicyVersion: number; documentVersion: number; changeDirection: Exclude<PolicyImpactDirection, "no_change">;
  sensitiveBroadening: boolean; propagationReason: "policy_change" | "taxonomy_change"; policy: DocumentAccessPolicy;
  taxonomy: {
    classificationId: string; classificationName: string; classificationLevel: ClassificationLevel;
    categoryId: string | null; categoryName: string | null; departmentId: string | null; departmentName: string | null;
  };
}): Promise<ManagementApplyResult> {
  const identity = { tenantId: input.tenantId, documentId: input.documentId, actorId: input.actorId, operation: "policy_apply" as const, key: input.idempotencyKey };
  const existing = await DocumentPolicyIdempotencyModel.findOne(identity).lean().exec();
  if (existing) return existing.requestFingerprint === input.requestFingerprint
    ? { outcome: "replay", policyId: existing.policyId.toString(), policyVersion: existing.policyVersion, propagationEventId: await existingEventId(input.tenantId, input.documentId, existing.policyVersion) }
    : { outcome: "idempotency_conflict" };
  const session = await mongoose.startSession();
  let replayed = false;
  const eventId = hash(`${input.tenantId}:${input.documentId}:${input.policy.policyId}:${input.policy.policyVersion}`);
  const generationId = hash(`${input.tenantId}:${input.documentId}:${input.documentVersion}`);
  try {
    await session.withTransaction(async () => {
      const raced = await DocumentPolicyIdempotencyModel.findOne(identity).session(session).lean().exec();
      if (raced) {
        if (raced.requestFingerprint !== input.requestFingerprint) throw new IdempotencyConflict();
        replayed = true;
        return;
      }
      const changed = await DocumentModel.updateOne({ _id: input.documentId, tenantId: input.tenantId,
        activePolicyId: input.expectedPolicyId, activePolicyVersion: input.expectedPolicyVersion },
      { $set: { activePolicyId: input.policy.policyId, activePolicyVersion: input.policy.policyVersion, policyChangedAt: new Date(input.policy.provenance.createdAt),
        classificationId: input.taxonomy.classificationId, classification: input.taxonomy.classificationLevel,
        categoryId: input.taxonomy.categoryId, category: input.taxonomy.categoryName,
        departmentId: input.taxonomy.departmentId, department: input.taxonomy.departmentName } },
      { session, runValidators: true });
      if (changed.modifiedCount !== 1) throw new VersionConflict();
      const snapshot = new DocumentAccessPolicyModel({ ...input.policy,
        rules: input.policy.rules.map((rule) => ({ ...rule, subject: { ...rule.subject }, actions: [...rule.actions] })),
        effectiveFrom: new Date(input.policy.effectiveFrom), effectiveUntil: input.policy.effectiveUntil ? new Date(input.policy.effectiveUntil) : null,
        provenance: { ...input.policy.provenance, createdAt: new Date(input.policy.provenance.createdAt) }, createdAt: new Date(input.policy.provenance.createdAt) });
      await snapshot.save({ session });
      await DocumentPolicyIdempotencyModel.create([{ ...identity, requestFingerprint: input.requestFingerprint,
        policyId: input.policy.policyId, policyVersion: input.policy.policyVersion, createdAt: new Date(), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }], { session });
      const requestedAt = new Date(input.policy.provenance.createdAt);
      await DocumentPolicyGenerationModel.updateOne({ tenantId: input.tenantId, documentId: input.documentId, documentVersion: input.documentVersion }, {
        $set: { generationId, desiredPolicyId: input.policy.policyId, desiredPolicyVersion: input.policy.policyVersion,
          classificationId: input.policy.indexMetadata.classificationId, categoryId: input.policy.indexMetadata.categoryId,
          departmentId: input.policy.indexMetadata.departmentId, status: input.changeDirection === "broadening" ? "pending" : "stale",
          reindexRequired: false, metadataUpdateRequired: true, lastPropagationEventId: eventId, requestedAt,
          completedAt: null, failureCode: null },
        $setOnInsert: { appliedPolicyId: input.expectedPolicyId, appliedPolicyVersion: input.expectedPolicyVersion, attemptCount: 0 },
      }, { session, upsert: true, runValidators: true });
      const payload: DocumentPolicyPropagationJobV1 = { schemaVersion: DOCUMENT_POLICY_PROPAGATION_SCHEMA_VERSION, eventId,
        tenantId: input.tenantId, documentId: input.documentId, documentVersion: input.documentVersion, policyId: input.policy.policyId,
        policyVersion: input.policy.policyVersion, previousPolicyVersion: input.expectedPolicyVersion, generationId,
        classificationId: input.policy.indexMetadata.classificationId ?? null, categoryId: input.policy.indexMetadata.categoryId ?? null,
        departmentId: input.policy.indexMetadata.departmentId ?? null, changeDirection: input.changeDirection,
        sensitiveBroadening: input.sensitiveBroadening, propagationReason: input.propagationReason,
        requestedAt: requestedAt.toISOString(), correlationId: input.idempotencyKey };
      await DocumentPolicyPropagationOutboxModel.create([{ eventId, tenantId: input.tenantId, documentId: input.documentId,
        actorId: input.actorId, operationCorrelationId: input.idempotencyKey, payload, state: "pending", attempts: 0,
        nextAttemptAt: requestedAt }], { session });
      const requestedAudit = new AuditLogModel({ tenantId: new mongoose.Types.ObjectId(input.tenantId), userId: null, resourceType: "DocumentPolicyPropagation",
        resourceId: eventId, action: "DOCUMENT_POLICY_PROPAGATION_REQUESTED", actorId: null, actorEmail: null,
        actorRole: null, actorKind: "SYSTEM", changes: {}, outcome: "SUCCESS", metadata: { actorId: input.actorId,
          documentId: input.documentId, policyId: input.policy.policyId, policyVersion: input.policy.policyVersion,
          previousPolicyVersion: input.expectedPolicyVersion, changeDirection: input.changeDirection,
          sensitiveBroadening: input.sensitiveBroadening, propagationEventId: eventId, generationId }, createdAt: requestedAt });
      await requestedAudit.save({ session });
    });
    const replay = await DocumentPolicyIdempotencyModel.findOne(identity).lean().exec();
    const policyId = replay?.policyId.toString() ?? input.policy.policyId; const policyVersion = replay?.policyVersion ?? input.policy.policyVersion;
    if (replayed) return { outcome: "replay", policyId, policyVersion,
      propagationEventId: await existingEventId(input.tenantId, input.documentId, input.policy.policyVersion) };
    return { outcome: "applied", policyId, policyVersion, propagationEventId: eventId };
  } catch (error) {
    if (error instanceof VersionConflict) return { outcome: "version_conflict" };
    if (error instanceof IdempotencyConflict) return { outcome: "idempotency_conflict" };
    if (isDuplicate(error)) {
      const raced = await DocumentPolicyIdempotencyModel.findOne(identity).lean().exec();
      if (raced?.requestFingerprint === input.requestFingerprint) return { outcome: "replay", policyId: raced.policyId.toString(), policyVersion: raced.policyVersion, propagationEventId: await existingEventId(input.tenantId, input.documentId, raced.policyVersion) };
      return { outcome: "idempotency_conflict" };
    }
    throw error;
  } finally { await session.endSession(); }
}
function isDuplicate(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
async function existingEventId(tenantId: string, documentId: string, policyVersion: number) {
  const event = await DocumentPolicyPropagationOutboxModel.findOne({ tenantId, documentId, "payload.policyVersion": policyVersion,
    "payload.propagationReason": "policy_change" }).select("eventId").lean().exec();
  return event?.eventId ?? null;
}
