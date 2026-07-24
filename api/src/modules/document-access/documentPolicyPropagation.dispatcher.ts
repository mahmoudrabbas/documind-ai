import DocumentPolicyPropagationOutboxModel, { type DocumentPolicyPropagationOutboxDocument } from "../../db/models/documentPolicyPropagationOutbox.model.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { getApiJobDispatcher } from "../jobs/jobDispatcher.js";
import { DOCUMENT_POLICY_PROPAGATION_JOB, validateDocumentPolicyPropagationJobV1 } from "./documentPolicyPropagation.contracts.js";

const MAX_ATTEMPTS = 5;
const MAX_BATCH = 50;
const CLAIM_MS = 60_000;

export interface PolicyPropagationQueuePort {
  enqueue(input: unknown): Promise<{ ok: boolean; jobId?: string; deduplicated?: boolean; error?: string }>;
}

export class DocumentPolicyPropagationDispatcher {
  constructor(private readonly queue: PolicyPropagationQueuePort) {}

  async dispatchEvent(tenantId: string, eventId: string): Promise<"dispatched" | "skipped" | "retry_pending" | "dead_letter"> {
    const now = new Date();
    const event = await DocumentPolicyPropagationOutboxModel.findOneAndUpdate({ tenantId, eventId,
      $or: [{ state: { $in: ["pending", "retry_pending"] }, nextAttemptAt: { $lte: now } }, { state: "dispatching", claimExpiresAt: { $lte: now } }] },
    { $set: { state: "dispatching", claimExpiresAt: new Date(now.getTime() + CLAIM_MS), failureCode: null } }, { new: true }).lean().exec();
    if (!event) return "skipped";
    return this.publish(event);
  }

  async dispatchPending(tenantId: string, limit = 20): Promise<{ claimed: number; dispatched: number; retryPending: number; deadLetter: number }> {
    const bounded = Math.max(1, Math.min(MAX_BATCH, Math.trunc(limit)));
    const now = new Date();
    const candidates = await DocumentPolicyPropagationOutboxModel.find({ tenantId,
      $or: [{ state: { $in: ["pending", "retry_pending"] }, nextAttemptAt: { $lte: now } }, { state: "dispatching", claimExpiresAt: { $lte: now } }],
    }).sort({ nextAttemptAt: 1, _id: 1 }).limit(bounded).select("tenantId eventId").lean().exec();
    const totals = { claimed: 0, dispatched: 0, retryPending: 0, deadLetter: 0 };
    for (const candidate of candidates) {
      const result = await this.dispatchEvent(candidate.tenantId.toString(), candidate.eventId);
      if (result === "skipped") continue;
      totals.claimed += 1;
      if (result === "dispatched") totals.dispatched += 1;
      if (result === "retry_pending") totals.retryPending += 1;
      if (result === "dead_letter") totals.deadLetter += 1;
    }
    return totals;
  }

  private async publish(event: Pick<DocumentPolicyPropagationOutboxDocument, "tenantId" | "documentId" | "actorId" | "eventId" | "payload" | "attempts">) {
    try {
      const payload = validateDocumentPolicyPropagationJobV1(event.payload);
      const result = await this.queue.enqueue({ jobType: DOCUMENT_POLICY_PROPAGATION_JOB, tenantId: event.tenantId.toString(),
        actorId: event.actorId.toString(), traceId: event.eventId, idempotencyKey: event.eventId, payload });
      if (!result.ok) throw new Error("queue_rejected");
      await DocumentPolicyPropagationOutboxModel.updateOne({ tenantId: event.tenantId, eventId: event.eventId, state: "dispatching" },
        { $set: { state: "dispatched", dispatchedAt: new Date(), claimExpiresAt: null, failureCode: null } }).exec();
      await getAuditWriter().write({ action: "DOCUMENT_POLICY_PROPAGATION_DISPATCHED", resourceType: "DocumentPolicyPropagation",
        resourceId: event.eventId, tenantId: event.tenantId.toString(), actorKind: "SYSTEM",
        metadata: { documentId: event.documentId.toString(), eventId: event.eventId, policyId: payload.policyId, policyVersion: payload.policyVersion, generationId: payload.generationId } });
      return "dispatched" as const;
    } catch {
      const attempts = event.attempts + 1; const terminal = attempts >= MAX_ATTEMPTS;
      await DocumentPolicyPropagationOutboxModel.updateOne({ tenantId: event.tenantId, eventId: event.eventId, state: "dispatching" },
        { $set: { state: terminal ? "dead_letter" : "retry_pending", failureCode: terminal ? "DOCUMENT_POLICY_PROPAGATION_RETRY_EXHAUSTED" : "DOCUMENT_POLICY_PROPAGATION_DISPATCH_FAILED",
          failedAt: terminal ? new Date() : null, claimExpiresAt: null, nextAttemptAt: new Date(Date.now() + backoff(attempts)) }, $inc: { attempts: 1 } }).exec();
      return terminal ? "dead_letter" as const : "retry_pending" as const;
    }
  }
}

function backoff(attempt: number) { return Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1)); }
let singleton: DocumentPolicyPropagationDispatcher | null = null;
export function getDocumentPolicyPropagationDispatcher() { singleton ??= new DocumentPolicyPropagationDispatcher(getApiJobDispatcher()); return singleton; }
export function schedulePolicyPropagationDispatch(tenantId: string, eventId: string) {
  setImmediate(() => { void getDocumentPolicyPropagationDispatcher().dispatchEvent(tenantId, eventId).catch(() => undefined); });
}
