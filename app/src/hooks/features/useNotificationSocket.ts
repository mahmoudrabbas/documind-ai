"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL } from "@/constants/api";
import { getAccessToken } from "@/lib/auth-tokens";

export interface UseNotificationSocketOptions {
  /** Called when the server pushes `notification:created` (e.g. refresh unread count + feed). */
  onNotificationCreated?: () => void;
  /** Called when the server pushes `notification:updated` (e.g. refresh unread count + feed). */
  onNotificationUpdated?: () => void;
}

export interface UseNotificationSocketResult {
  /** True while the socket transport is connected; false on disconnect/error. */
  connected: boolean;
}

/**
 * Real-time notification channel (Phase 2). Connects a socket.io-client to
 * the API with the current access token as the handshake credential and
 * surfaces `notification:created` / `notification:updated` as refresh
 * callbacks so the caller can re-fetch the unread count and feed.
 *
 * Design notes:
 * - The 30s poll in useUnreadCount is intentionally NOT removed — this hook
 *   augments it; the poll is the fallback when the socket is unavailable.
 * - Reconnection is delegated to socket.io (automatic backoff); this hook
 *   never hand-rolls reconnection.
 * - The token is read once at mount via getAccessToken() (React state-backed,
 *   module cache — never localStorage) and sent as `auth.token`.
 */
export function useNotificationSocket(
  options: UseNotificationSocketOptions = {},
): UseNotificationSocketResult {
  const [connected, setConnected] = useState(false);

  // Latest callbacks, available to socket handlers without stale closures or
  // reconnecting when the caller passes a fresh options object each render.
  const callbacksRef = useRef(options);
  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  useEffect(() => {
    const socket = io(API_BASE_URL, {
      auth: { token: getAccessToken() },
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on("notification:created", () => {
      callbacksRef.current.onNotificationCreated?.();
    });
    socket.on("notification:updated", () => {
      callbacksRef.current.onNotificationUpdated?.();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  return { connected };
}
