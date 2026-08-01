import { z } from "zod";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type {
  JobHandlerDefinition,
  JobHandlerContext,
  JobHandlerResult,
} from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import type { NotificationTransportPort } from "../contracts/notificationTransport.js";
import { getMongoClient } from "../db/mongo.js";
import { buildDedupKey } from "../contracts/idempotency.js";

/** Exact collection names — raw-driver mirror of the API mongoose models
 *  (plan line 47: `notifications`, `notificationdlqs`). */
const NOTIFICATIONS_COLLECTION = "notifications";
const NOTIFICATION_DLQ_COLLECTION = "notificationdlqs";
const JOB_TYPE = "notification.dispatch";

const NotificationDispatchPayloadSchema = z.object({
  /** Full ids array from the T10 dispatcher envelope payload (≤50 per job). */
  notificationIds: z.array(z.string().min(1)).min(1).max(50),
  tenantId: z.string().min(1),
  traceId: z.string().nullable().optional(),
  actorId: z.string().min(1).optional(),
  idempotencyKey: z.string().optional(),
});

type NotificationDispatchPayload = z.infer<typeof NotificationDispatchPayloadSchema>;

/**
 * T11 — 'notification.dispatch' worker.
 *
 * Consumes ONE BullMQ job per outbox event (review round 2 F5 fan-out): the
 * payload carries up to 50 notificationIds and the worker iterates the array.
 * Per doc, in order:
 *   1. idempotency — deliveryStatus 'delivered' → skip (no re-transport, QA#2)
 *   2. lifecycleState must be QUEUED | DISPATCHED → else skip with log
 *   3. PERSIST-FIRST (review round 2 H5): atomically transition to
 *      VISIBLE + delivered + deliveredAt BEFORE calling the transport. The
 *      conditional filter (deliveryStatus != 'delivered' AND lifecycleState in
 *      [QUEUED, DISPATCHED]) is the concurrency claim guard (QA#10): of two
 *      concurrent invocations for the same job payload exactly one matches, so
 *      each doc is delivered exactly once — a crash after persist loses only
 *      the best-effort push, never a double notification doc.
 *   4. transport {ok:false, temporary} → log + metric only; NO retry, NO
 *      rethrow — the doc is already delivered+VISIBLE and REST polling covers
 *      the user (rethrowing would double-emit).
 *   5. transport {ok:false, permanent} → mark doc failed + failureReason; for
 *      the WHOLE JOB write one DLQ entry (notificationDlq, jobId from the job
 *      envelope) and rethrow PermanentJobError (retained via removeOnFail:false).
 *
 * The transport is INJECTED via constructor (DIP round-11): this job depends
 * on the NotificationTransportPort interface only and never instantiates an
 * adapter. It also never branches on adapter identity (Liskov).
 */
