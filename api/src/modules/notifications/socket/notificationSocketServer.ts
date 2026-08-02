/**
 * Notification socket server (T15) — real-time delivery channel for
 * notifications, attached to the API's existing HTTP server.
 *
 * Two authenticated socket roles share the same handshake middleware:
 *
 * - USER: a valid access JWT (verified with the same claim rules as the
 *   authenticate middleware). The socket joins `user:{tenantId}:{userId}` and
 *   receives `notification:created` / `notification:updated` events pushed via
 *   `emitToUser`. User sockets never emit notification events.
 * - SERVICE: a raw token that must equal `config.NOTIFICATION_SOCKET_SERVICE_TOKEN`
 *   (timing-safe compare). Service sockets emit `notification:deliver` and are
 *   acked with `{ ok }` / `{ ok: false, errorCategory }`.
 */

import crypto from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "../../../config/index.js";
import UserModel from "../../../db/models/user.model.js";
import {
  NOTIFICATION_PRIORITY_VALUES,
  NOTIFICATION_TYPE_VALUES,
  type NotificationAction,
  type NotificationPriority,
  type NotificationType,
} from "../../../db/models/notification.model.js";
import { isBaseRole } from "../../../common/auth/baseRoles.js";
import { verifyJwt } from "../../auth/jwtTokens.js";
import type { AuthTokenClaims } from "../../auth/auth.types.js";

export interface NotificationSocketServerHandle {
  emitToUser(
    tenantId: string,
    userId: string,
    event: string,
    payload: unknown,
  ): void;
  close(): void;
}

interface DeliverInput {
  notificationId: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  actions: readonly NotificationAction[];
  createdAt: Date;
}

type DeliverAck = { ok: boolean; errorCategory?: "temporary" | "permanent" };

const USER_ROOM_PREFIX = "user:";

function userRoom(tenantId: string, userId: string): string {
  return `${USER_ROOM_PREFIX}${tenantId}:${userId}`;
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return (
    aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer)
  );
}

function isStringArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCreatedAt(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function parseDeliverInput(input: unknown): DeliverInput | null {
  if (!isRecord(input)) return null;

  const { notificationId, tenantId, userId, type, priority, title, body } =
    input;

  if (
    typeof notificationId !== "string" ||
    notificationId.length === 0 ||
    typeof tenantId !== "string" ||
    tenantId.length === 0 ||
    typeof userId !== "string" ||
    userId.length === 0
  ) {
    return null;
  }

  if (!NOTIFICATION_TYPE_VALUES.some((value) => value === type)) return null;
  if (!NOTIFICATION_PRIORITY_VALUES.some((value) => value === priority)) {
    return null;
  }
  if (typeof title !== "string" || title.length === 0) return null;
  if (typeof body !== "string" || body.length === 0) return null;

  const actions = input.actions;
  if (!isStringArray(actions)) return null;
  for (const action of actions) {
    if (!isRecord(action) || typeof action.label !== "string" || typeof action.url !== "string") {
      return null;
    }
  }

  const createdAt = parseCreatedAt(input.createdAt);
  if (!createdAt) return null;

  return {
    notificationId,
    tenantId,
    userId,
    type: type as NotificationType,
    priority: priority as NotificationPriority,
    title,
    body,
    actions: actions as NotificationAction[],
    createdAt,
  };
}

/**
 * Serializes a deliver input into the SAFE_FIELDS wire shape the controller
 * uses for notification payloads (notifications.controller.ts). Fields absent
 * from the transport input get the lifecycle defaults of a freshly created
 * notification.
 */
function serializeNotification(input: DeliverInput) {
  return {
    id: input.notificationId,
    type: input.type,
    category: "system",
    priority: input.priority,
    title: input.title,
    body: input.body,
    source: undefined,
    actions: input.actions,
    isRead: false,
    readAt: undefined,
    isSeen: false,
    seenAt: undefined,
    isArchived: false,
    archivedAt: undefined,
    lifecycleState: "VISIBLE",
    version: 1,
    collapsedCount: 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    expiresAt: undefined,
  };
}

export function createSocketServer(
  httpServer: HttpServer,
): NotificationSocketServerHandle {
  const io = new Server(httpServer);

  io.use((socket, next) => {
    const token =
      typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token
        : "";

    if (safeEqual(token, config.NOTIFICATION_SOCKET_SERVICE_TOKEN)) {
      socket.data.role = "service";
      return next();
    }

    let claims: AuthTokenClaims;
    try {
      claims = verifyJwt<AuthTokenClaims>(token, config.JWT_SECRET);
    } catch {
      return next(new Error("unauthorized"));
    }

    if (
      claims.type !== "access" ||
      !claims.sub ||
      !claims.tenantId ||
      !isBaseRole(claims.role)
    ) {
      return next(new Error("unauthorized"));
    }

    if (typeof claims.sessionVersion === "number") {
      void UserModel.findById(claims.sub)
        .select("sessionVersion")
        .lean()
        .exec()
        .then((user) => {
          if (!user || (user.sessionVersion ?? 0) !== claims.sessionVersion) {
            return next(new Error("unauthorized"));
          }
          socket.data.role = "user";
          socket.data.tenantId = claims.tenantId;
          socket.data.userId = claims.sub;
          next();
        })
        .catch(() => next(new Error("unauthorized")));
      return;
    }

    socket.data.role = "user";
    socket.data.tenantId = claims.tenantId;
    socket.data.userId = claims.sub;
    next();
  });

  io.on("connection", (socket) => {
    if (socket.data.role !== "service") {
      socket.join(userRoom(socket.data.tenantId, socket.data.userId));
      return;
    }

    socket.on(
      "notification:deliver",
      (input: unknown, ack?: (result: DeliverAck) => void) => {
        const parsed = parseDeliverInput(input);
        if (!parsed) {
          ack?.({ ok: false, errorCategory: "permanent" });
          return;
        }
        io.to(userRoom(parsed.tenantId, parsed.userId)).emit(
          "notification:created",
          serializeNotification(parsed),
        );
        ack?.({ ok: true });
      },
    );
  });

  return {
    emitToUser(tenantId, userId, event, payload) {
      io.to(userRoom(tenantId, userId)).emit(event, payload);
    },
    close() {
      io.close();
    },
  };
}
