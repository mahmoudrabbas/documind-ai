"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { getIndexStatus, retryIndexing, reindexDocument } from "@/services/processing.service";
import type {
  IndexGenerationView,
  GenerationStatus,
} from "@/types/api/processing.types";

const GENERATION_STATUS_MAP: Record<GenerationStatus, string> = {
  BUILDING: "warning",
  VERIFYING: "info",
  VERIFIED: "info",
  ACTIVE: "success",
  FAILED: "error",
  RETIRED: "neutral",
};

interface IndexingStatusCardProps {
  documentId: string;
  canUpdate: boolean;
}

export function IndexingStatusCard({
  documentId,
  canUpdate,
}: IndexingStatusCardProps) {
  const [generation, setGeneration] = useState<IndexGenerationView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getIndexStatus(documentId);
      setGeneration(res.data);
      setError(null);
    } catch {
      // keep previous generation if available
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-poll when generation is in progress
  useEffect(() => {
    if (generation?.status === "BUILDING" || generation?.status === "VERIFYING") {
      pollRef.current = setInterval(fetchStatus, 3000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [generation?.status, fetchStatus]);

  const handleRetry = useCallback(async () => {
    if (!canUpdate) return;
    setIsRetrying(true);
    setError(null);
    try {
      const res = await retryIndexing(documentId);
      setGeneration((prev: IndexGenerationView | null) =>
        prev
          ? { ...prev, status: res.status as GenerationStatus }
          : {
              generationId: res.generationId,
              documentId,
              documentVersion: 0,
              generationNumber: res.generationNumber,
              status: res.status as GenerationStatus,
              expectedChunkCount: 0,
              actualChunkCount: 0,
              expectedEmbeddingCount: 0,
              actualEmbeddingCount: 0,
              atlasIndexName: "",
              atlasIndexStatus: "",
              triggeredBy: "REINDEX",
              failureReason: null,
              activatedAt: null,
              createdAt: null,
            },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setIsRetrying(false);
    }
  }, [canUpdate, documentId]);

  const handleReindex = useCallback(async () => {
    if (!canUpdate) return;
    setIsReindexing(true);
    setError(null);
    try {
      const res = await reindexDocument(documentId);
      setGeneration((prev: IndexGenerationView | null) =>
        prev
          ? { ...prev, status: res.status as GenerationStatus }
          : {
              generationId: res.generationId,
              documentId,
              documentVersion: 0,
              generationNumber: res.generationNumber,
              status: res.status as GenerationStatus,
              expectedChunkCount: 0,
              actualChunkCount: 0,
              expectedEmbeddingCount: 0,
              actualEmbeddingCount: 0,
              atlasIndexName: "",
              atlasIndexStatus: "",
              triggeredBy: "REINDEX",
              failureReason: null,
              activatedAt: null,
              createdAt: null,
            },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reindex failed");
    } finally {
      setIsReindexing(false);
    }
  }, [canUpdate, documentId]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <Skeleton className="mt-3 h-10 w-full rounded-lg" />
        <Skeleton className="mt-2 h-6 w-3/4 rounded-lg" />
      </div>
    );
  }

  const isActive = generation?.status === "ACTIVE";
  const isFailed = generation?.status === "FAILED";
  const isProcessing = generation?.status === "BUILDING" || generation?.status === "VERIFYING";
  const canRetry = canUpdate && (isFailed || generation?.status === "RETIRED" || !generation);
  const canReindex = canUpdate && (isActive || isFailed);

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
          Search Index
        </h3>
        {canUpdate && (
          <div className="flex gap-2">
            {canRetry && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRetry}
                disabled={isRetrying || isProcessing}
                isLoading={isRetrying}
              >
                <span className="material-symbols-outlined me-1 text-[14px]">refresh</span>
                Retry
              </Button>
            )}
            {canReindex && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleReindex}
                disabled={isReindexing || isProcessing}
                isLoading={isReindexing}
              >
                <span className="material-symbols-outlined me-1 text-[14px]">replay</span>
                Reindex
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

      {!generation && !isProcessing ? (
        <div className="mt-3 text-center">
          <p className="text-sm text-on-surface-variant">No search index found for this document.</p>
          {canUpdate && (
            <p className="mt-2 text-xs text-on-surface-variant">
              The index will be created automatically when the document is uploaded.
            </p>
          )}
        </div>
      ) : generation ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <Badge status={GENERATION_STATUS_MAP[generation.status] as "success" | "warning" | "error" | "info" | "neutral" | undefined}>
              {generation.status}
            </Badge>
            <span className="text-xs text-on-surface-variant font-medium">
              Gen #{generation.generationNumber}
            </span>
            {generation.atlasIndexStatus && (
              <span className="text-xs text-on-surface-variant">
                Atlas: {generation.atlasIndexStatus}
              </span>
            )}
          </div>

          {(generation.expectedChunkCount > 0 || generation.actualChunkCount > 0) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-on-surface-variant">Chunks</p>
                <p className="font-medium text-on-surface">
                  {generation.actualChunkCount}
                  {generation.expectedChunkCount > 0 && (
                    <span className="text-on-surface-variant"> / {generation.expectedChunkCount}</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant">Embeddings</p>
                <p className="font-medium text-on-surface">
                  {generation.actualEmbeddingCount}
                  {generation.expectedEmbeddingCount > 0 && (
                    <span className="text-on-surface-variant"> / {generation.expectedEmbeddingCount}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {generation.failureReason && (
            <div className="rounded bg-error/10 p-2 text-xs text-error">
              <p className="font-bold">{generation.failureReason.stage}: {generation.failureReason.code}</p>
              <p className="mt-1">{generation.failureReason.message}</p>
            </div>
          )}

          {generation.activatedAt && (
            <p className="text-xs text-on-surface-variant">
              Active since {new Date(generation.activatedAt).toLocaleString()}
            </p>
          )}

          {isProcessing && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className="text-xs text-on-surface-variant">
                {generation.status === "BUILDING" ? "Building index..." : "Verifying index..."}
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
