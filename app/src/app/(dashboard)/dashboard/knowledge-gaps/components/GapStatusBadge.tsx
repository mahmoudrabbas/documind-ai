"use client";

import type { GapStatus } from "@/types/api/knowledge-gaps.types";
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

interface GapStatusBadgeProps {
  status: GapStatus;
}

export function GapStatusBadge({ status }: GapStatusBadgeProps) {
  const { t } = useI18n();
  const styles: Record<GapStatus, string> = {
    open: "bg-error/10 text-error border-error/20",
    triaged: "bg-warning/10 text-warning border-warning/20",
    assigned: "bg-primary/10 text-primary border-primary/20",
    resolved: "bg-success/10 text-success border-success/20",
    dismissed: "bg-outline-variant/20 text-on-surface-variant border-outline-variant/30",
    reopened: "bg-secondary/10 text-secondary border-secondary/20",
  };

  const className = styles[status] || styles.open;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${className}`}
    >
      {codeLabel(t, "dashboard.gapStatus", status)}
    </span>
  );
}
