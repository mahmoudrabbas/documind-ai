"use client";

import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  size = "md",
  className,
}: ProgressBarProps) {
  const percent = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div className={cn("w-full", className)}>
      {(label || showPercentage) && (
        <div className="mb-1.5 flex items-center justify-between">
          {label ? (
            <span className="text-sm font-medium text-slate-700">{label}</span>
          ) : (
            <span />
          )}
          {showPercentage && (
            <span className="text-sm text-slate-500">{percent}%</span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? "Progress"}
        className={cn(
          "w-full overflow-hidden rounded-full bg-slate-200",
          SIZE_CLASSES[size],
        )}
      >
        <div
          className={cn(
            "h-full rounded-full bg-blue-600 transition-all duration-300 ease-out",
            percent >= 100 && "bg-green-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
