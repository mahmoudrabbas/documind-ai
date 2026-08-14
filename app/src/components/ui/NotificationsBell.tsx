"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/providers/i18n-provider";
import { useNotificationFeed } from "@/hooks/features/useNotificationFeed";
import { useNotificationSocket } from "@/hooks/features/useNotificationSocket";
import { useUnreadCount } from "@/hooks/features/useUnreadCount";
import {
  archive as archiveNotification,
  markSeenAll,
  softDelete,
} from "@/services/notifications.service";
import {
  localizeNotification,
  notificationsBadgeColor,
  resolveNotificationActionHref,
} from "@/lib/notification-utils";
import type {
  Notification,
  NotificationPriority,
} from "@/types/api/notifications.types";

const NOTIFICATIONS_LIMIT = 20;

const PRIORITY_DOT_CLASSES: Record<NotificationPriority, string> = {
  critical: "bg-error",
  high: "bg-warning",
  normal: "bg-info",
  low: "bg-on-surface-variant",
};

/**
 * NotificationsBell — bell icon with an unread badge whose color derives from
 * the highest unread priority (GET /notifications/unread-count byPriority),
 * plus a dropdown showing the latest 20 notifications. Opening the dropdown
 * marks everything as seen; clicking an item marks it read optimistically;
 * each item exposes Archive / Clear (soft delete) actions.
 */
export function NotificationsBell() {
  const { t, locale } = useI18n();
  const auth = useAuth();
  const unread = useUnreadCount();
  const feed = useNotificationFeed();
  // Phase-2 real-time refresh: socket pushes refresh the unread count and the
  // feed instantly; the 30s poll in useUnreadCount remains as the fallback.
  const refreshUnreadAndFeed = () => {
    void unread.refresh();
    void feed.refresh();
  };
  useNotificationSocket({
    onNotificationCreated: refreshUnreadAndFeed,
    onNotificationUpdated: refreshUnreadAndFeed,
  });
  const [open, setOpen] = useState(false);
  const [removedIds, setRemovedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const isAuthenticated = auth.status === "authenticated";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && isAuthenticated) {
      void markSeenAll().catch(() => undefined);
      void feed.load(1, { limit: NOTIFICATIONS_LIMIT });
    }
  }

  async function handleItemClick(item: Notification) {
    if (!item.isRead) {
      await feed.markRead(item.id);
      void unread.refresh();
    }
    setOpen(false);
  }

  async function handleArchive(item: Notification) {
    setRemovedIds((prev) => new Set(prev).add(item.id));
    try {
      await archiveNotification(item.id);
    } catch {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } finally {
      void feed.refresh();
      void unread.refresh();
    }
  }

  async function handleClear(item: Notification) {
    setRemovedIds((prev) => new Set(prev).add(item.id));
    try {
      await softDelete(item.id);
    } catch {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } finally {
      void feed.refresh();
      void unread.refresh();
    }
  }

  if (!isAuthenticated) return null;

  const badgeClass = notificationsBadgeColor(unread.byPriority);
  const visibleItems = feed.items.filter(
    (item) => !removedIds.has(item.id),
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => void handleToggle()}
        aria-label={t("notifications.title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
      >
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          notifications
        </span>
        {unread.count > 0 && badgeClass ? (
          <span
            data-testid="unread-badge"
            className={`absolute end-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-on-primary ${badgeClass}`}
          >
            {unread.count > 99 ? "99+" : unread.count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("notifications.title")}
          className="absolute end-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-outline-variant bg-surface-bright shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <p className="text-label-md font-bold text-on-surface">
              {t("notifications.title")}
            </p>
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="text-label-sm font-medium text-primary hover:underline"
            >
              {t("notifications.viewAll")}
            </Link>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {feed.isLoading && visibleItems.length === 0 ? (
              <p
                role="status"
                className="px-4 py-8 text-center text-body-sm text-on-surface-variant"
              >
                {t("common.loading")}
              </p>
            ) : visibleItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-body-sm text-on-surface-variant">
                {t("notifications.empty")}
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant">
                {visibleItems.slice(0, NOTIFICATIONS_LIMIT).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handleItemClick(item)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-surface-container-low"
                    >
                      {!item.isRead ? (
                        <span
                          aria-hidden="true"
                          data-testid="unread-dot"
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT_CLASSES[item.priority]}`}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-label-md font-semibold ${
                            item.isRead
                              ? "text-on-surface-variant"
                              : "text-on-surface"
                          }`}
                        >
                          {localizeNotification(item.title, locale)}
                        </span>
                        <span className="block text-body-sm text-on-surface-variant">
                          {localizeNotification(item.body, locale)}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 px-4 pb-3 ps-8">
                      {item.actions.map((action, index) => (
                        <Link
                          key={`${action.url}-${index}`}
                          href={resolveNotificationActionHref(action.url)}
                          onClick={() => setOpen(false)}
                          className="rounded-md px-2 py-1 text-label-sm font-medium text-primary hover:bg-primary/10"
                        >
                          {localizeNotification(action.label, locale)}
                        </Link>
                      ))}
                      <button
                        type="button"
                        onClick={() => void handleArchive(item)}
                        className="rounded-md px-2 py-1 text-label-sm font-medium text-on-surface-variant hover:bg-surface-container-high"
                      >
                        {t("notifications.archive")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleClear(item)}
                        className="rounded-md px-2 py-1 text-label-sm font-medium text-error hover:bg-error-container"
                      >
                        {t("notifications.clear")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
