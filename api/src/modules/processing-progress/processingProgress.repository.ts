import { Types } from "mongoose";
import ProcessingRunModel, {
  type ProcessingRunDocument,
  type ProcessingRunStatus,
} from "../../db/models/processingRun.model.js";
import ProcessingStageModel, {
  type ProcessingStageDocument,
  type ProcessingStageStatus,
} from "../../db/models/processingStage.model.js";

export async function createProcessingRun(data: {
  tenantId: string;
  documentId: string;
  documentVersion: number;
  traceId: string;
  maxRetries?: number;
}): Promise<ProcessingRunDocument> {
  return ProcessingRunModel.create({
    tenantId: new Types.ObjectId(data.tenantId),
    documentId: new Types.ObjectId(data.documentId),
    documentVersion: data.documentVersion,
    status: "queued",
    traceId: data.traceId,
    maxRetries: data.maxRetries ?? 3,
    progress: 0,
  });
}

export async function findProcessingRun(
  tenantId: string,
  runId: string,
): Promise<ProcessingRunDocument | null> {
  return ProcessingRunModel.findOne({
    _id: new Types.ObjectId(runId),
    tenantId: new Types.ObjectId(tenantId),
  });
}

export async function findActiveRunForDocument(
  tenantId: string,
  documentId: string,
  documentVersion: number,
): Promise<ProcessingRunDocument | null> {
  return ProcessingRunModel.findOne({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
    documentVersion,
    status: { $in: ["queued", "running", "paused"] },
  }).sort({ createdAt: -1 });
}

export async function findLatestRunForDocument(
  tenantId: string,
  documentId: string,
  documentVersion: number,
): Promise<ProcessingRunDocument | null> {
  return ProcessingRunModel.findOne({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
    documentVersion,
  }).sort({ createdAt: -1 });
}

export async function updateProcessingRun(
  tenantId: string,
  runId: string,
  update: Partial<{
    status: ProcessingRunStatus;
    currentStage: ProcessingRunDocument["currentStage"] | null;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    canceledAt: Date | null;
    canceledBy: Types.ObjectId | null;
    progress: number;
    retryCount: number;
    traceId: string;
    errorCode: string | null;
    errorMessage: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<ProcessingRunDocument | null> {
  return ProcessingRunModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(runId),
      tenantId: new Types.ObjectId(tenantId),
    },
    { $set: update },
    { new: true },
  );
}

export async function findProcessingStages(
  tenantId: string,
  runId: string,
): Promise<ProcessingStageDocument[]> {
  return ProcessingStageModel.find({
    tenantId: new Types.ObjectId(tenantId),
    runId: new Types.ObjectId(runId),
  }).sort({ createdAt: 1 });
}

export async function findProcessingStageByJobId(
  tenantId: string,
  jobId: string,
): Promise<ProcessingStageDocument | null> {
  return ProcessingStageModel.findOne({
    tenantId: new Types.ObjectId(tenantId),
    jobId,
  });
}

export async function upsertProcessingStage(data: {
  tenantId: string;
  runId: string;
  documentId: string;
  documentVersion: number;
  stageName: ProcessingStageDocument["stageName"];
  jobId?: string;
  traceId: string;
}): Promise<ProcessingStageDocument> {
  return ProcessingStageModel.findOneAndUpdate(
    {
      tenantId: new Types.ObjectId(data.tenantId),
      runId: new Types.ObjectId(data.runId),
      stageName: data.stageName,
    },
    {
      $setOnInsert: {
        tenantId: new Types.ObjectId(data.tenantId),
        runId: new Types.ObjectId(data.runId),
        documentId: new Types.ObjectId(data.documentId),
        documentVersion: data.documentVersion,
        stageName: data.stageName,
        traceId: data.traceId,
        status: "pending" as ProcessingStageStatus,
        attemptNumber: 1,
        maxAttempts: 3,
        progress: 0,
        retryable: true,
        artifactVersion: 1,
      },
    },
    { upsert: true, new: true },
  );
}

export async function updateProcessingStage(
  tenantId: string,
  stageId: string,
  update: Partial<{
    status: ProcessingStageStatus;
    attemptNumber: number;
    jobId: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    progress: number;
    errorCode: string | null;
    errorMessage: string | null;
    retryable: boolean;
    durationMs: number | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<ProcessingStageDocument | null> {
  return ProcessingStageModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(stageId),
      tenantId: new Types.ObjectId(tenantId),
    },
    { $set: update },
    { new: true },
  );
}

export async function findProcessingRunsForDocument(
  tenantId: string,
  documentId: string,
  page: number,
  pageSize: number,
): Promise<{ runs: ProcessingRunDocument[]; totalRecords: number }> {
  const filter = {
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
  };

  const [runs, totalRecords] = await Promise.all([
    ProcessingRunModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    ProcessingRunModel.countDocuments(filter),
  ]);

  return { runs, totalRecords };
}

export async function findFailedRunsForTenant(
  tenantId: string,
  page: number,
  pageSize: number,
): Promise<{ runs: ProcessingRunDocument[]; totalRecords: number }> {
  const filter = {
    tenantId: new Types.ObjectId(tenantId),
    status: "failed" as const,
  };

  const [runs, totalRecords] = await Promise.all([
    ProcessingRunModel.find(filter)
      .sort({ failedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    ProcessingRunModel.countDocuments(filter),
  ]);

  return { runs, totalRecords };
}

export async function findFailedRunsForAllTenants(
  page: number,
  pageSize: number,
): Promise<{ runs: ProcessingRunDocument[]; totalRecords: number }> {
  const filter = {
    status: "failed" as const,
  };

  const [runs, totalRecords] = await Promise.all([
    ProcessingRunModel.find(filter)
      .sort({ failedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    ProcessingRunModel.countDocuments(filter),
  ]);

  return { runs, totalRecords };
}
