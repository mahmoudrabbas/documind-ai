import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND } from "../../common/errors/errorCodes.js";
import { NotificationService } from "./notifications.service.js";
import { MongoNotificationRepository } from "./repositories/mongo/notification.repository.js";
import { MongoUserNotificationStateRepository } from "./repositories/mongo/userNotificationState.repository.js";
import { RecipientResolver } from "./recipientResolver.js";
import type { TransactionSession } from "./ports/notificationRepository.port.js";
import {
  bulkReadSchema,
  idSchema,
  listNotificationsQuerySchema,
  parse,
} from "./notifications.validator.js";

const SAFE_FIELDS = [
  "id",
  "type",
  "category",
  "priority",
  "title",
  "body",
  "source",
  "actions",
  "isRead",
  "readAt",
  "isSeen",
  "seenAt",
  "isArchived",
  "archivedAt",
  "lifecycleState",
  "version",
  "collapsedCount",
  "createdAt",
  "updatedAt",
  "expiresAt",
] as const;

function serializeNotification(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of SAFE_FIELDS) {
    if (doc[field] !== undefined) out[field] = doc[field];
  }
  return out;
}

let service: NotificationService | null = null;
function getService(): NotificationService {
  service ??= new NotificationService(
    new MongoNotificationRepository(),
    new MongoUserNotificationStateRepository(),
    new RecipientResolver(),
    async (): Promise<TransactionSession> => {
      const session = await mongoose.startSession();
      return session as unknown as TransactionSession;
    },
  );
  return service;
}

function requireActor(req: Request): { tenantId: string; userId: string } {
  if (!req.tenantId || !req.auth?.userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  return { tenantId: req.tenantId, userId: req.auth.userId };
}

function isTestNotificationsEnabled(): boolean {
  return process.env.NOTIFICATIONS_TEST_ENABLED === "true";
}

type HandlerResult = { data: unknown; meta?: Record<string, unknown> };
type Handler = (req: Request, res: Response) => Promise<HandlerResult> | HandlerResult;

const endpoint =
  (handler: Handler) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data, meta } = await handler(req, res);
      if (!res.headersSent) {
        res.status(200).json(
          meta !== undefined ? { success: true, data, meta } : { success: true, data },
        );
      }
    } catch (error) {
      next(error);
    }
  };

export const listNotifications = endpoint(async (req) => {
  const { tenantId, userId } = requireActor(req);
  const query = parse(listNotificationsQuerySchema, req.query);
  const result = await getService().list(tenantId, userId, {
    page: query.page,
    limit: query.limit,
    ...(query.category !== undefined ? { category: query.category } : {}),
    ...(query.includeArchived !== undefined ? { includeArchived: query.includeArchived } : {}),
  });
  return {
    data: { items: result.items.map(serializeNotification), total: result.total },
    meta: { page: query.page, limit: query.limit },
  };
});

export const getNotification = endpoint(async (req) => {
  const { tenantId } = requireActor(req);
  const { id } = parse(idSchema, req.params);
  const doc = await getService().getById(tenantId, id);
  if (!doc) throw new AppError(404, NOT_FOUND, "Notification not found");
  return { data: serializeNotification(doc) };
});

export const unreadCount = endpoint(async (req) => {
  const { tenantId, userId } = requireActor(req);
  return { data: await getService().unreadCount(tenantId, userId) };
});

export const markNotificationRead = endpoint(async (req) => {
  const { tenantId, userId } = requireActor(req);
  const { id } = parse(idSchema, req.params);
  await getService().markRead(tenantId, userId, id);
  return { data: { notificationId: id } };
});

export const markNotificationSeen = endpoint(async (req) => {
  const { tenantId, userId } = requireActor(req);
  const { id } = parse(idSchema, req.params);
  await getService().markSeen(tenantId, userId, id);
  return { data: { notificationId: id } };
});

export const markAllRead = endpoint(async (req) => {
  const { tenantId, userId } = requireActor(req);
  return { data: await getService().markAllRead(tenantId, userId) };
});

export const markAllSeen = endpoint(async (req) => {
  const { tenantId, userId } = requireActor(req);
  return { data: await getService().markAllSeen(tenantId, userId) };
});

export const bulkReadNotifications = endpoint(async (req) => {
  const { tenantId, userId } = requireActor(req);
  const { ids } = parse(bulkReadSchema, req.body);
  return { data: await getService().bulkRead(tenantId, userId, ids) };
});

export const archiveNotification = endpoint(async (req) => {
  const { tenantId, userId } = requireActor(req);
  const { id } = parse(idSchema, req.params);
  const result = await getService().archive(tenantId, userId, id);
  return { data: { notificationId: id, archived: result.matched } };
});

export const deleteNotification = endpoint(async (req) => {
  const { tenantId, userId } = requireActor(req);
  const { id } = parse(idSchema, req.params);
  const result = await getService().softDelete(tenantId, userId, id, userId);
  return { data: { notificationId: id, deleted: result.matched } };
});

export const sendTestNotification = endpoint(async (req) => {
  if (!isTestNotificationsEnabled()) {
    throw new AppError(404, NOT_FOUND, "Test notifications are disabled");
  }
  const { tenantId, userId } = requireActor(req);
  return { data: await getService().createTestNotification(tenantId, userId) };
});
