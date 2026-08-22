"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { computeMenuPlacement, type MenuPlacement } from "@/lib/menu-placement";

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

/**
 * Marks the portaled dropdown in the DOM.
 *
 * The menu renders into `document.body`, so it is not a DOM descendant of
 * whatever opened it. An ancestor component with its own outside-click handler
 * (the notifications bell popover) would therefore read a pointer down on a menu
 * item as a click outside itself and unmount the item before its click handler
 * could run. Such handlers call `isInsideNotificationActionMenu` alongside their
 * own containment check.
 */
export const NOTIFICATION_ACTION_MENU_SELECTOR =
  "[data-notification-action-menu]";

/** True when `target` sits inside an open, portaled notification action menu. */
export function isInsideNotificationActionMenu(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(NOTIFICATION_ACTION_MENU_SELECTOR) !== null;
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
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasOverflow = overflowActions.length > 0;
  const visiblePrimary = primaryAction ?? null;

  const visibleActions = useMemo(
    () => overflowActions.filter(Boolean),
    [overflowActions],
  );

  /**
   * Measure the trigger and the (already mounted, still invisible) menu, then
   * position the menu against the viewport. Direction is read from the document
   * element, which `I18nProvider` keeps in sync with the active locale — that
   * keeps this component usable without an i18n provider around it.
   */
  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const triggerBox = trigger.getBoundingClientRect();
    const menuBox = menu.getBoundingClientRect();
    const next = computeMenuPlacement(
      {
        top: triggerBox.top,
        left: triggerBox.left,
        width: triggerBox.width,
        height: triggerBox.height,
      },
      { width: menuBox.width, height: menuBox.height },
      { width: window.innerWidth, height: window.innerHeight },
      document.documentElement.dir === "rtl" ? "rtl" : "ltr",
    );
    // Preserve identity when nothing moved, otherwise each measurement would
    // schedule a render that measures again.
    setPlacement((prev) =>
      prev &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.side === next.side
        ? prev
        : next,
    );
  }, []);

  useEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    measure();
    // The menu is fixed-positioned, so anything that moves the trigger has to
    // re-position it. Scroll is captured because the trigger sits inside the
    // bell's own scrolling list and scroll does not bubble.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && menuRef.current) {
      // Action labels differ per notification, so the menu box is not a
      // constant; re-measure when its own size changes.
      observer = new ResizeObserver(() => measure());
      observer.observe(menuRef.current);
    }
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      // The menu is portaled to document.body, so it is not inside rootRef.
      // Without this check a pointer down on a menu item would close the menu
      // and unmount the item before its click handler could run.
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
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

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={moreLabel}
      data-notification-action-menu=""
      style={{ top: placement?.top ?? 0, left: placement?.left ?? 0 }}
      className={cn(
        // Fixed + portaled so no clipping ancestor can cut the menu off; see
        // lib/menu-placement.ts for why z-index could not fix this. Hidden
        // until measured so the pre-placement frame at (0, 0) never paints.
        "fixed z-[60] min-w-[11rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-bright p-1 shadow-xl ring-1 ring-black/5 backdrop-blur-md",
        placement ? "visible" : "invisible",
      )}
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
              role="menuitem"
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
              role="menuitem"
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
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex w-full items-center",
        visiblePrimary ? "justify-between" : "justify-end",
        compact ? "gap-1.5" : "gap-2",
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
            ref={triggerRef}
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

          {open && typeof document !== "undefined"
            ? createPortal(menu, document.body)
            : null}
        </div>
      ) : null}
    </div>
  );
}
