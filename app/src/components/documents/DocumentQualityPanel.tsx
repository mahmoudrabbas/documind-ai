"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useOcr } from "@/hooks/features/useOcr";
import type { OcrPageResultView, QualityStatus } from "@/types/api/processing.types";

const QUALITY_STATUS_MAP: Record<QualityStatus, string> = {
  READY: "success",
  READY_WITH_WARNINGS: "warning",
  REVIEW_REQUIRED: "error",
  FAILED: "error",
};

const OCR_STATUS_MAP: Record<string, string> = {
  pending: "info",
  processing: "warning",
  completed: "success",
  failed: "error",
  retry: "warning",
};

interface DocumentQualityPanelProps {
  documentId: string;
  documentVersion: number;
  canProcessOcr: boolean;
  canReviewQuality: boolean;
}

export function DocumentQualityPanel({
  documentId,
  documentVersion,
  canProcessOcr,
  canReviewQuality,
}: DocumentQualityPanelProps) {
  const {
    ocrPages,
    quality,
    isLoadingOcrPages,
    isLoadingQuality,
    isTriggeringOcr,
    isRetryingOcr,
    isReviewing,
    error,
    triggerOcr,
    retryOcr,
    refreshOcrPages,
    refreshQuality,
    reviewQuality,
  } = useOcr();

  const [reviewNotes, setReviewNotes] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);

  useEffect(() => {
    refreshOcrPages(documentId, documentVersion);
    refreshQuality(documentId, documentVersion);
  }, [documentId, documentVersion, refreshOcrPages, refreshQuality]);

  const handleTriggerOcr = useCallback(async () => {
    if (!canProcessOcr) return;
    await triggerOcr(documentId, { version: documentVersion });
  }, [canProcessOcr, documentId, documentVersion, triggerOcr]);

  const handleRetryOcr = useCallback(async () => {
    if (!canProcessOcr) return;
    await retryOcr(documentId, { version: documentVersion });
  }, [canProcessOcr, documentId, documentVersion, retryOcr]);

  const handleReview = useCallback(async (decision: "approved" | "rejected" | "retry") => {
    if (!canReviewQuality) return;
    await reviewQuality(documentId, decision, {
      version: documentVersion,
      notes: reviewNotes || undefined,
    });
    setShowReviewForm(false);
    setReviewNotes("");
  }, [canReviewQuality, documentId, documentVersion, reviewNotes, reviewQuality]);

  const isLoading = isLoadingOcrPages || isLoadingQuality;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <Skeleton className="mt-3 h-10 w-full rounded-lg" />
        <Skeleton className="mt-2 h-20 w-full rounded-lg" />
      </div>
    );
  }

  const hasOcrPages = ocrPages.length > 0;
  const hasQuality = quality !== null;

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
          Document Quality & OCR
        </h3>
        {canProcessOcr && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleTriggerOcr}
              disabled={isTriggeringOcr}
              isLoading={isTriggeringOcr}
            >
              <span className="material-symbols-outlined me-1 text-[14px]">document_scanner</span>
              Run OCR
            </Button>
            {hasOcrPages && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRetryOcr}
                disabled={isRetryingOcr}
                isLoading={isRetryingOcr}
              >
                <span className="material-symbols-outlined me-1 text-[14px]">refresh</span>
                Retry
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded bg-error/10 p-2 text-xs text-error">
          {error}
        </div>
      )}

      {hasQuality && quality && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <Badge status={QUALITY_STATUS_MAP[quality.qualityStatus] as "success" | "warning" | "error" | undefined}>
              {quality.qualityStatus}
            </Badge>
            <span className="text-xs text-on-surface-variant font-medium">
              {Math.round(quality.overallConfidence * 100)}% confidence
            </span>
            {quality.requiresReview && (
              <Badge status="error">Review Required</Badge>
            )}
          </div>

          <p className="text-xs text-on-surface-variant">{quality.summary}</p>

          {quality.issues.length > 0 && (
            <div className="rounded bg-warning/10 p-2 text-xs text-warning">
              <p className="font-bold">Issues:</p>
              <ul className="list-disc ps-4 space-y-1">
                {quality.issues.map((issue, idx) => (
                  <li key={idx}>
                    <span className="font-medium">[{issue.severity}]</span> Page {issue.pageNumber}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quality.reviewDecision && (
            <div className="rounded bg-info/10 p-2 text-xs text-info">
              <p className="font-bold">Review Decision: {quality.reviewDecision}</p>
              {quality.reviewNotes && <p className="mt-1">{quality.reviewNotes}</p>}
            </div>
          )}

          {canReviewQuality && quality.requiresReview && !showReviewForm && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowReviewForm(true)}
            >
              <span className="material-symbols-outlined me-1 text-[14px]">rate_review</span>
              Review Quality
            </Button>
          )}

          {showReviewForm && (
            <div className="space-y-3 rounded border border-outline-variant/30 bg-surface p-3">
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add review notes (optional)"
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleReview("approved")}
                  disabled={isReviewing}
                  isLoading={isReviewing}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleReview("rejected")}
                  disabled={isReviewing}
                  isLoading={isReviewing}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleReview("retry")}
                  disabled={isReviewing}
                  isLoading={isReviewing}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowReviewForm(false); setReviewNotes(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!hasQuality && !hasOcrPages && (
        <div className="mt-3 text-center">
          <p className="text-sm text-on-surface-variant">No OCR processing or quality assessment yet.</p>
          {canProcessOcr && (
            <p className="mt-2 text-xs text-on-surface-variant">
              Click &quot;Run OCR&quot; to process this document and assess its quality.
            </p>
          )}
        </div>
      )}

      {hasOcrPages && (
        <div className="mt-3 space-y-2">
          <h4 className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
            Page Results
          </h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {ocrPages.map((page) => (
              <OcrPageRow key={page.id} page={page} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OcrPageRow({ page }: { page: OcrPageResultView }) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const confidencePercent = Math.round(page.confidence * 100);
  const statusBadge = OCR_STATUS_MAP[page.status] || "neutral";
  const previewLength = 150;
  const hasPreview = page.text && page.text.length > 0;
  const isTruncated = hasPreview && page.text.length > previewLength;
  const previewText = isTruncated ? page.text.slice(0, previewLength) + "..." : page.text;
  const wordCount = page.text ? page.text.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-on-surface">Page {page.pageNumber}</span>
          <Badge status={statusBadge}>{page.status}</Badge>
          <span className="text-xs text-on-surface-variant">{confidencePercent}%</span>
          <span className="text-xs text-on-surface-variant">{page.text.length} chars</span>
          <span className="text-xs text-on-surface-variant">{wordCount} words</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant">{page.provider}</span>
          {page.failureReason && (
            <span className="text-xs text-error max-w-32 truncate">{page.failureReason}</span>
          )}
        </div>
      </div>
      {hasPreview && (
        <div className="mt-2">
          <div
            ref={textRef}
            className={`text-xs text-on-surface-variant/80 bg-surface-container-low rounded p-2 font-mono whitespace-pre-wrap break-words ${expanded ? "" : "max-h-20 overflow-hidden"}`}
          >
            {expanded ? page.text : previewText}
          </div>
          {isTruncated && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs font-medium text-primary hover:text-primary/80"
            >
              {expanded ? "Show less" : "Show full text"}
            </button>
          )}
        </div>
      )}
      {!hasPreview && page.status === "completed" && (
        <p className="mt-2 text-xs text-on-surface-variant/50 italic">No text extracted</p>
      )}
    </div>
  );
}
