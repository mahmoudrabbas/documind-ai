"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL } from "@/constants/api";
import { getAccessToken } from "@/lib/auth-tokens";
import type {
  CopilotLifecycleEvent,
  CopilotLifecyclePayload,
} from "@/lib/copilot/copilot-types";

export interface UseCopilotSocketOptions {
  /** Run/session id to join (`copilot:<runId>` room). Undefined ⇒ no room. */
  runId?: string;
  /** Live lifecycle events (enhancement-only; REST remains authoritative). */
  onLifecycle?: (
    event: CopilotLifecycleEvent,
    payload: CopilotLifecyclePayload,
  ) => void;
}

export interface UseCopilotSocketResult {
  /** True while the socket transport is connected. */
  connected: boolean;
}

const LIFECYCLE_EVENTS: CopilotLifecycleEvent[] = [
  "copilot.classified",
  "guide.session.created",
  "action.plan.created",
  "action.awaiting_confirmation",
  "action.executed",
  "action.failed",
  "copilot.completed",
];

/**
 * Copilot lifecycle channel (guider.md §15) — modeled on
 * `useNotificationSocket`. Joins `copilot:<runId>` (with an ack so room
 * membership is confirmed) and forwards lifecycle events. If the socket is
 * unavailable the panel still works via REST; this hook is strictly an
 * enhancement. The socket is recreated per `runId` so each action run joins
 * its own room.
 */
export function useCopilotSocket(
  options: UseCopilotSocketOptions,
): UseCopilotSocketResult {
  const [connected, setConnected] = useState(false);

  const callbacksRef = useRef(options);
  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  const runId = options.runId;

  useEffect(() => {
    if (!runId) return;

    const socket = io(API_BASE_URL, {
      auth: { token: getAccessToken() },
      transports: ["websocket"],
      reconnection: true,
    });

    const joinRoom = () => {
      socket.emit("copilot:join", { runId }, (ok: boolean) => {
        if (!ok && socket.connected) {
          socket.emit("copilot:join", { runId });
        }
      });
    };
    const leaveRoom = () => {
      socket.emit("copilot:leave", { runId });
    };

    socket.on("connect", () => {
      setConnected(true);
      joinRoom();
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    for (const event of LIFECYCLE_EVENTS) {
      socket.on(event, (payload: CopilotLifecyclePayload) => {
        callbacksRef.current.onLifecycle?.(event, payload);
      });
    }

    return () => {
      leaveRoom();
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [runId]);

  return { connected };
}
