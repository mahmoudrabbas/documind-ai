"use client";

import { Badge } from "@/components/ui";
import { codeLabel } from "@/lib/i18n/code-label";
import { useI18n } from "@/providers/i18n-provider";
import type { ProcessingRunStatus } from "@/types/api/processingProgress.types";

const STATUS_CONFIG: Record<ProcessingRunStatus, { badgeStatus: string; icon: string }> = {
  queued: { badgeStatus: "info", icon: "schedule" },
  running: { badgeStatus: "warning", icon: "play_circle" },
  paused: { badgeStatus: "warning", icon: "pause_circle" },
  completed: { badgeStatus: "success", icon: "check_circle" },
  failed: { badgeStatus: "error", icon: "error" },
  canceled: { badgeStatus: "neutral", icon: "cancel" },
};

interface ProcessingStatusBadgeProps {
  status: ProcessingRunStatus;
  className?: string;
}

export function ProcessingStatusBadge({ status, className }: ProcessingStatusBadgeProps) {
  const { t } = useI18n();
  const config = STATUS_CONFIG[status] ?? { badgeStatus: "neutral", icon: "help" };
  const labelText = codeLabel(t, "documents.processingStatus", status);

  return (
    <Badge status={config.badgeStatus} icon={config.icon} className={className} label={labelText} />
  );
}
