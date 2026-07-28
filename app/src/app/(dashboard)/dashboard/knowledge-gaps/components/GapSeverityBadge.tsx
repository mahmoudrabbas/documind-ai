import type { GapSeverity } from "@/types/api/knowledge-gaps.types";

interface GapSeverityBadgeProps {
  severity: GapSeverity;
}

export function GapSeverityBadge({ severity }: GapSeverityBadgeProps) {
  const styles: Record<GapSeverity, { label: string; className: string }> = {
    low: {
      label: "Low",
      className: "bg-surface-container text-on-surface-variant border-outline-variant/30",
    },
    medium: {
      label: "Medium",
      className: "bg-info/10 text-info border-info/20",
    },
    high: {
      label: "High",
      className: "bg-warning/10 text-warning border-warning/20",
    },
    critical: {
      label: "Critical",
      className: "bg-error/10 text-error font-bold border-error/30",
    },
  };

  const config = styles[severity] || styles.medium;

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
