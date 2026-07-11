import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Small label-style tag, e.g. "OPTIMAL", "+12%", "Daily Avg: 840". */
  tag?: ReactNode;
  /** Trend direction for `tag`'s color; omit for a neutral tag. */
  trend?: "up" | "down" | "neutral";
  icon?: ReactNode;
  className?: string;
}

const TREND_CLASSES: Record<NonNullable<StatCardProps["trend"]>, string> = {
  up: "bg-tertiary-container text-on-tertiary-container",
  down: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

/** KPI tile used across Overview / Analytics dashboards. */
export function StatCard({
  label,
  value,
  tag,
  trend = "neutral",
  icon,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("flex min-h-0 flex-col gap-3 p-4 lg:p-5", className)}>
      <div className="flex items-start justify-between">
        {icon ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-container-high text-on-surface">
            {icon}
          </span>
        ) : (
          <span />
        )}
        {tag ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-label-sm",
              TREND_CLASSES[trend],
            )}
          >
            {tag}
          </span>
        ) : null}
      </div>
      <div>
        <p className="text-body-sm text-on-surface-variant">{label}</p>
        <p className="mt-1 text-headline-md text-on-surface">{value}</p>
      </div>
    </Card>
  );
}
