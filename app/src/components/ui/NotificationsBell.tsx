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
import { getRelativeTimeParts } from "@/lib/utils";
import { NotificationActionMenu } from "./NotificationActionMenu";
import type {
  Notification,
  NotificationPriority,
  NotificationType,
} from "@/types/api/notifications.types";

const NOTIFICATIONS_LIMIT = 20;

const PRIORITY_DOT_CLASSES: Record<NotificationPriority, string> = {
  critical: "bg-error",
  high: "bg-warning",
  normal: "bg-info",
  low: "bg-on-surface-variant",
};

const NOTIFICATION_TYPE_ICONS: Partial<Record<NotificationType, string>> = {
  processing_complete: "check_circle",
  processing_failed: "error",
  quota_exceeded: "warning",
  knowledge_gap_created: "search_insights",
  invitation_accepted: "person_check",
  welcome: "celebration",
  role_changed: "group",
  document_uploaded: "description",
};

function formatNotificationTime(
  iso: string,
  t: (key: string, params?: Record<string, string>) => string,
  locale: string,
): string {
  const parts = getRelativeTimeParts(iso);
  if (parts.key) return t(parts.key, parts.params);
  return new Date(iso).toLocaleDateString(locale);
}

function notificationIcon(item: Notification): string {
  return NOTIFICATION_TYPE_ICONS[item.type] ?? "notifications";
}

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
          className="absolute end-0 top-full z-50 mt-2 w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-bright shadow-xl"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-outline-variant/60 bg-surface-bright/98 px-4 py-3 backdrop-blur">
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

          <div className="max-h-[min(32rem,calc(100vh-10rem))] overflow-y-auto px-2 py-2">
            {feed.isLoading && visibleItems.length === 0 ? (
              <p
                role="status"
                className="px-4 py-8 text-center text-body-sm text-on-surface-variant"
              >
                {t("common.loading")}
              </p>
            ) : visibleItems.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant">
                  <span
                    className="material-symbols-outlined text-[24px]"
                    aria-hidden="true"
                  >
                    notifications
                  </span>
                </div>
                <p className="mt-3 text-title-md font-semibold text-on-surface">
                  {t("notifications.empty")}
                </p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  {t("notifications.emptyHint")}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {visibleItems.slice(0, NOTIFICATIONS_LIMIT).map((item) => (
                  <li key={item.id} className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest/90 shadow-sm">
                    <div className="rounded-2xl px-3 py-3 transition-colors hover:bg-surface-container-low/80">
                      <button
                        type="button"
                        onClick={() => void handleItemClick(item)}
                        className={`flex w-full items-start gap-3 rounded-xl text-start transition-colors ${
                          item.isRead
                            ? "hover:bg-surface-container-low"
                            : "bg-primary/5 hover:bg-primary/10"
                        } px-1 py-1.5`}
                      >
                        <span className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-primary">
                          <span
                            className="material-symbols-outlined text-[20px]"
                            aria-hidden="true"
                          >
                            {notificationIcon(item)}
                          </span>
                          {!item.isRead ? (
                            <span
                              aria-hidden="true"
                              data-testid="unread-dot"
                              className={`absolute -top-0.5 -end-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface-container-lowest ${PRIORITY_DOT_CLASSES[item.priority]}`}
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-3">
                            <span
                              className={`min-w-0 flex-1 text-label-md font-semibold leading-6 ${
                                item.isRead
                                  ? "text-on-surface-variant"
                                  : "text-on-surface"
                              }`}
                            >
                              {localizeNotification(item.title, locale)}
                            </span>
                            <time
                              className="shrink-0 text-label-sm text-on-surface-variant/70"
                              dateTime={item.createdAt}
                              title={new Date(item.createdAt).toLocaleString(
                                locale,
                              )}
                            >
                              {formatNotificationTime(
                                item.createdAt,
                                t,
                                locale,
                              )}
                            </time>
                          </span>
                          <span className="mt-1 block text-body-sm leading-relaxed text-on-surface-variant">
                            {localizeNotification(item.body, locale)}
                          </span>
                        </span>
                      </button>

                      <div className="mt-2.5 flex w-full items-center">
                        <NotificationActionMenu
                          primaryAction={
                            item.actions[0]
                              ? {
                                  key: `${item.id}-primary`,
                                  label: localizeNotification(
                                    item.actions[0].label,
                                    locale,
                                  ),
                                  href: resolveNotificationActionHref(
                                    item.actions[0].url,
                                  ),
                                }
                              : null
                          }
                          overflowActions={[
                            ...item.actions.slice(1).map((action, index) => ({
                              key: `${item.id}-extra-${index}`,
                              label: localizeNotification(action.label, locale),
                              href: resolveNotificationActionHref(action.url),
                              icon: "open_in_new",
                            })),
                            {
                              key: `${item.id}-archive`,
                              label: t("notifications.archive"),
                              icon: "archive",
                              onClick: () => void handleArchive(item),
                            },
                            {
                              key: `${item.id}-clear`,
                              label: t("notifications.clear"),
                              icon: "delete",
                              onClick: () => void handleClear(item),
                              destructive: true,
                            },
                          ]}
                          moreLabel={t("common.more")}
                          onActionTriggered={() => setOpen(false)}
                          compact
                        />
                      </div>
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
