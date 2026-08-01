"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getUnreadCount } from "@/services/notifications.service";
import type { UnreadCountByPriority } from "@/types/api/notifications.types";

export const UNREAD_COUNT_POLL_INTERVAL_MS = 30_000;

const EMPTY_BY_PRIORITY: UnreadCountByPriority = {
  critical: 0,
  high: 0,
  normal: 0,
  low: 0,
};

export interface UseUnreadCountResult {
  count: number;
  byPriority: UnreadCountByPriority;
  isLoading: boolean;
  error: string | null;
  /** Immediately re-fetch the unread count (also called by the poller). */
  refresh: () => Promise<void>;
}

/**
 * Unread notification count with a 30s polling interval (Phase-1 decision:
 * polling, NO sockets — those land in Phase 2 / useNotificationSocket).
 *
 * The interval/cleanup style mirrors useProcessingProgress.ts (useRef-held
 * interval + useEffect cleanup) — only the interval LENGTH differs (30s vs
 * 3s). The server is the source of truth; this hook simply keeps the badge
 * fresh while the page is mounted.
 */
export function useUnreadCount(): UseUnreadCountResult {
  const [count, setCount] = useState(0);
  const [byPriority, setByPriority] = useState<UnreadCountByPriority>(
    EMPTY_BY_PRIORITY,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getUnreadCount();
      setCount(response.data.count);
      setByPriority(response.data.byPriority);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load unread count",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Poll on a 30s interval; fetch immediately on mount and clean up on unmount.
  useEffect(() => {
    void refresh();
    pollingRef.current = setInterval(() => {
      void refresh();
    }, UNREAD_COUNT_POLL_INTERVAL_MS);

    return () => stopPolling();
  }, [refresh, stopPolling]);

  return { count, byPriority, isLoading, error, refresh };
}
