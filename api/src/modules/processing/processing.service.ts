import { Types } from "mongoose";
import { randomUUID } from "node:crypto";
import DocumentModel from "../../db/models/document.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";
import OcrPageResultModel from "../../db/models/ocrPageResult.model.js";
import MetadataCandidateModel from "../../db/models/metadataCandidate.model.js";
import DocumentRelationshipModel from "../../db/models/documentRelationship.model.js";
import ConflictFindingModel from "../../db/models/conflictFinding.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_NOT_FOUND, OCR_LANGUAGE_UNSUPPORTED, REVIEW_NOT_FOUND } from "../../common/errors/errorCodes.js";
import { getApiJobDispatcher } from "../jobs/jobDispatcher.js";
import { getOcrProvider } from "../../providers/ocr/index.js";
import { getEntitlementChecker } from "../../providers/entitlements/index.js";
import { getAuditWriter } from "../../common/observability/index.js";
import {
  findOcrPageResults,
  findDocumentQuality,
  upsertDocumentQuality,
  upsertOcrPageResult,
  getOcrUsageCount,
} from "./processing.repository.js";
import { analyzeDocumentQuality } from "./qualityAgent.js";
import { FakeMetadataAgent } from "./ports/fakeMetadataAgent.js";
import { FakeVersionConflictAgent } from "./ports/fakeVersionConflictAgent.js";
import type {
  TriggerOcrInput,
  ReviewQualityInput,
  RetryOcrInput,
  OcrPageResultView,
  DocumentQualityView,
  MetadataCandidateView,
  ReviewCandidateInput,
  DocumentRelationshipView,
  ConflictFindingView,
  ResolveConflictInput,
  TriggerMetadataAnalysisInput,
  TriggerVersionConflictAnalysisInput,
} from "./processing.types.js";
import { Permission, type PermissionValue } from "../permissions/permissions.catalog.js";
import {
  authorizeTenantOperation,
  type OperationAuthorizationContext,
  type ResolvedOperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import { getDocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";

const metadataAgent = new FakeMetadataAgent();
const versionConflictAgent = new FakeVersionConflictAgent();

async function authorizeProcessingOperation(
  tenantId: string,
  context: OperationAuthorizationContext,
  permission: PermissionValue,
): Promise<ResolvedOperationAuthorizationContext> {
  const actor = await authorizeTenantOperation(context, permission);
  if (tenantId !== actor.tenantId) {
    throw new AppError(
      404,
      DOCUMENT_NOT_FOUND,
      "Document not found or access denied",
    );
  }
  return actor;
}

async function authorizeDocumentPolicy(
  tenantId: string,
  documentId: string,
  context: OperationAuthorizationContext,
  action: "read" | "update" | "reprocess",
): Promise<void> {
  await getDocumentAccessAuthorizationService().authorizeDocumentAction(
    { tenantId, actorId: context.actorId }, documentId, action,
  );
}

async function canReadDocuments(tenantId: string, actorId: string, documentIds: readonly string[]): Promise<boolean> {
  try {
    await getDocumentAccessAuthorizationService().authorizeDocumentsAction({ tenantId, actorId }, documentIds, "read");
    return true;
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) return false;
    throw error;
  }
}

export async function triggerOcrProcessing(
  tenantId: string,
  input: TriggerOcrInput,
  inputContext: OperationAuthorizationContext,
): Promise<{ jobId: string; idempotencyKey: string }> {
  await authorizeDocumentPolicy(tenantId, input.documentId, inputContext, "reprocess");
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_OCR_PROCESS,
  );
  const tenId = new Types.ObjectId(tenantId);
  const docId = new Types.ObjectId(input.documentId);
  const actId = new Types.ObjectId(actor.actorId);

  const doc = await DocumentModel.findOne({ _id: docId, tenantId: tenId });
  if (!doc) {
    throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
  }

  const version = input.version || doc.version;
  const ver = await DocumentVersionModel.findOne({
    documentId: docId,
    version,
    tenantId: tenId,
  });
  if (!ver) {
    throw new AppError(404, "VERSION_NOT_FOUND", `Document version ${version} not found`);
  }

  const ocrProvider = getOcrProvider();
  if (!ocrProvider.isLanguageSupported(input.language || "ar+en")) {
    throw new AppError(400, OCR_LANGUAGE_UNSUPPORTED, `Language '${input.language}' is not supported by the OCR provider`);
  }

  const pageCount = input.pageNumbers?.length || 1;
  const entitlementChecker = getEntitlementChecker();
  await entitlementChecker.checkOcrPageQuota(tenantId, pageCount);

  const traceId = randomUUID();
  const idempotencyKey = `ocr-${docId.toString()}-${version}-${ver.checksum}-${Date.now()}`;

  await upsertOcrPageResults(tenId, docId, version, input.pageNumbers || []);

  const dispatcher = getApiJobDispatcher();
  const enqueueResult = await dispatcher.enqueue({
    jobType: "document.ocr",
    tenantId: tenId.toString(),
    actorId: actId.toString(),
    traceId,
    idempotencyKey,
    payload: {
      documentId: docId.toString(),
      tenantId: tenId.toString(),
      documentVersion: version,
      language: input.language || "ar+en",
      pageNumbers: input.pageNumbers,
    },
  });

  if (!enqueueResult.ok) {
    throw new AppError(500, "OCR_QUEUE_FAILED", enqueueResult.error || "Failed to enqueue OCR job");
  }

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "OCR_TRIGGERED",
    resourceType: "Document",
    resourceId: docId.toString(),
    metadata: {
      documentId: docId.toString(),
      version,
      language: input.language || "ar+en",
      pageCount,
      traceId,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return {
    jobId: enqueueResult.jobId || "",
    idempotencyKey,
  };
}

async function upsertOcrPageResults(
  tenantId: Types.ObjectId,
  documentId: Types.ObjectId,
  documentVersion: number,
  pageNumbers: number[],
): Promise<void> {
  const pagesToProcess = pageNumbers.length > 0 ? pageNumbers : [1];

  for (const pageNum of pagesToProcess) {
    await upsertOcrPageResult(
      tenantId.toString(),
      documentId.toString(),
      documentVersion,
      pageNum,
      {
        status: "pending",
        language: "ar+en",
        provider: "pending",
        providerModel: "pending",
      },
    );
  }
}

export async function getOcrPageResults(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  inputContext: OperationAuthorizationContext,
): Promise<OcrPageResultView[]> {
  await authorizeDocumentPolicy(tenantId, documentId, inputContext, "read");
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_READ,
  );
  const pages = await findOcrPageResults(tenantId, documentId, documentVersion);
  return pages.map((page) => ({
    id: page._id?.toString() || "",
    documentId: page.documentId.toString(),
    tenantId: page.tenantId.toString(),
    documentVersion: page.documentVersion,
    pageNumber: page.pageNumber,
    text: page.text,
    confidence: page.confidence,
    language: page.language,
    provider: page.provider,
    providerModel: page.providerModel,
    durationMs: page.durationMs,
    costUsd: page.costUsd,
    warnings: page.warnings,
    status: page.status,
    failureReason: page.failureReason,
    retryCount: page.retryCount,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  }));
}

