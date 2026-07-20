"use client";

import { cn } from "@/lib/utils";

interface ImportErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
  className?: string;
}

export function ImportErrorBanner({
  message,
  onDismiss,
  className,
}: ImportErrorBannerProps) {
  if (!message) return null;

  return (
    <div
      className={cn(
        "mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900",
        className,
      )}
      role="alert"
    >
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-red-500">
        warning
      </span>
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-red-500 transition-colors hover:bg-red-100"
          aria-label="Dismiss error"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      )}
    </div>
  );
}
