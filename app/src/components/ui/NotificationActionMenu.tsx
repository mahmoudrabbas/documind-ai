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
  icon?: string;
};

export interface NotificationActionMenuProps {
  primaryAction?: NotificationActionItem | null;
  overflowActions?: readonly NotificationActionItem[];
  moreLabel: string;
  onActionTriggered?: () => void;
  compact?: boolean;
  className?: string;
}

function actionClassName(destructive?: boolean) {
  return cn(
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-label-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
    destructive
      ? "text-error hover:bg-error-container/60 active:bg-error-container"
      : "text-on-surface hover:bg-surface-container-high active:bg-surface-container-highest",
  );
}

export function NotificationActionMenu({
  primaryAction,
  overflowActions = [],
  moreLabel,
  onActionTriggered,
  compact = false,
  className,
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
      className={cn(
        "flex w-full items-center",
        visiblePrimary ? "justify-between" : "justify-end",
        compact ? "gap-1.5" : "gap-2",
        open ? "relative z-30" : "relative",
        className,
      )}
    >
      {visiblePrimary ? (
        visiblePrimary.href ? (
          <Link
            href={visiblePrimary.href}
            onClick={(e) => {
              e.stopPropagation();
              onActionTriggered?.();
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-label-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              visiblePrimary.destructive
                ? "border-error/20 bg-error-container text-error hover:border-error/30 hover:bg-error-container/80"
                : "border-primary/20 bg-primary/5 text-primary hover:border-primary/40 hover:bg-primary/10",
            )}
          >
            {visiblePrimary.icon ? (
              <span
                className="material-symbols-outlined text-[16px] shrink-0"
                aria-hidden="true"
              >
                {visiblePrimary.icon}
              </span>
            ) : null}
            <span>{visiblePrimary.label}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              visiblePrimary.onClick?.();
              onActionTriggered?.();
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-label-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              visiblePrimary.destructive
                ? "border-error/20 bg-error-container text-error hover:border-error/30 hover:bg-error-container/80"
                : "border-primary/20 bg-primary/5 text-primary hover:border-primary/40 hover:bg-primary/10",
            )}
          >
            {visiblePrimary.icon ? (
              <span
                className="material-symbols-outlined text-[16px] shrink-0"
                aria-hidden="true"
              >
                {visiblePrimary.icon}
              </span>
            ) : null}
            <span>{visiblePrimary.label}</span>
          </button>
        )
      ) : null}

      {hasOverflow ? (
        <div className="relative">
          <button
            type="button"
            aria-label={moreLabel}
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((value) => !value);
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              open
                ? "bg-surface-container-highest text-on-surface shadow-sm"
                : "text-on-surface-variant/80 hover:bg-surface-container-high hover:text-on-surface",
            )}
          >
            <span
              className="material-symbols-outlined text-[20px] select-none"
              aria-hidden="true"
            >
              more_horiz
            </span>
          </button>

          {open ? (
            <div
              aria-label={moreLabel}
              className="absolute end-0 top-full z-40 mt-1.5 min-w-[11rem] overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-bright p-1 shadow-xl ring-1 ring-black/5 backdrop-blur-md"
            >
              <div className="space-y-0.5">
                {visibleActions.map((action) => {
                  const content = (
                    <>
                      {action.icon ? (
                        <span
                          className={cn(
                            "material-symbols-outlined text-[18px] shrink-0",
                            action.destructive
                              ? "text-error"
                              : "text-on-surface-variant",
                          )}
                          aria-hidden="true"
                        >
                          {action.icon}
                        </span>
                      ) : null}
                      <span className="flex-1 truncate">{action.label}</span>
                    </>
                  );

                  return action.href ? (
                    <Link
                      key={action.key}
                      href={action.href}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(false);
                        onActionTriggered?.();
                      }}
                      className={actionClassName(action.destructive)}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      key={action.key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(false);
                        action.onClick?.();
                        onActionTriggered?.();
                      }}
                      className={actionClassName(action.destructive)}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