export async function getDocumentQuality(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  inputContext: OperationAuthorizationContext,
): Promise<DocumentQualityView | null> {
  await authorizeDocumentPolicy(tenantId, documentId, inputContext, "read");
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_READ,
  );
  const quality = await findDocumentQuality(tenantId, documentId, documentVersion);
  if (!quality) {
    return null;
  }

  return {
    id: quality._id?.toString() || "",
    documentId: quality.documentId.toString(),
    tenantId: quality.tenantId.toString(),
    documentVersion: quality.documentVersion,
    overallConfidence: quality.overallConfidence,
    qualityStatus: quality.qualityStatus,
    issues: quality.issues as unknown as DocumentQualityView["issues"],
    pageConfidences: Object.fromEntries(quality.pageConfidences),
    pageStatuses: Object.fromEntries(quality.pageStatuses) as Record<string, DocumentQualityView["qualityStatus"]>,
    summary: quality.summary,
    requiresReview: quality.requiresReview,
    reviewedBy: quality.reviewedBy?.toString() || null,
    reviewedAt: quality.reviewedAt?.toISOString() || null,
    reviewDecision: quality.reviewDecision,
    reviewNotes: quality.reviewNotes,
    ocrProvider: quality.ocrProvider,
    ocrModelVersion: quality.ocrModelVersion,
    totalPagesProcessed: quality.totalPagesProcessed,
    totalPagesOcr: quality.totalPagesOcr,
    totalCostUsd: quality.totalCostUsd,
    durationMs: quality.durationMs,
    createdAt: quality.createdAt.toISOString(),
    updatedAt: quality.updatedAt.toISOString(),
  };
}

export async function assessDocumentQuality(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  inputContext: OperationAuthorizationContext,
): Promise<DocumentQualityView> {
  await authorizeDocumentPolicy(tenantId, documentId, inputContext, "update");
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_QUALITY_REVIEW,
  );
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_READ,
  );
  const ocrPages = await findOcrPageResults(tenantId, documentId, documentVersion);

  const extractionPages = ocrPages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
    characterCount: p.text.length,
    blockCount: p.words.length > 0 ? 1 : 0,
    hasImageOnlyPages: false,
  }));

  const ocrPageData = ocrPages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
    confidence: p.confidence,
    language: p.language,
    warnings: p.warnings,
  }));

  const result = analyzeDocumentQuality({
    totalPages: extractionPages.length || 1,
    extractionPages,
    ocrPages: ocrPageData,
    detectedLanguages: ["ar", "en"],
    extractionWarnings: [],
  });

  const totalDurationMs = ocrPages.reduce((sum, p) => sum + p.durationMs, 0);
  const totalCostUsd = ocrPages.reduce((sum, p) => sum + p.costUsd, 0);
  const ocrProvider = getOcrProvider();

  await upsertDocumentQuality(tenantId, documentId, documentVersion, {
    overallConfidence: result.overallConfidence,
    qualityStatus: result.qualityStatus,
    issues: result.issues as import("../../db/models/documentQuality.model.js").QualityIssue[],
    pageConfidences: new Map(Object.entries(result.pageConfidences)),
    pageStatuses: new Map(Object.entries(result.pageStatuses)) as Map<string, "READY" | "READY_WITH_WARNINGS" | "REVIEW_REQUIRED" | "FAILED" | "READY_FOR_INDEXING" | "REJECTED">,
    summary: result.summary,
    requiresReview: result.requiresReview,
    ocrProvider: ocrProvider.name,
    ocrModelVersion: ocrProvider.version,
    totalPagesProcessed: extractionPages.length,
    totalPagesOcr: ocrPageData.length,
    totalCostUsd,
    durationMs: totalDurationMs,
  });

  return getDocumentQuality(
    tenantId,
    documentId,
    documentVersion,
    inputContext,
  ) as Promise<DocumentQualityView>;
}