export function createNotificationDispatchJobHandler(
  transport: NotificationTransportPort,
): JobHandlerDefinition<NotificationDispatchPayload> {
  return {
    jobType: JOB_TYPE,
    description:
      "Delivers a batch of created notifications (idempotent, persist-first) via the injected transport port.",
    payloadSchema: NotificationDispatchPayloadSchema,
    handle: async (
      payload: NotificationDispatchPayload,
      ctx: JobHandlerContext,
    ): Promise<JobHandlerResult | void> => {
      const db = getMongoClient()?.db();
      if (!db) throw new RetryableJobError("Database not connected");

      // Revalidate tenantId from the envelope context — never trust the
      // payload's authorization claims.
      const tenantId = ctx.envelope.tenantId;
      const tenantObjectId = toObjectId(tenantId);
      if (!tenantObjectId) {
        throw new PermanentJobError(`invalid tenantId in envelope: ${tenantId}`);
      }

      const notificationIds = payload.notificationIds;

      // Convert to ObjectIds; malformed ids are logged and skipped.
      const objectIds: ObjectId[] = [];
      const invalidIds: string[] = [];
      for (const id of notificationIds) {
        const oid = toObjectId(id);
        if (oid) objectIds.push(oid);
        else invalidIds.push(id);
      }
      if (invalidIds.length > 0) {
        ctx.progress("skipping invalid notificationIds", { invalidIds });
      }

      // Load all docs once, then iterate (fan-out).
      const docs = await db
        .collection(NOTIFICATIONS_COLLECTION)
        .find({ _id: { $in: objectIds }, tenantId: tenantObjectId })
        .toArray();
      const docsById = new Map(docs.map((doc) => [doc._id.toString(), doc]));

      let delivered = 0;
      let skipped = 0;
      const permanentFailures: string[] = [];
      const now = new Date();

      for (const id of notificationIds) {
        const doc = docsById.get(id);
        if (!doc) {
          ctx.progress("notification not found, skipping", { notificationId: id });
          skipped += 1;
          continue;
        }

        // (a) idempotency — already delivered → no re-transport (QA#2)
        if (doc.deliveryStatus === "delivered") {
          ctx.progress("notification already delivered, skipping", { notificationId: id });
          skipped += 1;
          continue;
        }

        // (b) lifecycle validation
        if (doc.lifecycleState !== "QUEUED" && doc.lifecycleState !== "DISPATCHED") {
          ctx.progress("notification in unexpected lifecycle state, skipping", {
            notificationId: id,
            lifecycleState: doc.lifecycleState,
          });
          skipped += 1;
          continue;
        }

        // (c)+(d) PERSIST-FIRST: transition QUEUED→VISIBLE + mark delivered
        // BEFORE the transport call. The filter doubles as the concurrency
        // claim guard (QA#10): a concurrent invocation that already delivered
        // the doc matches nothing here and falls through to skip.
        const claim = await db.collection(NOTIFICATIONS_COLLECTION).updateOne(
          {
            _id: doc._id,
            deliveryStatus: { $ne: "delivered" },
            lifecycleState: { $in: ["QUEUED", "DISPATCHED"] },
          },
          {
            $set: {
              lifecycleState: "VISIBLE",
              deliveryStatus: "delivered",
              deliveredAt: now,
            },
          },
        );
        if (claim.matchedCount === 0) {
          ctx.progress(
            "delivery claim lost to concurrent invocation (doc already delivered), skipping",
            { notificationId: id },
          );
          skipped += 1;
          continue;
        }
        delivered += 1;

        // (e) best-effort push via the injected transport port
        const result = await transport.deliver({
          notificationId: id,
          tenantId,
          userId: doc.userId.toString(),
          type: doc.type,
          priority: doc.priority,
          title: doc.title?.en ?? "",
          body: doc.body?.en ?? "",
          actions: (doc.actions ?? []).map(
            (action: { label?: { en?: string; ar?: string } | null; url: string }) => ({
              label: action.label?.en ?? "",
              url: action.url,
            }),
          ),
          createdAt: doc.createdAt,
        });

        if (!result.ok) {
          if (result.errorCategory === "permanent") {
            // (g) permanent → failed + reason; whole-job DLQ + rethrow
            await db.collection(NOTIFICATIONS_COLLECTION).updateOne(
              { _id: doc._id, deliveryStatus: "delivered" },
              {
                $set: {
                  deliveryStatus: "failed",
                  failureReason:
                    result.errorMessage ??
                    result.errorCategory ??
                    "permanent_delivery_failure",
                },
              },
            );
            permanentFailures.push(id);
          } else {
            // (f) temporary/unknown → log + metric only. NO retry, NO rethrow:
            // the doc is already delivered+VISIBLE; REST polling covers the user.
            ctx.progress("transport temporary failure — doc already delivered, no retry", {
              notificationId: id,
              errorCategory: result.errorCategory ?? "unknown",
              errorMessage: result.errorMessage ?? null,
            });
          }
        }
      }

      if (permanentFailures.length > 0) {
        const reason =
          permanentFailures.length === 1
            ? `permanent transport failure for notification ${permanentFailures[0]}`
            : `permanent transport failure for ${permanentFailures.length} of ${notificationIds.length} notifications`;
        // jobId = buildDedupKey(jobType, idempotencyKey) — the identical id the
        // API producer's ApiJobDispatcher used when enqueuing, so T24 can
        // replay via ApiJobDispatcher.replayJob(jobId).
        const jobId = buildDedupKey(JOB_TYPE, ctx.envelope.idempotencyKey);
        try {
          await db.collection(NOTIFICATION_DLQ_COLLECTION).insertOne({
            tenantId: tenantObjectId,
            jobId,
            notificationIds,
            notificationCount: notificationIds.length,
            reason,
            payloadHash: hashPayload(ctx.envelope.payload),
            failedAt: now,
            replayedAt: null,
          });
        } catch (error) {
          // Best-effort DLQ write — if it fails the job is still dead-lettered
          // below and retained (removeOnFail:false), so the T20 daily sweep can
          // copy it into the DLQ from the queue's failed set.
          ctx.progress("failed to write notificationDlq entry", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw new PermanentJobError(reason);
      }

      return { summary: { notificationIds, delivered, skipped } };
    },
  };
}

function toObjectId(value: string): ObjectId | null {
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

/** Deterministic sha256 fingerprint of the job envelope payload (T20's sweep
 *  computes the same shape from the failed job). */
function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}
