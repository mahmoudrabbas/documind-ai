import { Types } from "mongoose";
import { randomUUID } from "node:crypto";
import DocumentModel from "../../db/models/document.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";
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
import type {
  TriggerOcrInput,
  ReviewQualityInput,
  RetryOcrInput,
  OcrPageResultView,
  DocumentQualityView,
} from "./processing.types.js";

export async function triggerOcrProcessing(
  tenantId: string,
  input: TriggerOcrInput,
  actorId: string,
): Promise<{ jobId: string; idempotencyKey: string }> {
  const tenId = new Types.ObjectId(tenantId);
  const docId = new Types.ObjectId(input.documentId);
  const actId = new Types.ObjectId(actorId);

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
): Promise<OcrPageResultView[]> {
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
): Promise<DocumentQualityView | null> {
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
): Promise<DocumentQualityView> {
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

  return getDocumentQuality(tenantId, documentId, documentVersion) as Promise<DocumentQualityView>;
}

export async function reviewDocumentQuality(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  input: ReviewQualityInput,
  reviewerId: string,
): Promise<DocumentQualityView> {
  const quality = await findDocumentQuality(tenantId, documentId, documentVersion);
  if (!quality) {
    throw new AppError(404, REVIEW_NOT_FOUND, "No quality assessment found for this document version");
  }

  await upsertDocumentQuality(tenantId, documentId, documentVersion, {
    reviewedBy: new Types.ObjectId(reviewerId),
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
    action: "QUALITY_REVIEWED",
    resourceType: "DocumentQuality",
    resourceId: quality._id?.toString() || documentId,
    metadata: {
      documentId,
      documentVersion,
      decision: input.decision,
      reviewerId,
      notes: input.notes || null,
      pageNumbers: input.pageNumbers || null,
    },
  });

  return getDocumentQuality(tenantId, documentId, documentVersion) as Promise<DocumentQualityView>;
}

export async function retryOcrPages(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  input: RetryOcrInput,
  actorId: string,
): Promise<{ jobId: string; idempotencyKey: string }> {
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
    actorId: new Types.ObjectId(actorId).toString(),
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
    action: "OCR_PAGES_RETRIED",
    resourceType: "Document",
    resourceId: docId.toString(),
    metadata: {
      documentId,
      documentVersion,
      pageNumbers: retryPages,
      retryCount: retryPages.length,
    },
  });

  return {
    jobId: enqueueResult.jobId || "",
    idempotencyKey,
  };
}

export async function getOcrUsageSummary(
  tenantId: string,
): Promise<{ pagesUsed: number; periodStart: string; periodEnd: string }> {
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