export async function reviewDocumentQuality(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  input: ReviewQualityInput,
  inputContext: OperationAuthorizationContext,
): Promise<DocumentQualityView> {
  await authorizeDocumentPolicy(tenantId, documentId, inputContext, "update");
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_QUALITY_REVIEW,
  );
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_READ,
  );
  const quality = await findDocumentQuality(tenantId, documentId, documentVersion);
  if (!quality) {
    throw new AppError(404, REVIEW_NOT_FOUND, "No quality assessment found for this document version");
  }

  await upsertDocumentQuality(tenantId, documentId, documentVersion, {
    reviewedBy: new Types.ObjectId(actor.actorId),
    reviewedAt: new Date(),
    reviewDecision: input.decision,
    reviewNotes: input.notes || null,
    qualityStatus: input.decision === "approved" ? "READY_FOR_INDEXING" : input.decision === "retry" ? "REVIEW_REQUIRED" : "REJECTED",
    requiresReview: input.decision === "retry",
  });

  if (input.decision === "retry" && input.pageNumbers && input.pageNumbers.length > 0) {
    for (const pageNum of input.pageNumbers) {
      await upsertOcrPageResult(tenantId, documentId, documentVersion, pageNum, {
        status: "retry",
        retryCount: (quality.pageStatuses.get(String(pageNum)) === "REVIEW_REQUIRED" ? 1 : 0) + 1,
      });
    }
  }

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "QUALITY_REVIEWED",
    resourceType: "DocumentQuality",
    resourceId: quality._id?.toString() || documentId,
    metadata: {
      documentId,
      documentVersion,
      decision: input.decision,
      reviewerId: actor.actorId,
      pageNumbers: input.pageNumbers || null,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return getDocumentQuality(
    tenantId,
    documentId,
    documentVersion,
    inputContext,
  ) as Promise<DocumentQualityView>;
}

export async function retryOcrPages(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  input: RetryOcrInput,
  inputContext: OperationAuthorizationContext,
): Promise<{ jobId: string; idempotencyKey: string }> {
  await authorizeDocumentPolicy(tenantId, documentId, inputContext, "reprocess");
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_OCR_PROCESS,
  );
  const tenId = new Types.ObjectId(tenantId);
  const docId = new Types.ObjectId(documentId);

  const doc = await DocumentModel.findOne({ _id: docId, tenantId: tenId });
  if (!doc) {
    throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
  }

  const pages = await findOcrPageResults(tenantId, documentId, documentVersion);
  const retryPages = input.pageNumbers || pages.filter((p) => p.status === "failed" || p.status === "retry").map((p) => p.pageNumber);

  if (retryPages.length === 0) {
    throw new AppError(400, "NO_PAGES_TO_RETRY", "No pages available for retry");
  }

  const traceId = randomUUID();
  const idempotencyKey = `ocr-retry-${docId.toString()}-${documentVersion}-${retryPages.join(",")}-${Date.now()}`;

  const dispatcher = getApiJobDispatcher();
  const enqueueResult = await dispatcher.enqueue({
    jobType: "document.ocr",
    tenantId: tenId.toString(),
    actorId: actor.actorId,
    traceId,
    idempotencyKey,
    payload: {
      documentId: docId.toString(),
      tenantId: tenId.toString(),
      documentVersion,
      language: "ar+en",
      pageNumbers: retryPages,
    },
  });

  if (!enqueueResult.ok) {
    throw new AppError(500, "OCR_QUEUE_FAILED", enqueueResult.error || "Failed to enqueue OCR retry job");
  }

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "OCR_PAGES_RETRIED",
    resourceType: "Document",
    resourceId: docId.toString(),
    metadata: {
      documentId,
      documentVersion,
      pageNumbers: retryPages,
      retryCount: retryPages.length,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return {
    jobId: enqueueResult.jobId || "",
    idempotencyKey,
  };
}

export async function getOcrUsageSummary(
  tenantId: string,
  inputContext: OperationAuthorizationContext,
): Promise<{ pagesUsed: number; periodStart: string; periodEnd: string }> {
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.BILLING_READ,
  );
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const pagesUsed = await getOcrUsageCount(tenantId, startOfMonth, endOfMonth);

  return {
    pagesUsed,
    periodStart: startOfMonth.toISOString(),
    periodEnd: endOfMonth.toISOString(),
  };
}

export async function triggerMetadataAnalysis(
  tenantId: string,
  input: TriggerMetadataAnalysisInput,
  inputContext: OperationAuthorizationContext,
): Promise<{ candidates: MetadataCandidateView[]; summary: string }> {
  await authorizeDocumentPolicy(tenantId, input.documentId, inputContext, "reprocess");
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_READ,
  );

  const tenId = new Types.ObjectId(tenantId);
  const docId = new Types.ObjectId(input.documentId);

  const doc = await DocumentModel.findOne({ _id: docId, tenantId: tenId });
  if (!doc) {
    throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
  }

  const version = input.version || doc.version;
  const ver = await DocumentVersionModel.findOne({
    documentId: docId,
    version,
    tenantId: tenId,
  });
  if (!ver) {
    throw new AppError(404, "VERSION_NOT_FOUND", `Document version ${version} not found`);
  }

  const ocrPages = await OcrPageResultModel.find({
    tenantId: tenId,
    documentId: docId,
    documentVersion: version,
    status: "completed",
  }).sort({ pageNumber: 1 });

  const extractedText = ocrPages.map((p) => p.text).join("\n\n");
  const pageCount = ocrPages.length || 1;

  const extractionResult = await metadataAgent.proposeMetadata({
    documentId: input.documentId,
    documentVersion: version,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    extractedText,
    pageCount,
    checksum: ver.checksum,
    existingMetadata: {
      title: doc.metadata?.title,
      description: doc.metadata?.description,
      tags: doc.metadata?.tags,
      category: doc.category,
      department: doc.department,
      classification: doc.classification,
      effectiveDate: doc.effectiveDate,
      expiryDate: doc.expiryDate,
    },
  });

  const savedCandidates: MetadataCandidateView[] = [];

  for (const candidate of extractionResult.candidates) {
    const saved = await MetadataCandidateModel.findOneAndUpdate(
      {
        tenantId: tenId,
        documentId: docId,
        documentVersion: version,
        fieldType: candidate.fieldType,
        status: "pending",
      },
      {
        tenantId: tenId,
        documentId: docId,
        documentVersion: version,
        fieldType: candidate.fieldType,
        proposedValue: candidate.proposedValue,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
        agentName: "metadata-agent",
        status: "pending",
      },
      { upsert: true, new: true },
    );

    savedCandidates.push({
      id: saved._id?.toString() || "",
      documentId: saved.documentId.toString(),
      tenantId: saved.tenantId.toString(),
      documentVersion: saved.documentVersion,
      fieldType: saved.fieldType as MetadataCandidateView["fieldType"],
      proposedValue: saved.proposedValue,
      confidence: saved.confidence,
      evidence: saved.evidence as MetadataCandidateView["evidence"],
      agentName: saved.agentName,
      status: saved.status as MetadataCandidateView["status"],
      reviewedBy: saved.reviewedBy?.toString() || null,
      reviewedAt: saved.reviewedAt?.toISOString() || null,
      rejectionReason: saved.rejectionReason,
      appliedValue: saved.appliedValue,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    });
  }

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "METADATA_ANALYSIS_TRIGGERED",
    resourceType: "Document",
    resourceId: docId.toString(),
    metadata: {
      documentId: input.documentId,
      version,
      candidatesCount: extractionResult.candidates.length,
      overallConfidence: extractionResult.overallConfidence,
      requiresReview: extractionResult.requiresReview,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return {
    candidates: savedCandidates,
    summary: extractionResult.summary,
  };
}

