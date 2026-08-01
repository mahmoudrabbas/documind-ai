"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listNotifications,
  markRead,
} from "@/services/notifications.service";
import type {
  Notification,
  NotificationCategory,
} from "@/types/api/notifications.types";

export const DEFAULT_PAGE_SIZE = 20;

export interface NotificationFeedOptions {
  /** Items per page (defaults to DEFAULT_PAGE_SIZE). */
  limit?: number;
  /** Optional category filter (null/undefined = all). */
  category?: NotificationCategory;
}

export interface UseNotificationFeedResult {
  items: Notification[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
  /** Load an arbitrary page (1-based offset). */
  load: (page: number, options?: NotificationFeedOptions) => Promise<void>;
  /** Reload the current page. */
  refresh: () => Promise<void>;
  /** Optimistically mark a notification read; rolls back on API error. */
  markRead: (id: string) => Promise<void>;
}

/**
 * Notification feed (Phase 1) — offset-paginated list of the current user's
 * notifications with optimistic read-state updates. The server is the source
 * of truth; this hook only mirrors mutations locally until the API confirms
 * them. Polling/real-time is handled separately (useUnreadCount /
 * useNotificationSocket in Phase 2).
 */
export function useNotificationFeed(): UseNotificationFeedResult {
  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest items, available to callbacks without stale closures.
  const itemsRef = useRef<Notification[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const load = useCallback(
    async (nextPage: number, options?: NotificationFeedOptions) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listNotifications({
          page: nextPage,
          limit: options?.limit ?? DEFAULT_PAGE_SIZE,
          ...(options?.category !== undefined
            ? { category: options.category }
            : {}),
        });
        setItems(response.data.items);
        setTotal(response.data.total);
        setPage(nextPage);
        setPageSize(options?.limit ?? DEFAULT_PAGE_SIZE);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load notifications",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    await load(page);
  }, [load, page]);

  const markReadLocal = useCallback(async (id: string) => {
    const previous = itemsRef.current;
    const previousItem = previous.find((item) => item.id === id);
    // Already read locally — nothing to do (idempotent).
    if (previousItem?.isRead) return;

    // Optimistic update: flip the local item immediately.
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );

    try {
      await markRead(id);
    } catch (err) {
      // Roll back to the previous read state on API failure.
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, isRead: previousItem?.isRead ?? false }
            : item,
        ),
      );
      setError(
        err instanceof Error
          ? err.message
          : "Failed to mark notification as read",
      );
    }
  }, []);

  return {
    items,
    total,
    page,
    pageSize,
    isLoading,
    error,
    load,
    refresh,
    markRead: markReadLocal,
  };
}
