import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import DocumentModel from "../../db/models/document.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";
import IndexGenerationModel from "../../db/models/indexGeneration.model.js";
import type { ProcessingStageName } from "../../db/models/processingRun.model.js";

const RETRY_JOB_MAP: Record<ProcessingStageName, string> = {
  security_scanning: "document.extract",
  extraction: "document.extract",
  ocr: "document.extract",
  quality_review: "document.extract",
  metadata_review: "document.extract",
  chunking: "document.chunk",
  embedding: "document.embed",
  indexing: "document.index",
  finalization: "document.index",
};
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_NOT_FOUND } from "../../common/errors/errorCodes.js";
import { getDocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { getApiJobDispatcher } from "../jobs/jobDispatcher.js";
import { upsertArtifact } from "../extraction/extraction.repository.js";
import { createStructuredLogger } from "../../common/utils/structuredLogger.js";
import {
  isValidRunTransition,
  PROCESSING_STAGES,
  STAGE_ORDER,
  getSafeErrorInfo,
} from "./processingStateMachine.js";
import {
  createProcessingRun,
  findActiveRunForDocument,
  findLatestRunForDocument,
  findProcessingRunsForDocument,
  updateProcessingRun,
  findProcessingStages,
  upsertProcessingStage,
  updateProcessingStage,
  findFailedRunsForTenant,
  findFailedRunsForAllTenants,
  findProcessingRun,
} from "./processingProgress.repository.js";
import type {
  ProcessingRunView,
  ProcessingStageView,
  ProcessingStatusResponse,
  ProcessingHistoryResponse,
  RetryStageInput,
  CancelProcessingInput,
  ProcessingProgressQuery,
} from "./processingProgress.types.js";

function serializeStage(stage: {
  _id?: unknown;
  runId: unknown;
  documentId: unknown;
  documentVersion: number;
  stageName: string;
  status: string;
  attemptNumber: number;
  maxAttempts: number;
  jobId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  artifactVersion: number;
  traceId: string;
  durationMs: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}): ProcessingStageView {
  return {
    id: (stage._id?.toString?.() ?? "") as string,
    runId: stage.runId?.toString?.() ?? "",
    documentId: stage.documentId?.toString?.() ?? "",
    documentVersion: stage.documentVersion,
    stageName: stage.stageName as ProcessingStageView["stageName"],
    status: stage.status as ProcessingStageView["status"],
    attemptNumber: stage.attemptNumber,
    maxAttempts: stage.maxAttempts,
    jobId: stage.jobId,
    startedAt: stage.startedAt?.toISOString?.() ?? null,
    completedAt: stage.completedAt?.toISOString?.() ?? null,
    failedAt: stage.failedAt?.toISOString?.() ?? null,
    progress: stage.progress,
    errorCode: stage.errorCode,
    errorMessage: stage.errorMessage,
    retryable: stage.retryable,
    artifactVersion: stage.artifactVersion,
    traceId: stage.traceId,
    durationMs: stage.durationMs,
    metadata: stage.metadata ?? {},
    createdAt: stage.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: stage.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

function serializeRun(
  run: {
    _id?: unknown;
    tenantId: unknown;
    documentId: unknown;
    documentVersion: number;
    status: string;
    currentStage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    canceledAt: Date | null;
    retryCount: number;
    maxRetries: number;
    progress: number;
    errorCode: string | null;
    errorMessage: string | null;
    traceId: string;
    createdAt: Date;
    updatedAt: Date;
  },
  stages: ProcessingStageView[] = [],
  resolved?: { tenantName?: string | null; documentName?: string | null },
): ProcessingRunView {
  return {
    id: (run._id?.toString?.() ?? "") as string,
    tenantId: run.tenantId?.toString?.() ?? "",
    documentId: run.documentId?.toString?.() ?? "",
    documentVersion: run.documentVersion,
    status: run.status as ProcessingRunView["status"],
    currentStage: (run.currentStage as ProcessingRunView["currentStage"]) ?? null,
    startedAt: run.startedAt?.toISOString?.() ?? null,
    completedAt: run.completedAt?.toISOString?.() ?? null,
    failedAt: run.failedAt?.toISOString?.() ?? null,
    canceledAt: run.canceledAt?.toISOString?.() ?? null,
    retryCount: run.retryCount,
    maxRetries: run.maxRetries,
    progress: run.progress,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    traceId: run.traceId,
    tenantName: resolved?.tenantName ?? null,
    documentName: resolved?.documentName ?? null,
    stages,
    createdAt: run.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: run.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

async function resolveDocumentForProcessing(
  documentId: string,
  callerTenantId: string,
  isSuperAdmin: boolean,
): Promise<{ doc: NonNullable<Awaited<ReturnType<typeof DocumentModel.findOne>>>; effectiveTenantId: string }> {
  const docId = new Types.ObjectId(documentId);
  if (isSuperAdmin) {
    const doc = await DocumentModel.findOne({ _id: docId });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }
    return { doc, effectiveTenantId: doc.tenantId.toString() };
  }
  const tenId = new Types.ObjectId(callerTenantId);
  const doc = await DocumentModel.findOne({ _id: docId, tenantId: tenId });
  if (!doc) {
    throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
  }
  return { doc, effectiveTenantId: callerTenantId };
}

export async function initiateProcessingRun(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  actorId: string,
  isSuperAdmin = false,
): Promise<ProcessingRunView> {
  const { effectiveTenantId } = await resolveDocumentForProcessing(documentId, tenantId, isSuperAdmin);

  const existing = await findActiveRunForDocument(effectiveTenantId, documentId, documentVersion);
  if (existing) {
    const stages = await findProcessingStages(effectiveTenantId, existing._id.toString());
    return serializeRun(existing, stages.map(serializeStage));
  }

  const traceId = randomUUID();
  const run = await createProcessingRun({
    tenantId: effectiveTenantId,
    documentId,
    documentVersion,
    traceId,
  });

  for (const stageName of PROCESSING_STAGES) {
    await upsertProcessingStage({
      tenantId: effectiveTenantId,
      runId: run._id.toString(),
      documentId,
      documentVersion,
      stageName,
      traceId,
    });
  }

  const allStages = await findProcessingStages(effectiveTenantId, run._id.toString());
  const securityStage = allStages.find((s) => s.stageName === "security_scanning");
  if (securityStage) {
    await updateProcessingStage(effectiveTenantId, securityStage._id.toString(), {
      status: "skipped",
    });
  }

  await updateProcessingRun(effectiveTenantId, run._id.toString(), {
    currentStage: "extraction",
  });

  await getAuditWriter().write({
    tenantId: effectiveTenantId,
    resourceType: "Document",
    resourceId: documentId,
    action: "PROCESSING_RUN_INITIATED",
    actorId,
    actorEmail: "",
    actorRole: "EMPLOYEE",
    actorKind: "SYSTEM",
    metadata: { documentVersion, runId: run._id.toString(), traceId },
  });

  return serializeRun(run, allStages.map(serializeStage));
}

export async function getProcessingStatus(
  tenantId: string,
  documentId: string,
  actorId: string,
  isSuperAdmin = false,
): Promise<ProcessingStatusResponse> {
  const { doc, effectiveTenantId } = await resolveDocumentForProcessing(documentId, tenantId, isSuperAdmin);

  if (!isSuperAdmin) {
    await getDocumentAccessAuthorizationService().authorizeDocumentAction(
      { tenantId: effectiveTenantId, actorId },
      documentId,
      "read",
    );
  }

  const run = await findLatestRunForDocument(effectiveTenantId, documentId, doc.version);
  if (!run) {
    return {
      documentId,
      documentVersion: doc.version,
      overallStatus: "not_started",
      currentStage: null,
      progress: 0,
      run: null,
      error: null,
    };
  }

  const stages = await findProcessingStages(effectiveTenantId, run._id.toString());
  const serializedStages = stages.map(serializeStage);
  const serializedRun = serializeRun(run, serializedStages);

  let error: ProcessingStatusResponse["error"] = null;
  if (run.status === "failed" && run.errorCode) {
    const safe = getSafeErrorInfo(run.errorCode, run.errorMessage);
    error = { ...safe, errorCode: run.errorCode };
  }

  return {
    documentId,
    documentVersion: doc.version,
    overallStatus: run.status,
    currentStage: run.currentStage,
    progress: run.progress,
    run: serializedRun,
    error,
  };
}

export async function getProcessingHistory(
  tenantId: string,
  documentId: string,
  query: ProcessingProgressQuery,
  actorId: string,
  isSuperAdmin = false,
): Promise<ProcessingHistoryResponse> {
  const { effectiveTenantId } = await resolveDocumentForProcessing(documentId, tenantId, isSuperAdmin);

  if (!isSuperAdmin) {
    await getDocumentAccessAuthorizationService().authorizeDocumentAction(
      { tenantId: effectiveTenantId, actorId },
      documentId,
      "read",
    );
  }

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 10));

  const { runs, totalRecords } = await findProcessingRunsForDocument(
    effectiveTenantId,
    documentId,
    page,
    pageSize,
  );

  const serializedRuns: ProcessingRunView[] = [];
  for (const run of runs) {
    const stages = await findProcessingStages(effectiveTenantId, run._id.toString());
    serializedRuns.push(serializeRun(run, stages.map(serializeStage)));
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return {
    documentId,
    documentVersion: 0,
    runs: serializedRuns,
    pagination: { page, pageSize, totalPages, totalRecords },
  };
}

export async function retryProcessingStage(
  tenantId: string,
  documentId: string,
  input: RetryStageInput,
  actorId: string,
  isSuperAdmin = false,
): Promise<ProcessingRunView> {
  const { doc, effectiveTenantId } = await resolveDocumentForProcessing(documentId, tenantId, isSuperAdmin);

  const run = await findLatestRunForDocument(effectiveTenantId, documentId, doc.version);
  if (!run) {
    throw new AppError(404, "PROCESSING_RUN_NOT_FOUND", "No processing run found for this document");
  }

  if (run.status !== "failed") {
    throw new AppError(
      400,
      "INVALID_OPERATION",
      `Cannot retry a processing run with status '${run.status}'. Only failed runs can be retried.`,
    );
  }

  const targetStage = input.stageName || run.currentStage;
  if (!targetStage) {
    throw new AppError(400, "INVALID_OPERATION", "No stage specified for retry.");
  }

  if (!isValidRunTransition(run.status, "queued")) {
    throw new AppError(
      400,
      "INVALID_TRANSITION",
      `Cannot transition from '${run.status}' to 'queued'`,
    );
  }

  const traceId = randomUUID();
  const updatedRun = await updateProcessingRun(effectiveTenantId, run._id.toString(), {
    status: "queued",
    currentStage: targetStage,
    traceId,
    retryCount: run.retryCount + 1,
  });

  if (!updatedRun) {
    throw new AppError(500, "DATABASE_ERROR", "Failed to update processing run");
  }

  const stages = await findProcessingStages(effectiveTenantId, run._id.toString());
  for (const stage of stages) {
    if (STAGE_ORDER[stage.stageName] >= STAGE_ORDER[targetStage]) {
      await updateProcessingStage(effectiveTenantId, stage._id.toString(), {
        status: "pending",
        attemptNumber: 1,
        progress: 0,
      });
    }
  }

  await DocumentModel.updateOne(
    { _id: new Types.ObjectId(documentId), tenantId: new Types.ObjectId(effectiveTenantId) },
    { $set: { status: "processing" } },
  );

  const log = createStructuredLogger("retry-processing-stage");
  const jobType = RETRY_JOB_MAP[targetStage] ?? "document.extract";

  try {
    const docId = new Types.ObjectId(documentId);
    const tenId = new Types.ObjectId(effectiveTenantId);
    const dispatcher = getApiJobDispatcher();

    if (jobType === "document.extract") {
      const ver = await DocumentVersionModel.findOne({
        documentId: docId,
        version: doc.version,
        tenantId: tenId,
      });

      if (ver) {
        await upsertArtifact(tenId, docId, doc.version, {
          sourceChecksum: ver.checksum,
          parserName: "pending",
          parserVersion: "pending",
          status: "pending",
        });
      }

      const result = await dispatcher.enqueue({
        jobType: "document.extract",
        tenantId: effectiveTenantId,
        actorId,
        traceId,
        idempotencyKey: `ext-${documentId}-${doc.version}-retry-${Date.now()}`,
        payload: {
          documentId,
          tenantId: effectiveTenantId,
          documentVersion: doc.version,
        },
      });

      log.info(
        { documentId, tenantId: effectiveTenantId, documentVersion: doc.version, stage: targetStage, jobId: result.jobId },
        "Retry: extraction job enqueued",
      );
    } else {
      const generation = await IndexGenerationModel.findOne({
        tenantId: tenId,
        documentId: docId,
      }).sort({ generationNumber: -1 });

      if (!generation) {
        throw new AppError(
          400,
          "GENERATION_NOT_FOUND",
          `No index generation found for this document. Cannot retry from stage '${targetStage}'.`,
        );
      }

      const generationId = generation._id.toString();

      if (jobType === "document.chunk") {
        const document = await DocumentModel.findOne({ _id: docId, tenantId: tenId });
        const result = await dispatcher.enqueue({
          jobType: "document.chunk",
          tenantId: effectiveTenantId,
          actorId,
          traceId,
          idempotencyKey: `chunk-${documentId}-${doc.version}-${generationId}-retry-${Date.now()}`,
          payload: {
            documentId,
            tenantId: effectiveTenantId,
            documentVersion: doc.version,
            generationId,
            department: document?.department ?? null,
            classification: document?.classification ?? null,
            chunkingConfig: generation.chunkingConfig ?? {
              targetTokens: 400,
              hardCeiling: 800,
              overlap: 50,
            },
          },
        });

        log.info(
          { documentId, tenantId: effectiveTenantId, stage: targetStage, generationId, jobId: result.jobId },
          "Retry: chunking job enqueued",
        );
      } else if (jobType === "document.embed") {
        const result = await dispatcher.enqueue({
          jobType: "document.embed",
          tenantId: effectiveTenantId,
          actorId,
          traceId,
          idempotencyKey: `embed-${documentId}-${doc.version}-${generationId}-retry-${Date.now()}`,
          payload: {
            documentId,
            tenantId: effectiveTenantId,
            documentVersion: doc.version,
            generationId,
          },
        });

        log.info(
          { documentId, tenantId: effectiveTenantId, stage: targetStage, generationId, jobId: result.jobId },
          "Retry: embedding job enqueued",
        );
      } else if (jobType === "document.index") {
        const result = await dispatcher.enqueue({
          jobType: "document.index",
          tenantId: effectiveTenantId,
          actorId,
          traceId,
          idempotencyKey: `index-${documentId}-${doc.version}-${generationId}-retry-${Date.now()}`,
          payload: {
            documentId,
            tenantId: effectiveTenantId,
            documentVersion: doc.version,
            generationId,
          },
        });

        log.info(
          { documentId, tenantId: effectiveTenantId, stage: targetStage, generationId, jobId: result.jobId },
          "Retry: indexing job enqueued",
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const error = err instanceof Error ? err : new Error(String(err));
    log.error(
      { documentId, tenantId: effectiveTenantId, stage: targetStage, error: error.message },
      "Retry: failed to enqueue job",
    );
  }

  await getAuditWriter().write({
    tenantId: effectiveTenantId,
    resourceType: "Document",
    resourceId: documentId,
    action: "PROCESSING_STAGE_RETRIED",
    actorId,
    actorEmail: "",
    actorRole: "EMPLOYEE",
    actorKind: "USER",
    metadata: { runId: run._id.toString(), stage: targetStage, traceId },
  });

  const updatedStages = await findProcessingStages(effectiveTenantId, updatedRun._id.toString());
  return serializeRun(updatedRun, updatedStages.map(serializeStage));
}

export async function reprocessDocument(
  tenantId: string,
  documentId: string,
  actorId: string,
  isSuperAdmin = false,
): Promise<ProcessingRunView> {
  const { doc, effectiveTenantId } = await resolveDocumentForProcessing(documentId, tenantId, isSuperAdmin);

  const activeRun = await findActiveRunForDocument(effectiveTenantId, documentId, doc.version);
  if (activeRun) {
    throw new AppError(
      400,
      "INVALID_OPERATION",
      "A processing run is already active for this document. Cancel it first.",
    );
  }

  const traceId = randomUUID();
  const run = await createProcessingRun({
    tenantId: effectiveTenantId,
    documentId,
    documentVersion: doc.version,
    traceId,
  });

  for (const stageName of PROCESSING_STAGES) {
    await upsertProcessingStage({
      tenantId: effectiveTenantId,
      runId: run._id.toString(),
      documentId,
      documentVersion: doc.version,
      stageName,
      traceId,
    });
  }

  const allStages = await findProcessingStages(effectiveTenantId, run._id.toString());
  const securityStage = allStages.find((s) => s.stageName === "security_scanning");
  if (securityStage) {
    await updateProcessingStage(effectiveTenantId, securityStage._id.toString(), {
      status: "skipped",
    });
  }

  await updateProcessingRun(effectiveTenantId, run._id.toString(), {
    currentStage: "extraction",
  });

  await DocumentModel.updateOne(
    { _id: new Types.ObjectId(documentId), tenantId: new Types.ObjectId(effectiveTenantId) },
    { $set: { status: "reprocessing" } },
  );

  try {
    const docId = new Types.ObjectId(documentId);
    const tenId = new Types.ObjectId(effectiveTenantId);

    const ver = await DocumentVersionModel.findOne({
      documentId: docId,
      version: doc.version,
      tenantId: tenId,
    });

    if (ver) {
      await upsertArtifact(tenId, docId, doc.version, {
        sourceChecksum: ver.checksum,
        parserName: "pending",
        parserVersion: "pending",
        status: "pending",
      });
    }

    const dispatcher = getApiJobDispatcher();
    const result = await dispatcher.enqueue({
      jobType: "document.extract",
      tenantId: effectiveTenantId,
      actorId,
      traceId,
      idempotencyKey: `ext-${documentId}-${doc.version}-${Date.now()}`,
      payload: {
        documentId,
        tenantId: effectiveTenantId,
        documentVersion: doc.version,
      },
    });

    const log = createStructuredLogger("reprocess-document");
    log.info(
      { documentId, tenantId: effectiveTenantId, documentVersion: doc.version, jobId: result.jobId },
      "Reprocess: extraction job enqueued",
    );
  } catch (err: unknown) {
    const log = createStructuredLogger("reprocess-document");
    const error = err instanceof Error ? err : new Error(String(err));
    log.error(
      { documentId, tenantId: effectiveTenantId, error: error.message },
      "Reprocess: failed to enqueue extraction job",
    );
  }

  await getAuditWriter().write({
    tenantId: effectiveTenantId,
    resourceType: "Document",
    resourceId: documentId,
    action: "DOCUMENT_REPROCESSED",
    actorId,
    actorEmail: "",
    actorRole: "EMPLOYEE",
    actorKind: "USER",
    metadata: { documentVersion: doc.version, runId: run._id.toString(), traceId },
  });

  return serializeRun(run, allStages.map(serializeStage));
}

export async function cancelProcessing(
  tenantId: string,
  documentId: string,
  input: CancelProcessingInput,
  actorId: string,
  isSuperAdmin = false,
): Promise<ProcessingRunView> {
  const { doc, effectiveTenantId } = await resolveDocumentForProcessing(documentId, tenantId, isSuperAdmin);

  const run = await findActiveRunForDocument(effectiveTenantId, documentId, doc.version);
  if (!run) {
    throw new AppError(404, "PROCESSING_RUN_NOT_FOUND", "No active processing run found for this document");
  }

  if (!isValidRunTransition(run.status, "canceled")) {
    throw new AppError(
      400,
      "INVALID_TRANSITION",
      `Cannot cancel a processing run with status '${run.status}'`,
    );
  }

  const now = new Date();
  const updatedRun = await updateProcessingRun(effectiveTenantId, run._id.toString(), {
    status: "canceled",
    canceledAt: now,
    canceledBy: new Types.ObjectId(actorId),
    metadata: { cancelReason: input.reason || null },
  });

  if (!updatedRun) {
    throw new AppError(500, "DATABASE_ERROR", "Failed to cancel processing run");
  }

  const stages = await findProcessingStages(effectiveTenantId, run._id.toString());
  for (const stage of stages) {
    if (stage.status === "pending" || stage.status === "running") {
      await updateProcessingStage(effectiveTenantId, stage._id.toString(), {
        status: "canceled",
        failedAt: now,
      });
    }
  }

  await getAuditWriter().write({
    tenantId: effectiveTenantId,
    resourceType: "Document",
    resourceId: documentId,
    action: "PROCESSING_CANCELED",
    actorId,
    actorEmail: "",
    actorRole: "EMPLOYEE",
    actorKind: "USER",
    metadata: { runId: run._id.toString(), reason: input.reason || null },
  });

  const updatedStages = await findProcessingStages(effectiveTenantId, updatedRun._id.toString());
  return serializeRun(updatedRun, updatedStages.map(serializeStage));
}

export async function getFailedProcessingDashboard(
  tenantId: string,
  page: number,
  pageSize: number,
): Promise<{ runs: ProcessingRunView[]; pagination: { page: number; pageSize: number; totalPages: number; totalRecords: number } }> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));

  const { runs, totalRecords } = await findFailedRunsForTenant(
    tenantId,
    safePage,
    safePageSize,
  );

  const serializedRuns: ProcessingRunView[] = [];
  for (const run of runs) {
    const stages = await findProcessingStages(tenantId, run._id.toString());
    serializedRuns.push(serializeRun(run, stages.map(serializeStage)));
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / safePageSize));

  return {
    runs: serializedRuns,
    pagination: { page: safePage, pageSize: safePageSize, totalPages, totalRecords },
  };
}

export async function getAllFailedProcessingDashboard(
  page: number,
  pageSize: number,
): Promise<{ runs: ProcessingRunView[]; pagination: { page: number; pageSize: number; totalPages: number; totalRecords: number } }> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));

  const { runs, totalRecords } = await findFailedRunsForAllTenants(
    safePage,
    safePageSize,
  );

  // Batch-lookup tenant names and document filenames
  const tenantIds = [...new Set(runs.map((r) => r.tenantId.toString()))];
  const documentIds = [...new Set(runs.map((r) => r.documentId.toString()))];

  const [tenants, documents] = await Promise.all([
    TenantModel.find({ _id: { $in: tenantIds } }).select("name").lean(),
    DocumentModel.find({ _id: { $in: documentIds } }).select("fileName").lean(),
  ]);

  const tenantNameById = new Map(tenants.map((t) => [t._id.toString(), t.name as string]));
  const docNameById = new Map(documents.map((d) => [d._id.toString(), d.fileName as string]));

  const serializedRuns: ProcessingRunView[] = [];
  for (const run of runs) {
    const stages = await findProcessingStages(run.tenantId.toString(), run._id.toString());
    serializedRuns.push(serializeRun(run, stages.map(serializeStage), {
      tenantName: tenantNameById.get(run.tenantId.toString()) ?? null,
      documentName: docNameById.get(run.documentId.toString()) ?? null,
    }));
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / safePageSize));

  return {
    runs: serializedRuns,
    pagination: { page: safePage, pageSize: safePageSize, totalPages, totalRecords },
  };
}

