"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type NotificationActionItem = {
  key: string;
  label: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
};

export interface NotificationActionMenuProps {
  primaryAction?: NotificationActionItem | null;
  overflowActions?: readonly NotificationActionItem[];
  moreLabel: string;
  onActionTriggered?: () => void;
  compact?: boolean;
}

function actionClassName(destructive?: boolean) {
  return cn(
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-label-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
    destructive
      ? "text-error hover:bg-error-container"
      : "text-on-surface hover:bg-surface-container-high",
  );
}

export function NotificationActionMenu({
  primaryAction,
  overflowActions = [],
  moreLabel,
  onActionTriggered,
  compact = false,
}: NotificationActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hasOverflow = overflowActions.length > 0;
  const visiblePrimary = primaryAction ?? null;

  const visibleActions = useMemo(
    () => overflowActions.filter(Boolean),
    [overflowActions],
  );

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!visiblePrimary && !hasOverflow) return null;

  return (
    <div
      ref={rootRef}
      className={cn("flex items-center gap-2", compact && "gap-1.5")}
    >
      {visiblePrimary ? (
        visiblePrimary.href ? (
          <Link
            href={visiblePrimary.href}
            onClick={() => {
              onActionTriggered?.();
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-label-sm font-medium transition-colors",
              visiblePrimary.destructive
                ? "border-error/20 bg-error-container text-error hover:border-error/30 hover:bg-error-container/80"
                : "border-outline-variant/40 bg-surface-container-lowest text-primary hover:bg-primary/10",
            )}
          >
            {visiblePrimary.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              visiblePrimary.onClick?.();
              onActionTriggered?.();
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-label-sm font-medium transition-colors",
              visiblePrimary.destructive
                ? "border-error/20 bg-error-container text-error hover:border-error/30 hover:bg-error-container/80"
                : "border-outline-variant/40 bg-surface-container-lowest text-primary hover:bg-primary/10",
            )}
          >
            {visiblePrimary.label}
          </button>
        )
      ) : null}

      {hasOverflow ? (
        <div className="relative">
          <button
            type="button"
            aria-label={moreLabel}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span
              className="material-symbols-outlined text-[20px]"
              aria-hidden="true"
            >
              more_horiz
            </span>
          </button>

          {open ? (
            <div className="absolute end-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-xl border border-outline-variant bg-surface-bright shadow-lg">
              <div className="py-1">
                {visibleActions.map((action) =>
                  action.href ? (
                    <Link
                      key={action.key}
                      href={action.href}
                      onClick={() => {
                        setOpen(false);
                        onActionTriggered?.();
                      }}
                      className={actionClassName(action.destructive)}
                    >
                      {action.label}
                    </Link>
                  ) : (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        action.onClick?.();
                        onActionTriggered?.();
                      }}
                      className={actionClassName(action.destructive)}
                    >
                      {action.label}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
