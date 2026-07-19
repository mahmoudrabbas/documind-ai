import { z } from "zod";
import { ObjectId } from "mongodb";
import type { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError } from "../contracts/retryPolicy.js";
import { getMongoClient } from "../db/mongo.js";
import { logger } from "../logger.js";

const PayloadSchema = z.object({
  collections: z.array(z.string()).optional(),
});

type DataRetentionPayload = z.infer<typeof PayloadSchema>;

const CLEANUP_CANDIDATES = [
  "auditlogs",
  "emailmessages",
  "emailattempts",
  "paymentevents",
  "usagelogs",
];

export const dataRetentionJobHandler: JobHandlerDefinition<DataRetentionPayload> = {
  jobType: "system.data.retention",
  description:
    "Removes documents older than the platform dataRetentionDays setting from eligible collections.",
  payloadSchema: PayloadSchema,
  maxAttempts: 3,
  handle: async (payload, ctx): Promise<JobHandlerResult | void> => {
    const db = getMongoClient()?.db();
    if (!db) throw new RetryableJobError("Database not connected");

    const settingsDoc = await db
      .collection("platformsettings")
      .findOne({ key: "global_settings" });

    const retentionDays =
      typeof settingsDoc?.value?.dataRetentionDays === "number" &&
      settingsDoc.value.dataRetentionDays > 0
        ? settingsDoc.value.dataRetentionDays
        : 365;

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const targetCollections =
      payload.collections && payload.collections.length > 0
        ? payload.collections.filter((c) => CLEANUP_CANDIDATES.includes(c))
        : CLEANUP_CANDIDATES;

    let totalDeleted = 0;

    for (const collectionName of targetCollections) {
      try {
        const result = await db
          .collection(collectionName)
          .deleteMany({ createdAt: { $lt: cutoff } });

        const deleted = result.deletedCount ?? 0;
        totalDeleted += deleted;

        if (deleted > 0) {
          ctx.progress(`Cleaned ${deleted} documents from ${collectionName}`, {
            collection: collectionName,
            deleted,
            cutoff: cutoff.toISOString(),
          });
        }
      } catch (err: unknown) {
        logger.warn(
          { collection: collectionName, error: err },
          "Data retention cleanup failed for collection",
        );
      }
    }

    ctx.progress(`Data retention cleanup completed`, {
      retentionDays,
      cutoff: cutoff.toISOString(),
      totalDeleted,
      collections: targetCollections,
    });

    return {
      summary: {
        retentionDays,
        cutoff: cutoff.toISOString(),
        totalDeleted,
        collections: targetCollections,
      },
    };
  },
};