export async function reportStageProgress(
  tenantId: string,
  runId: string,
  stageName: string,
  update: {
    status?: string;
    progress?: number;
    jobId?: string;
    errorCode?: string;
    errorMessage?: string;
    retryable?: boolean;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const run = await findProcessingRun(tenantId, runId);
  if (!run) return;

  const stages = await findProcessingStages(tenantId, runId);
  const stage = stages.find((s) => s.stageName === stageName);
  if (!stage) return;

  const now = new Date();
  const stageUpdate: Parameters<typeof updateProcessingStage>[2] = {};

  if (update.status) {
    stageUpdate.status = update.status as "pending" | "running" | "completed" | "failed" | "skipped" | "canceled";
    if (update.status === "running" && !stage.startedAt) {
      stageUpdate.startedAt = now;
    }
    if (update.status === "completed") {
      stageUpdate.completedAt = now;
      stageUpdate.durationMs = stage.startedAt
        ? now.getTime() - stage.startedAt.getTime()
        : null;
    }
    if (update.status === "failed") {
      stageUpdate.failedAt = now;
    }
  }

  if (update.progress !== undefined) stageUpdate.progress = update.progress;
  if (update.jobId) stageUpdate.jobId = update.jobId;
  if (update.errorCode) stageUpdate.errorCode = update.errorCode;
  if (update.errorMessage) stageUpdate.errorMessage = update.errorMessage;
  if (update.retryable !== undefined) stageUpdate.retryable = update.retryable;
  if (update.metadata) stageUpdate.metadata = update.metadata;

  await updateProcessingStage(tenantId, stage._id.toString(), stageUpdate);

  if (update.status === "running" && run.status === "queued") {
    await updateProcessingRun(tenantId, runId, {
      status: "running",
      startedAt: now,
      currentStage: stageName as typeof run.currentStage,
    });
  }

  if (update.status === "completed" || update.status === "failed") {
    const currentProgress = computeStageProgress(stages, stageName, update);
    const nextStage: ProcessingStageName | null =
      update.status === "completed"
        ? (getNextStageName(stageName) as ProcessingStageName | null)
        : (stageName as ProcessingStageName);
    await updateProcessingRun(tenantId, runId, {
      progress: currentProgress,
      currentStage: nextStage,
    });

    if (update.status === "failed") {
      await updateProcessingRun(tenantId, runId, {
        status: "failed",
        failedAt: now,
        errorCode: update.errorCode || null,
        errorMessage: update.errorMessage || null,
      });
    }
  }

  if (update.status === "completed") {
    const allDone = stages.every(
      (s) => s.stageName === stageName || s.status === "completed" || s.status === "skipped",
    );
    if (allDone) {
      await updateProcessingRun(tenantId, runId, {
        status: "completed",
        completedAt: now,
        progress: 100,
        currentStage: null,
      });
    }
  }
}

function computeStageProgress(
  stages: Array<{ stageName: string; status: string; progress: number }>,
  currentStageName: string,
  currentUpdate: { progress?: number },
): number {
  let total = 0;
  for (const s of stages) {
    const order = STAGE_ORDER[s.stageName as keyof typeof STAGE_ORDER];
    const currentOrder = STAGE_ORDER[currentStageName as keyof typeof STAGE_ORDER];
    if (order < currentOrder) {
      total += 10;
    } else if (s.stageName === currentStageName) {
      total += Math.round((currentUpdate.progress ?? 0) / 10);
    }
  }
  return Math.min(100, Math.max(0, total));
}

function getNextStageName(currentStage: string): string | null {
  const order = STAGE_ORDER[currentStage as keyof typeof STAGE_ORDER];
  if (order === undefined) return null;
  for (const [name, o] of Object.entries(STAGE_ORDER)) {
    if (o === order + 1) return name;
  }
  return null;
}
