"use client";

import type { GapSeverity } from "@/types/api/knowledge-gaps.types";
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

interface GapSeverityBadgeProps {
  severity: GapSeverity;
}

export function GapSeverityBadge({ severity }: GapSeverityBadgeProps) {
  const { t } = useI18n();
  const styles: Record<GapSeverity, string> = {
    low: "bg-surface-container text-on-surface-variant border-outline-variant/30",
    medium: "bg-info/10 text-info border-info/20",
    high: "bg-warning/10 text-warning border-warning/20",
    critical: "bg-error/10 text-error font-bold border-error/30",
  };

  const className = styles[severity] || styles.medium;

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {codeLabel(t, "dashboard.gapSeverity", severity)}
    </span>
  );
}
