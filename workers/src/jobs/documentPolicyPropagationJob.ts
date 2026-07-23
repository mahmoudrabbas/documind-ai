import { ObjectId, type Db } from "mongodb";
import type { JobHandlerContext, JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { documentPolicyPropagationPayloadSchema, type DerivedAccessMetadataV1, type DocumentPolicyPropagationPayload } from "../contracts/documentPolicyPropagation.js";
import { PermanentJobError, RetryableJobError } from "../contracts/retryPolicy.js";
import { getMongoClient } from "../db/mongo.js";
import { MongoDocumentPolicyPropagationTarget, type DocumentPolicyPropagationTargetPort } from "../providers/documentPolicyPropagationTarget.js";

type ClaimResult = "claimed" | "completed" | "superseded" | "busy" | "missing";
interface AuthorityState {
  documentVersion: number; policyId: string | null; policyVersion: number | null; classificationId: string | null;
  categoryId: string | null; departmentId: string | null; lifecycleCurrent: boolean; snapshotValid: boolean; reindexRequired: boolean;
}
export interface PolicyPropagationWorkerRepository {
  claim(payload: DocumentPolicyPropagationPayload): Promise<ClaimResult>;
  loadAuthority(payload: DocumentPolicyPropagationPayload): Promise<AuthorityState | null>;
  supersede(payload: DocumentPolicyPropagationPayload, code: string): Promise<void>;
  complete(payload: DocumentPolicyPropagationPayload, metadata: DerivedAccessMetadataV1, reindexing: boolean): Promise<void>;
  fail(payload: DocumentPolicyPropagationPayload, code: string, deadLetter: boolean): Promise<void>;
  audit(payload: DocumentPolicyPropagationPayload, action: string, outcome: "SUCCESS" | "FAILURE", code?: string): Promise<void>;
}

export function createDocumentPolicyPropagationJobHandler(dependencies?: {
  repository: PolicyPropagationWorkerRepository; target: DocumentPolicyPropagationTargetPort;
}): JobHandlerDefinition<DocumentPolicyPropagationPayload> {
  return { jobType: "document.policy.propagate", description: "Revalidates current document policy and propagates derived access metadata.",
    payloadSchema: documentPolicyPropagationPayloadSchema, maxAttempts: 5,
    handle: async (payload, ctx): Promise<JobHandlerResult> => {
      if (ctx.envelope.tenantId !== payload.tenantId) throw new PermanentJobError("DOCUMENT_POLICY_PROPAGATION_INVALID_PAYLOAD");
      const db = getMongoClient()?.db();
      if (!dependencies && !db) throw new RetryableJobError("DOCUMENT_POLICY_PROPAGATION_STATE_CONFLICT");
      const repository = dependencies?.repository ?? new MongoPolicyPropagationWorkerRepository(db!);
      const target = dependencies?.target ?? new MongoDocumentPolicyPropagationTarget(db!);
      return processDocumentPolicyPropagation(payload, ctx, repository, target);
    } };
}

export async function processDocumentPolicyPropagation(payload: DocumentPolicyPropagationPayload, ctx: JobHandlerContext,
  repository: PolicyPropagationWorkerRepository, target: DocumentPolicyPropagationTargetPort): Promise<JobHandlerResult> {
  const claim = await repository.claim(payload);
  if (claim === "completed" || claim === "superseded") return { summary: { status: claim, eventId: payload.eventId } };
  if (claim === "busy") return { summary: { status: "duplicate_in_progress", eventId: payload.eventId } };
  if (claim === "missing") throw new PermanentJobError("DOCUMENT_POLICY_PROPAGATION_STATE_CONFLICT");
  const authority = await repository.loadAuthority(payload);
  if (!authority) return terminal(repository, payload, "DOCUMENT_POLICY_GENERATION_MISMATCH");
  if (authority.documentVersion > payload.documentVersion || (authority.policyVersion !== null && authority.policyVersion > payload.policyVersion)) {
    await repository.supersede(payload, "DOCUMENT_POLICY_PROPAGATION_SUPERSEDED");
    await repository.audit(payload, "DOCUMENT_POLICY_PROPAGATION_SUPERSEDED", "SUCCESS", "DOCUMENT_POLICY_PROPAGATION_SUPERSEDED");
    await repository.audit(payload, "DOCUMENT_ACCESS_STALE_POLICY_REJECTED", "SUCCESS", "DOCUMENT_POLICY_PROPAGATION_SUPERSEDED");
    return { summary: { status: "superseded", eventId: payload.eventId } };
  }
  if (!authority.lifecycleCurrent || authority.documentVersion !== payload.documentVersion || authority.policyVersion !== payload.policyVersion ||
      authority.policyId !== payload.policyId || !authority.snapshotValid || authority.classificationId !== payload.classificationId ||
      authority.categoryId !== payload.categoryId || authority.departmentId !== payload.departmentId) {
    return terminal(repository, payload, "DOCUMENT_POLICY_GENERATION_MISMATCH");
  }
  const metadata: DerivedAccessMetadataV1 = { schemaVersion: 1, tenantId: payload.tenantId, documentId: payload.documentId,
    documentVersion: payload.documentVersion, policyId: payload.policyId, policyVersion: payload.policyVersion,
    classificationId: authority.classificationId, categoryId: authority.categoryId, departmentId: authority.departmentId,
    generationId: payload.generationId, updatedAt: new Date().toISOString(), requiresCurrentPolicyRevalidation: true };
  try {
    await target.updateAccessMetadata(metadata);
    if (authority.reindexRequired) {
      const request = await target.requestReindex(metadata, payload.eventId);
      if (!request.durable) throw new Error("reindex_request_not_durable");
      await repository.audit(payload, "DOCUMENT_POLICY_REINDEX_REQUESTED", "SUCCESS");
    }
    await repository.complete(payload, metadata, authority.reindexRequired);
    await repository.audit(payload, "DOCUMENT_POLICY_PROPAGATION_COMPLETED", "SUCCESS");
    return { summary: { status: authority.reindexRequired ? "reindexing" : "completed", eventId: payload.eventId } };
  } catch {
    const deadLetter = ctx.attemptsMade + 1 >= ctx.maxAttempts;
    await repository.fail(payload, deadLetter ? "DOCUMENT_POLICY_PROPAGATION_RETRY_EXHAUSTED" : "DOCUMENT_POLICY_PROPAGATION_DISPATCH_FAILED", deadLetter);
    await repository.audit(payload, "DOCUMENT_POLICY_PROPAGATION_FAILED", "FAILURE", deadLetter ? "DOCUMENT_POLICY_PROPAGATION_RETRY_EXHAUSTED" : "DOCUMENT_POLICY_PROPAGATION_DISPATCH_FAILED");
    throw new RetryableJobError("DOCUMENT_POLICY_PROPAGATION_DISPATCH_FAILED");
  }
}

async function terminal(repository: PolicyPropagationWorkerRepository, payload: DocumentPolicyPropagationPayload, code: string): Promise<never> {
  await repository.fail(payload, code, true); await repository.audit(payload, "DOCUMENT_POLICY_PROPAGATION_FAILED", "FAILURE", code);
  throw new PermanentJobError(code);
}

export class MongoPolicyPropagationWorkerRepository implements PolicyPropagationWorkerRepository {
  constructor(private readonly db: Db) {}
  async claim(payload: DocumentPolicyPropagationPayload): Promise<ClaimResult> {
    const identity = ids(payload); const claimed = await this.db.collection("documentpolicypropagationoutboxes").findOneAndUpdate(
      { ...identity, state: { $in: ["dispatched", "retry_pending"] } }, { $set: { state: "processing", processingStartedAt: new Date(), lastWorkerHeartbeatAt: new Date() }, $inc: { attempts: 1 } }, { returnDocument: "after" });
    if (claimed) return "claimed";
    const existing = await this.db.collection("documentpolicypropagationoutboxes").findOne(identity, { projection: { state: 1 } });
    if (!existing) return "missing"; if (existing.state === "completed") return "completed"; if (existing.state === "superseded") return "superseded"; return "busy";
  }
  async loadAuthority(payload: DocumentPolicyPropagationPayload): Promise<AuthorityState | null> {
    const tenantId = new ObjectId(payload.tenantId); const documentId = new ObjectId(payload.documentId);
    const document = await this.db.collection("documents").findOne({ _id: documentId, tenantId }); if (!document) return null;
    const policyId = idString(document.activePolicyId); const policyVersion = numberValue(document.activePolicyVersion);
    const policy = policyId && policyVersion ? await this.db.collection("documentaccesspolicies").findOne({ tenantId, documentId,
      policyId: new ObjectId(policyId), policyVersion }) : null;
    const generation = await this.db.collection("documentpolicygenerations").findOne({ tenantId, documentId, documentVersion: payload.documentVersion });
    return { documentVersion: numberValue(document.version) ?? 0, policyId, policyVersion,
      classificationId: idString(document.classificationId), categoryId: idString(document.categoryId), departmentId: idString(document.departmentId),
      lifecycleCurrent: !document.deletedAt && document.isArchived !== true && document.status !== "failed", snapshotValid: Boolean(policy &&
        idString(policy.indexMetadata?.policyId) === policyId && numberValue(policy.indexMetadata?.policyVersion) === policyVersion &&
        idString(policy.indexMetadata?.classificationId) === idString(document.classificationId) && idString(policy.indexMetadata?.categoryId) === idString(document.categoryId) &&
        idString(policy.indexMetadata?.departmentId) === idString(document.departmentId)), reindexRequired: generation?.reindexRequired === true };
  }
  async supersede(payload: DocumentPolicyPropagationPayload, code: string) {
    await this.db.collection("documentpolicypropagationoutboxes").updateOne({ ...ids(payload), state: "processing" }, { $set: { state: "superseded", completedAt: new Date(), failureCode: code } });
  }
  async complete(payload: DocumentPolicyPropagationPayload, metadata: DerivedAccessMetadataV1, reindexing: boolean) {
    const identity = ids(payload); const generation = await this.db.collection("documentpolicygenerations").updateOne({ tenantId: identity.tenantId,
      documentId: identity.documentId, documentVersion: payload.documentVersion, generationId: payload.generationId,
      desiredPolicyId: new ObjectId(payload.policyId), desiredPolicyVersion: payload.policyVersion }, { $set: reindexing ? {
        status: "reindexing", metadataUpdateRequired: false, failureCode: null,
      } : { status: "current", appliedPolicyId: new ObjectId(metadata.policyId), appliedPolicyVersion: metadata.policyVersion,
        metadataUpdateRequired: false, completedAt: new Date(), failureCode: null } });
    if (generation.matchedCount !== 1) throw new Error("generation_state_conflict");
    await this.db.collection("documentpolicypropagationoutboxes").updateOne({ ...identity, state: "processing" }, { $set: { state: "completed", completedAt: new Date(), failureCode: null } });
  }
  async fail(payload: DocumentPolicyPropagationPayload, code: string, deadLetter: boolean) {
    const identity = ids(payload); await this.db.collection("documentpolicypropagationoutboxes").updateOne({ ...identity, state: "processing" },
      { $set: { state: deadLetter ? "dead_letter" : "retry_pending", failureCode: code, failedAt: deadLetter ? new Date() : null,
        nextAttemptAt: new Date(Date.now() + 1000) } });
    await this.db.collection("documentpolicygenerations").updateOne({ tenantId: identity.tenantId, documentId: identity.documentId,
      documentVersion: payload.documentVersion, desiredPolicyVersion: payload.policyVersion }, { $set: { status: deadLetter ? "dead_letter" : "failed", failureCode: code }, $inc: { attemptCount: 1 } });
  }
  async audit(payload: DocumentPolicyPropagationPayload, action: string, outcome: "SUCCESS" | "FAILURE", code?: string) {
    try { await this.db.collection("audit_logs").insertOne({ tenantId: new ObjectId(payload.tenantId), userId: null,
      resourceType: "DocumentPolicyPropagation", resourceId: payload.eventId, action, actorId: null, actorEmail: null, actorRole: null,
      actorKind: "SYSTEM", changes: {}, traceId: payload.eventId, outcome, metadata: { documentId: payload.documentId, policyId: payload.policyId,
        policyVersion: payload.policyVersion, generationId: payload.generationId, eventId: payload.eventId, ...(code ? { reasonCode: code } : {}) }, createdAt: new Date() }); } catch { /* best effort */ }
  }
}

function ids(payload: DocumentPolicyPropagationPayload) { return { tenantId: new ObjectId(payload.tenantId), documentId: new ObjectId(payload.documentId), eventId: payload.eventId }; }
function idString(value: unknown): string | null { if (!value) return null; return value instanceof ObjectId ? value.toHexString() : typeof value === "string" ? value : null; }
function numberValue(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) ? value : null; }
