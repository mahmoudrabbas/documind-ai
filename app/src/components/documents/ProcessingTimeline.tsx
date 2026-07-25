"use client";

import { ProgressBar } from "@/components/ui";
import { cn } from "@/lib/utils";
import type {
  ProcessingRunView,
  ProcessingStageView,
  ProcessingStageStatus,
} from "@/types/api/processingProgress.types";

const STAGE_LABELS: Record<string, string> = {
  security_scanning: "Security Scan",
  extraction: "Text Extraction",
  ocr: "OCR",
  quality_review: "Quality Review",
  metadata_review: "Metadata Review",
  chunking: "Chunking",
  embedding: "Embedding",
  indexing: "Indexing",
  finalization: "Finalization",
};

const STAGE_ICONS: Record<string, string> = {
  security_scanning: "shield",
  extraction: "description",
  ocr: "document_scanner",
  quality_review: "verified",
  metadata_review: "info",
  chunking: "view_agenda",
  embedding: "model_training",
  indexing: "search",
  finalization: "check_circle",
};

const STATUS_STYLES: Record<ProcessingStageStatus, string> = {
  pending: "text-slate-400",
  running: "text-amber-600",
  completed: "text-green-600",
  failed: "text-red-600",
  skipped: "text-slate-300",
  canceled: "text-slate-400",
};

function formatDuration(durationMs: number | null): string | null {
  if (!durationMs) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

interface StageRowProps {
  stage: ProcessingStageView;
  isCurrent: boolean;
}

function StageRow({ stage, isCurrent }: StageRowProps) {
  const label = STAGE_LABELS[stage.stageName] ?? stage.stageName;
  const iconName = STAGE_ICONS[stage.stageName] ?? "circle";

  return (
    <div className={cn("flex items-start gap-3 py-2.5", isCurrent && "font-medium")}>
      <div className="relative flex flex-col items-center pt-1">
        <span
          className={cn(
            "material-symbols-outlined text-[18px]",
            STATUS_STYLES[stage.status],
          )}
        >
          {stage.status === "completed"
            ? "check_circle"
            : stage.status === "failed"
              ? "error"
              : stage.status === "running"
                ? "pending"
                : stage.status === "skipped"
                  ? "skip_next"
                  : iconName}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-700">{label}</span>
          {stage.attempt > 1 && (
            <span className="text-xs text-slate-400">(attempt {stage.attempt})</span>
          )}
        </div>

        {stage.status === "running" && stage.progress != null && (
          <ProgressBar
            value={stage.progress}
            showPercentage
            size="sm"
            className="mt-1 max-w-[200px]"
          />
        )}

        {stage.status === "failed" && stage.errorMessage && (
          <p className="mt-0.5 text-xs text-red-500 truncate">{stage.errorMessage}</p>
        )}

        {stage.completedAt && stage.durationMs && (
          <p className="mt-0.5 text-xs text-slate-400">
            {formatDuration(stage.durationMs)}
          </p>
        )}
      </div>
    </div>
  );
}

interface ProcessingTimelineProps {
  run: ProcessingRunView;
  className?: string;
}

export function ProcessingTimeline({ run, className }: ProcessingTimelineProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3">
        <ProgressBar
          value={run.progress}
          showPercentage
          size="md"
          label={`Overall progress — stage: ${run.currentStage ? (STAGE_LABELS[run.currentStage] ?? run.currentStage) : "—"}`}
        />
      </div>

      <div className="divide-y divide-slate-100">
        {run.stages.map((stage) => (
          <StageRow
            key={stage.stageName}
            stage={stage}
            isCurrent={stage.stageName === run.currentStage}
          />
        ))}
      </div>

      {run.durationMs != null && (
        <p className="mt-3 text-xs text-slate-400">
          Total duration: {formatDuration(run.durationMs)}
        </p>
      )}
    </div>
  );
}
