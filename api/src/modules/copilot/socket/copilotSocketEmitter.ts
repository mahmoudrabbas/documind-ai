/**
 * Copilot socket emitter locator (guider.md §15).
 *
 * Lifecycle events are enhancement-only: the socket channel carries live
 * action-progress events, but the authoritative final state is always
 * fetchable via `GET /copilot/action/:runId`. This locator lets the copilot
 * controller emit best-effort events without coupling it to the HTTP server
 * bootstrap (which owns the socket.io instance). When no server handle was
 * registered (e.g. in tests, or before server.ts wiring runs), emits are
 * silent no-ops.
 */

import type { NotificationSocketServerHandle } from "../../notifications/socket/notificationSocketServer.js";

export const COPILOT_LIFECYCLE_EVENTS = [
  "copilot.classified",
  "guide.session.created",
  "action.plan.created",
  "action.awaiting_confirmation",
  "action.executed",
  "action.failed",
  "copilot.completed",
] as const;

export type CopilotLifecycleEvent = (typeof COPILOT_LIFECYCLE_EVENTS)[number];

let copilotSocketServer: NotificationSocketServerHandle | null = null;

/** Registers the socket.io handle once the HTTP server is listening. */
export function setCopilotSocketServer(
  handle: NotificationSocketServerHandle | null,
): void {
  copilotSocketServer = handle;
}

/** Best-effort emit to `copilot:<runId>`. Never throws. */
export function emitCopilotEvent(
  runId: string,
  event: CopilotLifecycleEvent,
  payload: unknown,
): void {
  try {
    copilotSocketServer?.emitToCopilotRun(runId, event, payload);
  } catch {
    // Lifecycle is non-authoritative; a failed emit must never break a request.
  }
}

/** Test/observability hook: expose whether a socket server handle is wired. */
export function isCopilotSocketServerRegistered(): boolean {
  return copilotSocketServer !== null;
}
