"use client";

import { useEffect, useState } from "react";
import {
  Button,
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
  Tab,
  Tabs,
} from "@/components/ui";
import { NotificationActionMenu } from "@/components/ui/NotificationActionMenu";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { useNotificationFeed } from "@/hooks/features/useNotificationFeed";
import { useUnreadCount } from "@/hooks/features/useUnreadCount";
import {
  archive as archiveNotification,
  clearAllNotifications,
  markAllRead,
  softDelete,
} from "@/services/notifications.service";
import {
  localizeNotification,
  resolveNotificationActionHref,
} from "@/lib/notification-utils";
import { getRelativeTimeParts } from "@/lib/utils";
import type {
  Notification,
  NotificationCategory,
  NotificationType,
} from "@/types/api/notifications.types";

const PAGE_SIZE = 20;

const CATEGORY_IDS = [
  "all",
  "system",
  "billing",
  "security",
  "documents",
  "knowledge",
  "workflow",
  "admin",
] as const;

type CategoryId = (typeof CATEGORY_IDS)[number];

function categoryToParam(id: CategoryId): NotificationCategory | undefined {
  return id === "all" ? undefined : (id as NotificationCategory);
}

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

function notificationIcon(item: Notification): string {
  return NOTIFICATION_TYPE_ICONS[item.type] ?? "notifications";
}

function formatNotificationTime(
  iso: string,
  t: (key: string, params?: Record<string, string>) => string,
  locale: string,
): string {
  const parts = getRelativeTimeParts(iso);
  if (parts.key) return t(parts.key, parts.params);
  return new Date(iso).toLocaleDateString(locale);
}

export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const intlLocale = useIntlLocale();
  const feed = useNotificationFeed();
  const unread = useUnreadCount();
  const { load, refresh, markRead, items, total, isLoading, error } = feed;
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const [page, setPage] = useState(1);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  useEffect(() => {
    const category = categoryToParam(activeCategory);
    void load(page, {
      limit: PAGE_SIZE,
      ...(category !== undefined ? { category } : {}),
    });
  }, [activeCategory, page, load]);

  async function handleMarkAllRead() {
    setMarkingAllRead(true);
    try {
      await markAllRead();
      await unread.refresh();
      await refresh();
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function handleClearAll() {
    setClearingAll(true);
    try {
      await clearAllNotifications();
      await unread.refresh();
      await refresh();
    } finally {
      setClearingAll(false);
    }
  }

  function handleCategoryChange(id: string) {
    setActiveCategory(id as CategoryId);
    setPage(1);
  }

  async function handleItemClick(item: Notification) {
    if (!item.isRead) {
      await markRead(item.id);
      void unread.refresh();
    }
  }

  async function handleArchive(item: Notification) {
    await archiveNotification(item.id);
    void unread.refresh();
    void refresh();
  }

  async function handleClear(item: Notification) {
    await softDelete(item.id);
    void unread.refresh();
    void refresh();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("notifications.title")}
        description={t("notifications.pageDescription")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              isLoading={clearingAll}
              disabled={total === 0}
              onClick={() => void handleClearAll()}
            >
              {t("notifications.clearAll")}
            </Button>
            <Button
              variant="secondary"
              isLoading={markingAllRead}
              disabled={unread.count === 0}
              onClick={() => void handleMarkAllRead()}
            >
              {t("notifications.markAllRead")}
            </Button>
          </div>
        }
      />

      <Tabs
        ariaLabel={t("notifications.title")}
        active={activeCategory}
        onChange={handleCategoryChange}
        className="mb-4"
      >
        {CATEGORY_IDS.map((id) => (
          <Tab key={id} id={id}>
            {t(`notifications.category.${id}`)}
          </Tab>
        ))}
      </Tabs>

      <DashboardPanel padding="none">
        {isLoading ? (
          <div
            role="status"
            className="space-y-3 p-5"
          >
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-14 animate-pulse rounded-xl bg-surface-container"
              />
            ))}
            <span className="sr-only">{t("common.loading")}</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="p-6 text-center text-body-sm text-error"
          >
            {error}
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void refresh()}
              >
                {t("common.retry")}
              </Button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-title-lg font-bold text-on-surface">
              {t("notifications.empty")}
            </p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {t("notifications.emptyHint")}
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-2 p-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest/90 shadow-sm"
                >
                  <div className="rounded-2xl px-4 py-4 transition-colors hover:bg-surface-container-low/80">
                    <button
                      type="button"
                      onClick={() => void handleItemClick(item)}
                      className={`flex w-full items-start gap-3 rounded-xl px-1 py-1.5 text-start transition-colors ${
                        item.isRead
                          ? "hover:bg-surface-container-low"
                          : "bg-primary/5 hover:bg-primary/10"
                      }`}
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
                            className={`absolute -top-0.5 -end-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface-container-lowest ${
                              {
                                critical: "bg-error",
                                high: "bg-warning",
                                normal: "bg-info",
                                low: "bg-on-surface-variant",
                              }[item.priority]
                            }`}
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
                              intlLocale,
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
                        onActionTriggered={() => undefined}
                        compact
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {total > PAGE_SIZE ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant px-5 py-4">
                <span className="text-body-sm text-on-surface-variant">
                  {t("notifications.pageInfo", {
                    page: String(page),
                    total: String(totalPages),
                  })}
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t("notifications.previous")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("notifications.next")}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </DashboardPanel>
    </DashboardPage>
  );
}
