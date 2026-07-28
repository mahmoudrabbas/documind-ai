import type { GapStatus } from "@/types/api/knowledge-gaps.types";

interface GapStatusBadgeProps {
  status: GapStatus;
}

export function GapStatusBadge({ status }: GapStatusBadgeProps) {
  const styles: Record<GapStatus, { label: string; className: string }> = {
    open: {
      label: "Open",
      className: "bg-error/10 text-error border-error/20",
    },
    triaged: {
      label: "Triaged",
      className: "bg-warning/10 text-warning border-warning/20",
    },
    assigned: {
      label: "Assigned",
      className: "bg-primary/10 text-primary border-primary/20",
    },
    resolved: {
      label: "Resolved",
      className: "bg-success/10 text-success border-success/20",
    },
    dismissed: {
      label: "Dismissed",
      className: "bg-outline-variant/20 text-on-surface-variant border-outline-variant/30",
    },
    reopened: {
      label: "Reopened",
      className: "bg-secondary/10 text-secondary border-secondary/20",
    },
  };

  const config = styles[status] || styles.open;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${config.className}`}
    >
      {config.label}
    </span>
  );
}
