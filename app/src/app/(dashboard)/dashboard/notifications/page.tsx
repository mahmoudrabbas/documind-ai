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
import { useI18n } from "@/providers/i18n-provider";
import { useNotificationFeed } from "@/hooks/features/useNotificationFeed";
import { useUnreadCount } from "@/hooks/features/useUnreadCount";
import { markAllRead } from "@/services/notifications.service";
import {
  localizeNotification,
  resolveNotificationActionHref,
} from "@/lib/notification-utils";
import type {
  Notification,
  NotificationCategory,
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

export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const feed = useNotificationFeed();
  const unread = useUnreadCount();
  const { load, refresh, markRead, items, total, isLoading, error } = feed;
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");
  const [page, setPage] = useState(1);
  const [markingAllRead, setMarkingAllRead] = useState(false);

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("notifications.title")}
        description={t("notifications.pageDescription")}
        actions={
          <Button
            variant="secondary"
            isLoading={markingAllRead}
            disabled={unread.count === 0}
            onClick={() => void handleMarkAllRead()}
          >
            {t("notifications.markAllRead")}
          </Button>
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
            <ul className="divide-y divide-outline-variant">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void handleItemClick(item)}
                    className="flex w-full items-start gap-3 px-5 py-4 text-start hover:bg-surface-container-low"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        {
                          critical: "bg-error",
                          high: "bg-warning",
                          normal: "bg-info",
                          low: "bg-on-surface-variant",
                        }[item.priority]
                      }`}
                    />
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
                      <span className="mt-1 block text-label-sm text-on-surface-variant/70">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </span>
                  </button>
                  {item.actions.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 px-5 pb-4 ps-10">
                      {item.actions.map((action, index) => (
                        <a
                          key={`${action.url}-${index}`}
                          href={resolveNotificationActionHref(action.url)}
                          className="rounded-md px-2 py-1 text-label-sm font-medium text-primary hover:bg-primary/10"
                        >
                          {localizeNotification(action.label, locale)}
                        </a>
                      ))}
                    </div>
                  ) : null}
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
