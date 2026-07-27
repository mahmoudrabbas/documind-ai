import { ObjectId } from "mongodb";
import { logger } from "../logger.js";
import { getMongoClient } from "../db/mongo.js";

/**
 * Reports progress from a worker job handler back to the processing progress
 * tracking system (ProcessingRun + ProcessingStage models).
 *
 * This function is designed to be called by worker job handlers. It derives
 * tenant identity from the job envelope (never from a client body field)
 * and validates that the referenced run/document belongs to the same tenant.
 *
 * Errors are caught and logged — a failure to report progress must never
 * interrupt the actual job processing.
 */
export async function reportProgressToProcessingRun(params: {
  tenantId: string;
  documentId: string;
  documentVersion: number;
  stageName: string;
  status?: string;
  progress?: number;
  jobId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getMongoClient()?.db();
    if (!db) {
      logger.warn("Cannot report processing progress: MongoDB not connected");
      return;
    }

    const tenantId = new ObjectId(params.tenantId);
    const documentId = new ObjectId(params.documentId);

    const run = await db.collection("processingruns").findOne({
      tenantId,
      documentId,
      documentVersion: params.documentVersion,
      status: { $in: ["queued", "running", "paused"] },
    });

    if (!run) {
      logger.debug(
        {
          documentId: params.documentId,
          documentVersion: params.documentVersion,
          stageName: params.stageName,
        },
        "No active processing run found; skipping progress report",
      );
      return;
    }

    const stage = await db.collection("processingstages").findOne({
      tenantId,
      runId: run._id,
      stageName: params.stageName,
    });

    if (!stage) {
      logger.debug(
        { runId: run._id.toString(), stageName: params.stageName },
        "Processing stage not found; skipping progress report",
      );
      return;
    }

    const now = new Date();
    const stageUpdate: Record<string, unknown> = {};

    if (params.status) {
      stageUpdate.status = params.status;
      if (params.status === "running" && !stage.startedAt) {
        stageUpdate.startedAt = now;
      }
      if (params.status === "completed") {
        stageUpdate.completedAt = now;
        stageUpdate.durationMs = stage.startedAt
          ? now.getTime() - new Date(stage.startedAt).getTime()
          : null;
      }
      if (params.status === "failed") {
        stageUpdate.failedAt = now;
      }
    }

    if (params.progress !== undefined) stageUpdate.progress = params.progress;
    if (params.jobId) stageUpdate.jobId = params.jobId;
    if (params.errorCode) stageUpdate.errorCode = params.errorCode;
    if (params.errorMessage) stageUpdate.errorMessage = params.errorMessage;
    if (params.retryable !== undefined) stageUpdate.retryable = params.retryable;
    if (params.metadata) stageUpdate.metadata = params.metadata;

    if (Object.keys(stageUpdate).length > 0) {
      await db.collection("processingstages").updateOne(
        { _id: stage._id },
        { $set: stageUpdate },
      );
    }

    if (params.status === "running" && run.status === "queued") {
      await db.collection("processingruns").updateOne(
        { _id: run._id },
        {
          $set: {
            status: "running",
            startedAt: now,
            currentStage: params.stageName,
          },
        },
      );
    } else if (params.status === "running" && run.status === "running") {
      await db.collection("processingruns").updateOne(
        { _id: run._id },
        {
          $set: {
            currentStage: params.stageName,
          },
        },
      );
    }

    if (params.status === "completed" || params.status === "failed") {
      if (params.status === "failed") {
        await db.collection("processingruns").updateOne(
          { _id: run._id },
          {
            $set: {
              status: "failed",
              failedAt: now,
              currentStage: params.stageName,
              errorCode: params.errorCode || null,
              errorMessage: params.errorMessage || null,
              progress: run.progress || 0,
            },
          },
        );
      } else {
        const allStages = await db.collection("processingstages")
          .find({ runId: run._id })
          .toArray();

        const allDone = allStages.every(
          (s: Record<string, unknown>) =>
            s.stageName === params.stageName ||
            s.status === "completed" ||
            s.status === "skipped",
        );

        if (allDone) {
          await db.collection("processingruns").updateOne(
            { _id: run._id },
            {
              $set: {
                status: "completed",
                completedAt: now,
                progress: 100,
                currentStage: null,
              },
            },
          );
        } else {
          const completedCount = allStages.filter(
            (s: Record<string, unknown>) => s.status === "completed" || s.status === "skipped",
          ).length;
          const progress = Math.min(99, Math.round((completedCount / allStages.length) * 100));
          await db.collection("processingruns").updateOne(
            { _id: run._id },
            {
              $set: {
                progress,
                currentStage: params.stageName,
              },
            },
          );
        }
      }
    }
  } catch (err) {
    logger.error(
      { err: (err as Error).message, params },
      "Failed to report processing progress (non-blocking)",
    );
  }
}

/**
 * Marks one or more processing stages as "skipped" for a given run.
 * Used for stages that don't apply to the current document type
 * (e.g., OCR is not needed for text-extracted documents).
 */
export async function skipProcessingStages(params: {
  tenantId: string;
  documentId: string;
  documentVersion: number;
  stageNames: string[];
}): Promise<void> {
  try {
    const db = getMongoClient()?.db();
    if (!db) return;

    const tenantId = new ObjectId(params.tenantId);
    const documentId = new ObjectId(params.documentId);

    const run = await db.collection("processingruns").findOne({
      tenantId,
      documentId,
      documentVersion: params.documentVersion,
      status: { $in: ["queued", "running", "paused"] },
    });

    if (!run) return;

    const now = new Date();
    for (const stageName of params.stageNames) {
      const stage = await db.collection("processingstages").findOne({
        tenantId,
        runId: run._id,
        stageName,
      });
      if (stage && stage.status === "pending") {
        await db.collection("processingstages").updateOne(
          { _id: stage._id },
          { $set: { status: "skipped", completedAt: now } },
        );
      }
    }
  } catch (err) {
    logger.error(
      { err: (err as Error).message, params },
      "Failed to skip processing stages (non-blocking)",
    );
  }
}
