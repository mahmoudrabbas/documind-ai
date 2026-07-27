import type { ProcessingRunStatus, ProcessingStageName } from "../../db/models/processingRun.model.js";
import type { ProcessingStageStatus } from "../../db/models/processingStage.model.js";

export const PROCESSING_STAGES: readonly ProcessingStageName[] = [
  "security_scanning",
  "extraction",
  "ocr",
  "quality_review",
  "metadata_review",
  "chunking",
  "embedding",
  "indexing",
  "finalization",
] as const;

export const STAGE_ORDER: Record<ProcessingStageName, number> = {
  security_scanning: 0,
  extraction: 1,
  ocr: 2,
  quality_review: 3,
  metadata_review: 4,
  chunking: 5,
  embedding: 6,
  indexing: 7,
  finalization: 8,
};

export const STAGE_PROGRESS_WEIGHTS: Record<ProcessingStageName, number> = {
  security_scanning: 5,
  extraction: 20,
  ocr: 25,
  quality_review: 10,
  metadata_review: 5,
  chunking: 10,
  embedding: 10,
  indexing: 10,
  finalization: 5,
};

interface TransitionRule {
  from: ProcessingRunStatus[];
  to: ProcessingRunStatus;
}

export const RUN_TRANSITIONS: TransitionRule[] = [
  { from: ["queued"], to: "running" },
  { from: ["queued", "running"], to: "paused" },
  { from: ["queued", "running", "paused"], to: "canceled" },
  { from: ["running"], to: "completed" },
  { from: ["running", "paused"], to: "failed" },
  { from: ["failed", "canceled"], to: "queued" },
];

interface StageTransitionRule {
  from: ProcessingStageStatus[];
  to: ProcessingStageStatus;
}

export const STAGE_TRANSITIONS: StageTransitionRule[] = [
  { from: ["pending"], to: "running" },
  { from: ["running"], to: "completed" },
  { from: ["running"], to: "failed" },
  { from: ["running", "pending"], to: "canceled" },
  { from: ["pending", "failed"], to: "skipped" },
];

export function isValidRunTransition(
  from: ProcessingRunStatus,
  to: ProcessingRunStatus,
): boolean {
  return RUN_TRANSITIONS.some((rule) => rule.from.includes(from) && rule.to === to);
}

export function isValidStageTransition(
  from: ProcessingStageStatus,
  to: ProcessingStageStatus,
): boolean {
  return STAGE_TRANSITIONS.some((rule) => rule.from.includes(from) && rule.to === to);
}

export function getNextStage(currentStage: ProcessingStageName | null): ProcessingStageName | null {
  if (!currentStage) return PROCESSING_STAGES[0];
  const currentOrder = STAGE_ORDER[currentStage];
  for (const stage of PROCESSING_STAGES) {
    if (STAGE_ORDER[stage] === currentOrder + 1) return stage;
  }
  return null;
}

export function getStageProgress(
  stageName: ProcessingStageName,
  stageProgress: number,
): number {
  const weight = STAGE_PROGRESS_WEIGHTS[stageName];
  return Math.round((stageProgress / 100) * weight);
}

export function computeOverallProgress(
  completedStages: ProcessingStageName[],
  currentStage: ProcessingStageName | null,
  currentStageProgress: number,
): number {
  let total = 0;
  for (const stage of completedStages) {
    total += STAGE_PROGRESS_WEIGHTS[stage];
  }
  if (currentStage) {
    total += getStageProgress(currentStage, currentStageProgress);
  }
  return Math.min(100, Math.max(0, total));
}

export function getSafeErrorInfo(
  errorCode: string | null,
  errorMessage: string | null,
): { title: string; description: string; retryable: boolean } {
  if (!errorCode) {
    return {
      title: "Processing error",
      description: errorMessage || "An unknown error occurred during processing.",
      retryable: true,
    };
  }

  const errorMap: Record<string, { title: string; description: string; retryable: boolean }> = {
    extraction_failed: {
      title: "Text extraction failed",
      description: "The document could not be parsed. The file may be corrupted or in an unsupported format.",
      retryable: true,
    },
    ocr_failed: {
      title: "OCR processing failed",
      description: "Text recognition could not complete. Some pages may be unreadable.",
      retryable: true,
    },
    ocr_timeout: {
      title: "OCR timed out",
      description: "The OCR service took too long to respond. This may be due to large documents.",
      retryable: true,
    },
    quality_review_required: {
      title: "Quality review required",
      description: "The document has quality issues that require human review.",
      retryable: false,
    },
    encrypted_document: {
      title: "Encrypted document",
      description: "This document is encrypted and cannot be processed.",
      retryable: false,
    },
    unsupported_format: {
      title: "Unsupported format",
      description: "This file format is not supported for processing.",
      retryable: false,
    },
    file_not_found: {
      title: "File not found",
      description: "The source file could not be located. It may have been moved or deleted.",
      retryable: false,
    },
    quota_exceeded: {
      title: "Quota exceeded",
      description: "The processing quota for this account has been reached.",
      retryable: false,
    },
    resource_limit: {
      title: "Resource limit reached",
      description: "The system could not allocate enough resources to process this document.",
      retryable: true,
    },
  };

  return errorMap[errorCode] || {
    title: "Processing error",
    description: errorMessage || "An unexpected error occurred.",
    retryable: true,
  };
}