export async function getMetadataCandidates(
  tenantId: string,
  documentId: string,
  inputContext: OperationAuthorizationContext,
): Promise<MetadataCandidateView[]> {
  await authorizeDocumentPolicy(tenantId, documentId, inputContext, "read");
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_READ,
  );

  const candidates = await MetadataCandidateModel.find({
    tenantId: new Types.ObjectId(tenantId),
    documentId: new Types.ObjectId(documentId),
  }).sort({ confidence: -1, createdAt: -1 });

  return candidates.map((c) => ({
    id: c._id?.toString() || "",
    documentId: c.documentId.toString(),
    tenantId: c.tenantId.toString(),
    documentVersion: c.documentVersion,
    fieldType: c.fieldType as MetadataCandidateView["fieldType"],
    proposedValue: c.proposedValue,
    confidence: c.confidence,
    evidence: c.evidence as MetadataCandidateView["evidence"],
    agentName: c.agentName,
    status: c.status as MetadataCandidateView["status"],
    reviewedBy: c.reviewedBy?.toString() || null,
    reviewedAt: c.reviewedAt?.toISOString() || null,
    rejectionReason: c.rejectionReason,
    appliedValue: c.appliedValue,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function reviewMetadataCandidate(
  tenantId: string,
  candidateId: string,
  input: ReviewCandidateInput,
  inputContext: OperationAuthorizationContext,
): Promise<MetadataCandidateView> {
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_QUALITY_REVIEW,
  );

  const candidate = await MetadataCandidateModel.findOne({
    _id: new Types.ObjectId(candidateId),
    tenantId: new Types.ObjectId(tenantId),
  });

  if (!candidate) {
    throw new AppError(404, REVIEW_NOT_FOUND, "Metadata candidate not found");
  }
  await authorizeDocumentPolicy(tenantId, candidate.documentId.toString(), inputContext, "update");

  candidate.status = input.decision;
  candidate.reviewedBy = new Types.ObjectId(actor.actorId);
  candidate.reviewedAt = new Date();
  candidate.rejectionReason = input.decision === "rejected" ? input.notes || "Rejected" : null;

  if (input.decision === "approved") {
    candidate.appliedValue = input.appliedValue ?? candidate.proposedValue;
  }

  await candidate.save();

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "METADATA_CANDIDATE_REVIEWED",
    resourceType: "MetadataCandidate",
    resourceId: candidateId,
    metadata: {
      documentId: candidate.documentId.toString(),
      fieldType: candidate.fieldType,
      decision: input.decision,
      confidence: candidate.confidence,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return {
    id: candidate._id?.toString() || "",
    documentId: candidate.documentId.toString(),
    tenantId: candidate.tenantId.toString(),
    documentVersion: candidate.documentVersion,
    fieldType: candidate.fieldType as MetadataCandidateView["fieldType"],
    proposedValue: candidate.proposedValue,
    confidence: candidate.confidence,
    evidence: candidate.evidence as MetadataCandidateView["evidence"],
    agentName: candidate.agentName,
    status: candidate.status as MetadataCandidateView["status"],
    reviewedBy: candidate.reviewedBy?.toString() || null,
    reviewedAt: candidate.reviewedAt?.toISOString() || null,
    rejectionReason: candidate.rejectionReason,
    appliedValue: candidate.appliedValue,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

export async function triggerVersionConflictAnalysis(
  tenantId: string,
  input: TriggerVersionConflictAnalysisInput,
  inputContext: OperationAuthorizationContext,
): Promise<{
  relationships: DocumentRelationshipView[];
  conflicts: ConflictFindingView[];
  summary: string;
}> {
  await authorizeDocumentPolicy(tenantId, input.documentId, inputContext, "reprocess");
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_READ,
  );

  const tenId = new Types.ObjectId(tenantId);
  const docId = new Types.ObjectId(input.documentId);

  const doc = await DocumentModel.findOne({ _id: docId, tenantId: tenId });
  if (!doc) {
    throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
  }

  const version = doc.version;
  const ver = await DocumentVersionModel.findOne({
    documentId: docId,
    version,
    tenantId: tenId,
  });
  if (!ver) {
    throw new AppError(404, "VERSION_NOT_FOUND", `Document version ${version} not found`);
  }

  const sourceOcrPages = await OcrPageResultModel.find({
    tenantId: tenId,
    documentId: docId,
    documentVersion: version,
    status: "completed",
  }).sort({ pageNumber: 1 });

  const sourceExtractedText = sourceOcrPages.map((p) => p.text).join("\n\n");

  let candidateDocIds: Types.ObjectId[];
  if (input.candidateDocumentIds && input.candidateDocumentIds.length > 0) {
    candidateDocIds = input.candidateDocumentIds.map((id) => new Types.ObjectId(id));
  } else {
    const sameChecksumDocs = await DocumentModel.find({
      tenantId: tenId,
      _id: { $ne: docId },
      checksum: doc.checksum,
    }).limit(10);
    const sameNameDocs = await DocumentModel.find({
      tenantId: tenId,
      _id: { $ne: docId },
      fileName: doc.fileName,
    }).limit(10);
    const candidateIds = new Set<string>();
    for (const d of [...sameChecksumDocs, ...sameNameDocs]) {
      candidateIds.add(d._id.toString());
    }
    candidateDocIds = [...candidateIds].map((id) => new Types.ObjectId(id));

    if (candidateDocIds.length === 0) {
      const recentDocs = await DocumentModel.find({
        tenantId: tenId,
        _id: { $ne: docId },
        status: "processed",
      })
        .sort({ createdAt: -1 })
        .limit(20);
      candidateDocIds = recentDocs.map((d) => d._id);
    }
  }

  const candidateDocuments = [];
  for (const cId of candidateDocIds) {
    const cDoc = await DocumentModel.findOne({ _id: cId, tenantId: tenId });
    if (!cDoc) continue;

    const cVer = await DocumentVersionModel.findOne({
      documentId: cId,
      version: cDoc.version,
      tenantId: tenId,
    });

    const cOcrPages = await OcrPageResultModel.find({
      tenantId: tenId,
      documentId: cId,
      documentVersion: cDoc.version,
      status: "completed",
    }).sort({ pageNumber: 1 });

    candidateDocuments.push({
      id: cId.toString(),
      fileName: cDoc.fileName,
      checksum: cVer?.checksum || "",
      extractedText: cOcrPages.map((p) => p.text).join("\n\n"),
      metadata: {
        title: cDoc.metadata?.title,
        effectiveDate: cDoc.effectiveDate,
        expiryDate: cDoc.expiryDate,
        department: cDoc.department,
        classification: cDoc.classification,
        tags: cDoc.metadata?.tags,
        version: cDoc.version,
      },
    });
  }

  if (candidateDocuments.length === 0) {
    return {
      relationships: [],
      conflicts: [],
      summary: `No candidate documents found for comparison with "${doc.fileName}".`,
    };
  }

  const analysisResult = await versionConflictAgent.analyzeDocument({
    sourceDocument: {
      id: input.documentId,
      fileName: doc.fileName,
      checksum: ver.checksum,
      extractedText: sourceExtractedText,
      metadata: {
        title: doc.metadata?.title,
        effectiveDate: doc.effectiveDate,
        expiryDate: doc.expiryDate,
        department: doc.department,
        classification: doc.classification,
        tags: doc.metadata?.tags,
        version: doc.version,
      },
    },
    candidateDocuments,
  });

  const savedRelationships: DocumentRelationshipView[] = [];
  for (const rel of analysisResult.relationships) {
    const targetDocId = new Types.ObjectId(rel.targetDocumentId);
    const saved = await DocumentRelationshipModel.findOneAndUpdate(
      {
        tenantId: tenId,
        sourceDocumentId: docId,
        targetDocumentId: targetDocId,
        relationshipType: rel.relationshipType,
      },
      {
        tenantId: tenId,
        sourceDocumentId: docId,
        targetDocumentId: targetDocId,
        relationshipType: rel.relationshipType,
        confidence: rel.confidence,
        evidence: rel.evidence,
        status: rel.requiresApproval ? "pending" : "active",
      },
      { upsert: true, new: true },
    );

    savedRelationships.push({
      id: saved._id?.toString() || "",
      sourceDocumentId: saved.sourceDocumentId.toString(),
      targetDocumentId: saved.targetDocumentId.toString(),
      tenantId: saved.tenantId.toString(),
      relationshipType: saved.relationshipType as DocumentRelationshipView["relationshipType"],
      confidence: saved.confidence,
      evidence: saved.evidence as DocumentRelationshipView["evidence"],
      status: saved.status as DocumentRelationshipView["status"],
      approvedBy: saved.approvedBy?.toString() || null,
      approvedAt: saved.approvedAt?.toISOString() || null,
      rejectionReason: saved.rejectionReason,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    });
  }

  const savedConflicts: ConflictFindingView[] = [];
  for (const conflict of analysisResult.conflicts) {
    const targetDocId = new Types.ObjectId(conflict.targetDocumentId);
    const saved = await ConflictFindingModel.findOneAndUpdate(
      {
        tenantId: tenId,
        sourceDocumentId: docId,
        targetDocumentId: targetDocId,
        conflictType: conflict.conflictType,
        status: { $in: ["detected", "reviewing"] },
      },
      {
        tenantId: tenId,
        sourceDocumentId: docId,
        targetDocumentId: targetDocId,
        conflictType: conflict.conflictType,
        severity: conflict.severity,
        description: conflict.description,
        evidence: conflict.evidence,
        confidence: conflict.confidence,
        agentName: "version-conflict-agent",
        status: "detected",
      },
      { upsert: true, new: true },
    );

    savedConflicts.push({
      id: saved._id?.toString() || "",
      sourceDocumentId: saved.sourceDocumentId.toString(),
      targetDocumentId: saved.targetDocumentId.toString(),
      tenantId: saved.tenantId.toString(),
      conflictType: saved.conflictType as ConflictFindingView["conflictType"],
      severity: saved.severity as ConflictFindingView["severity"],
      description: saved.description,
      evidence: saved.evidence as ConflictFindingView["evidence"],
      status: saved.status as ConflictFindingView["status"],
      resolution: saved.resolution as ConflictFindingView["resolution"],
      resolutionNotes: saved.resolutionNotes,
      resolvedBy: saved.resolvedBy?.toString() || null,
      resolvedAt: saved.resolvedAt?.toISOString() || null,
      confidence: saved.confidence,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    });
  }

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "VERSION_CONFLICT_ANALYSIS_TRIGGERED",
    resourceType: "Document",
    resourceId: docId.toString(),
    metadata: {
      documentId: input.documentId,
      candidatesAnalyzed: candidateDocuments.length,
      relationshipsFound: analysisResult.relationships.length,
      conflictsFound: analysisResult.conflicts.length,
      requiresReview: analysisResult.requiresReview,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return {
    relationships: savedRelationships,
    conflicts: savedConflicts,
    summary: analysisResult.summary,
  };
}

export async function getDocumentRelationships(
  tenantId: string,
  documentId: string,
  inputContext: OperationAuthorizationContext,
): Promise<DocumentRelationshipView[]> {
  await authorizeDocumentPolicy(tenantId, documentId, inputContext, "read");
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_READ,
  );

  const relationships = await DocumentRelationshipModel.find({
    tenantId: new Types.ObjectId(tenantId),
    $or: [
      { sourceDocumentId: new Types.ObjectId(documentId) },
      { targetDocumentId: new Types.ObjectId(documentId) },
    ],
  }).sort({ confidence: -1 });
  await getDocumentAccessAuthorizationService().authorizeDocumentsAction(
    { tenantId, actorId: inputContext.actorId },
    relationships.flatMap((item) => [item.sourceDocumentId.toString(), item.targetDocumentId.toString()]), "read",
  );

  return relationships.map((r) => ({
    id: r._id?.toString() || "",
    sourceDocumentId: r.sourceDocumentId.toString(),
    targetDocumentId: r.targetDocumentId.toString(),
    tenantId: r.tenantId.toString(),
    relationshipType: r.relationshipType as DocumentRelationshipView["relationshipType"],
    confidence: r.confidence,
    evidence: r.evidence as DocumentRelationshipView["evidence"],
    status: r.status as DocumentRelationshipView["status"],
    approvedBy: r.approvedBy?.toString() || null,
    approvedAt: r.approvedAt?.toISOString() || null,
    rejectionReason: r.rejectionReason,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function approveDocumentRelationship(
  tenantId: string,
  relationshipId: string,
  inputContext: OperationAuthorizationContext,
): Promise<DocumentRelationshipView> {
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_QUALITY_REVIEW,
  );

  const relationship = await DocumentRelationshipModel.findOne({
    _id: new Types.ObjectId(relationshipId),
    tenantId: new Types.ObjectId(tenantId),
  });

  if (!relationship) {
    throw new AppError(404, REVIEW_NOT_FOUND, "Document relationship not found");
  }
  await getDocumentAccessAuthorizationService().authorizeDocumentsAction(
    { tenantId, actorId: inputContext.actorId },
    [relationship.sourceDocumentId.toString(), relationship.targetDocumentId.toString()], "update",
  );

  relationship.status = "active";
  relationship.approvedBy = new Types.ObjectId(actor.actorId);
  relationship.approvedAt = new Date();
  await relationship.save();

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "DOCUMENT_RELATIONSHIP_APPROVED",
    resourceType: "DocumentRelationship",
    resourceId: relationshipId,
    metadata: {
      sourceDocumentId: relationship.sourceDocumentId.toString(),
      targetDocumentId: relationship.targetDocumentId.toString(),
      relationshipType: relationship.relationshipType,
      confidence: relationship.confidence,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return {
    id: relationship._id?.toString() || "",
    sourceDocumentId: relationship.sourceDocumentId.toString(),
    targetDocumentId: relationship.targetDocumentId.toString(),
    tenantId: relationship.tenantId.toString(),
    relationshipType: relationship.relationshipType as DocumentRelationshipView["relationshipType"],
    confidence: relationship.confidence,
    evidence: relationship.evidence as DocumentRelationshipView["evidence"],
    status: relationship.status as DocumentRelationshipView["status"],
    approvedBy: relationship.approvedBy?.toString() || null,
    approvedAt: relationship.approvedAt?.toISOString() || null,
    rejectionReason: relationship.rejectionReason,
    createdAt: relationship.createdAt.toISOString(),
    updatedAt: relationship.updatedAt.toISOString(),
  };
}

export async function rejectDocumentRelationship(
  tenantId: string,
  relationshipId: string,
  reason: string,
  inputContext: OperationAuthorizationContext,
): Promise<DocumentRelationshipView> {
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_QUALITY_REVIEW,
  );

  const relationship = await DocumentRelationshipModel.findOne({
    _id: new Types.ObjectId(relationshipId),
    tenantId: new Types.ObjectId(tenantId),
  });

  if (!relationship) {
    throw new AppError(404, REVIEW_NOT_FOUND, "Document relationship not found");
  }
  await getDocumentAccessAuthorizationService().authorizeDocumentsAction(
    { tenantId, actorId: inputContext.actorId },
    [relationship.sourceDocumentId.toString(), relationship.targetDocumentId.toString()], "update",
  );

  relationship.status = "rejected";
  relationship.rejectionReason = reason;
  await relationship.save();

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "DOCUMENT_RELATIONSHIP_REJECTED",
    resourceType: "DocumentRelationship",
    resourceId: relationshipId,
    metadata: {
      sourceDocumentId: relationship.sourceDocumentId.toString(),
      targetDocumentId: relationship.targetDocumentId.toString(),
      relationshipType: relationship.relationshipType,
      reason,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return {
    id: relationship._id?.toString() || "",
    sourceDocumentId: relationship.sourceDocumentId.toString(),
    targetDocumentId: relationship.targetDocumentId.toString(),
    tenantId: relationship.tenantId.toString(),
    relationshipType: relationship.relationshipType as DocumentRelationshipView["relationshipType"],
    confidence: relationship.confidence,
    evidence: relationship.evidence as DocumentRelationshipView["evidence"],
    status: relationship.status as DocumentRelationshipView["status"],
    approvedBy: relationship.approvedBy?.toString() || null,
    approvedAt: relationship.approvedAt?.toISOString() || null,
    rejectionReason: relationship.rejectionReason,
    createdAt: relationship.createdAt.toISOString(),
    updatedAt: relationship.updatedAt.toISOString(),
  };
}

export async function getConflictFindings(
  tenantId: string,
  documentId: string,
  inputContext: OperationAuthorizationContext,
): Promise<ConflictFindingView[]> {
  await authorizeDocumentPolicy(tenantId, documentId, inputContext, "read");
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_READ,
  );

  const conflicts = await ConflictFindingModel.find({
    tenantId: new Types.ObjectId(tenantId),
    $or: [
      { sourceDocumentId: new Types.ObjectId(documentId) },
      { targetDocumentId: new Types.ObjectId(documentId) },
    ],
  }).sort({ severity: 1, confidence: -1 });
  await getDocumentAccessAuthorizationService().authorizeDocumentsAction(
    { tenantId, actorId: inputContext.actorId },
    conflicts.flatMap((item) => [item.sourceDocumentId.toString(), item.targetDocumentId.toString()]), "read",
  );

  return conflicts.map((c) => ({
    id: c._id?.toString() || "",
    sourceDocumentId: c.sourceDocumentId.toString(),
    targetDocumentId: c.targetDocumentId.toString(),
    tenantId: c.tenantId.toString(),
    conflictType: c.conflictType as ConflictFindingView["conflictType"],
    severity: c.severity as ConflictFindingView["severity"],
    description: c.description,
    evidence: c.evidence as ConflictFindingView["evidence"],
    status: c.status as ConflictFindingView["status"],
    resolution: c.resolution as ConflictFindingView["resolution"],
    resolutionNotes: c.resolutionNotes,
    resolvedBy: c.resolvedBy?.toString() || null,
    resolvedAt: c.resolvedAt?.toISOString() || null,
    confidence: c.confidence,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function resolveConflictFinding(
  tenantId: string,
  conflictId: string,
  input: ResolveConflictInput,
  inputContext: OperationAuthorizationContext,
): Promise<ConflictFindingView> {
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_QUALITY_REVIEW,
  );

  const conflict = await ConflictFindingModel.findOne({
    _id: new Types.ObjectId(conflictId),
    tenantId: new Types.ObjectId(tenantId),
  });

  if (!conflict) {
    throw new AppError(404, REVIEW_NOT_FOUND, "Conflict finding not found");
  }
  await getDocumentAccessAuthorizationService().authorizeDocumentsAction(
    { tenantId, actorId: inputContext.actorId },
    [conflict.sourceDocumentId.toString(), conflict.targetDocumentId.toString()], "update",
  );

  conflict.status = "resolved";
  conflict.resolution = input.resolution;
  conflict.resolutionNotes = input.notes || null;
  conflict.resolvedBy = new Types.ObjectId(actor.actorId);
  conflict.resolvedAt = new Date();
  await conflict.save();

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "CONFLICT_FINDING_RESOLVED",
    resourceType: "ConflictFinding",
    resourceId: conflictId,
    metadata: {
      sourceDocumentId: conflict.sourceDocumentId.toString(),
      targetDocumentId: conflict.targetDocumentId.toString(),
      conflictType: conflict.conflictType,
      severity: conflict.severity,
      resolution: input.resolution,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return {
    id: conflict._id?.toString() || "",
    sourceDocumentId: conflict.sourceDocumentId.toString(),
    targetDocumentId: conflict.targetDocumentId.toString(),
    tenantId: conflict.tenantId.toString(),
    conflictType: conflict.conflictType as ConflictFindingView["conflictType"],
    severity: conflict.severity as ConflictFindingView["severity"],
    description: conflict.description,
    evidence: conflict.evidence as ConflictFindingView["evidence"],
    status: conflict.status as ConflictFindingView["status"],
    resolution: conflict.resolution as ConflictFindingView["resolution"],
    resolutionNotes: conflict.resolutionNotes,
    resolvedBy: conflict.resolvedBy?.toString() || null,
    resolvedAt: conflict.resolvedAt?.toISOString() || null,
    confidence: conflict.confidence,
    createdAt: conflict.createdAt.toISOString(),
    updatedAt: conflict.updatedAt.toISOString(),
  };
}

export async function dismissConflictFinding(
  tenantId: string,
  conflictId: string,
  reason: string,
  inputContext: OperationAuthorizationContext,
): Promise<ConflictFindingView> {
  const actor = await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_QUALITY_REVIEW,
  );

  const conflict = await ConflictFindingModel.findOne({
    _id: new Types.ObjectId(conflictId),
    tenantId: new Types.ObjectId(tenantId),
  });

  if (!conflict) {
    throw new AppError(404, REVIEW_NOT_FOUND, "Conflict finding not found");
  }
  await getDocumentAccessAuthorizationService().authorizeDocumentsAction(
    { tenantId, actorId: inputContext.actorId },
    [conflict.sourceDocumentId.toString(), conflict.targetDocumentId.toString()], "update",
  );

  conflict.status = "dismissed";
  conflict.resolutionNotes = reason;
  conflict.resolvedBy = new Types.ObjectId(actor.actorId);
  conflict.resolvedAt = new Date();
  await conflict.save();

  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "CONFLICT_FINDING_DISMISSED",
    resourceType: "ConflictFinding",
    resourceId: conflictId,
    metadata: {
      sourceDocumentId: conflict.sourceDocumentId.toString(),
      targetDocumentId: conflict.targetDocumentId.toString(),
      conflictType: conflict.conflictType,
      severity: conflict.severity,
      reason,
    },
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
  });

  return {
    id: conflict._id?.toString() || "",
    sourceDocumentId: conflict.sourceDocumentId.toString(),
    targetDocumentId: conflict.targetDocumentId.toString(),
    tenantId: conflict.tenantId.toString(),
    conflictType: conflict.conflictType as ConflictFindingView["conflictType"],
    severity: conflict.severity as ConflictFindingView["severity"],
    description: conflict.description,
    evidence: conflict.evidence as ConflictFindingView["evidence"],
    status: conflict.status as ConflictFindingView["status"],
    resolution: conflict.resolution as ConflictFindingView["resolution"],
    resolutionNotes: conflict.resolutionNotes,
    resolvedBy: conflict.resolvedBy?.toString() || null,
    resolvedAt: conflict.resolvedAt?.toISOString() || null,
    confidence: conflict.confidence,
    createdAt: conflict.createdAt.toISOString(),
    updatedAt: conflict.updatedAt.toISOString(),
  };
}

export async function getPendingReviewItems(
  tenantId: string,
  inputContext: OperationAuthorizationContext,
): Promise<{
  metadataCandidates: MetadataCandidateView[];
  relationships: DocumentRelationshipView[];
  conflicts: ConflictFindingView[];
}> {
  await authorizeProcessingOperation(
    tenantId,
    inputContext,
    Permission.DOCUMENTS_QUALITY_REVIEW,
  );

  const tenId = new Types.ObjectId(tenantId);

  const pendingCandidates = await MetadataCandidateModel.find({
    tenantId: tenId,
    status: "pending",
  })
    .sort({ confidence: -1 })
    .limit(50);

  const pendingRelationships = await DocumentRelationshipModel.find({
    tenantId: tenId,
    status: "pending",
  })
    .sort({ confidence: -1 })
    .limit(50);

  const pendingConflicts = await ConflictFindingModel.find({
    tenantId: tenId,
    status: { $in: ["detected", "reviewing"] },
  })
    .sort({ severity: 1, confidence: -1 })
    .limit(50);

  const visibleCandidates = [];
  for (const item of pendingCandidates) if (await canReadDocuments(tenantId, inputContext.actorId, [item.documentId.toString()])) visibleCandidates.push(item);
  const visibleRelationships = [];
  for (const item of pendingRelationships) if (await canReadDocuments(tenantId, inputContext.actorId, [item.sourceDocumentId.toString(), item.targetDocumentId.toString()])) visibleRelationships.push(item);
  const visibleConflicts = [];
  for (const item of pendingConflicts) if (await canReadDocuments(tenantId, inputContext.actorId, [item.sourceDocumentId.toString(), item.targetDocumentId.toString()])) visibleConflicts.push(item);

  return {
    metadataCandidates: visibleCandidates.map((c) => ({
      id: c._id?.toString() || "",
      documentId: c.documentId.toString(),
      tenantId: c.tenantId.toString(),
      documentVersion: c.documentVersion,
      fieldType: c.fieldType as MetadataCandidateView["fieldType"],
      proposedValue: c.proposedValue,
      confidence: c.confidence,
      evidence: c.evidence as MetadataCandidateView["evidence"],
      agentName: c.agentName,
      status: c.status as MetadataCandidateView["status"],
      reviewedBy: c.reviewedBy?.toString() || null,
      reviewedAt: c.reviewedAt?.toISOString() || null,
      rejectionReason: c.rejectionReason,
      appliedValue: c.appliedValue,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    relationships: visibleRelationships.map((r) => ({
      id: r._id?.toString() || "",
      sourceDocumentId: r.sourceDocumentId.toString(),
      targetDocumentId: r.targetDocumentId.toString(),
      tenantId: r.tenantId.toString(),
      relationshipType: r.relationshipType as DocumentRelationshipView["relationshipType"],
      confidence: r.confidence,
      evidence: r.evidence as DocumentRelationshipView["evidence"],
      status: r.status as DocumentRelationshipView["status"],
      approvedBy: r.approvedBy?.toString() || null,
      approvedAt: r.approvedAt?.toISOString() || null,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    conflicts: visibleConflicts.map((c) => ({
      id: c._id?.toString() || "",
      sourceDocumentId: c.sourceDocumentId.toString(),
      targetDocumentId: c.targetDocumentId.toString(),
      tenantId: c.tenantId.toString(),
      conflictType: c.conflictType as ConflictFindingView["conflictType"],
      severity: c.severity as ConflictFindingView["severity"],
      description: c.description,
      evidence: c.evidence as ConflictFindingView["evidence"],
      status: c.status as ConflictFindingView["status"],
      resolution: c.resolution as ConflictFindingView["resolution"],
      resolutionNotes: c.resolutionNotes,
      resolvedBy: c.resolvedBy?.toString() || null,
      resolvedAt: c.resolvedAt?.toISOString() || null,
      confidence: c.confidence,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
}
