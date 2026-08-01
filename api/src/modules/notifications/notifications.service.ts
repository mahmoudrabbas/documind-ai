/**
 * Notification service (T6/S3) — THIN orchestrator over the S2 repos and the
 * T3/T5 pure helpers. No persistence or decision logic lives here; all
 * unread-counter math is delegated to the state repo ($inc with floor).
 * NO mongoose, NO express (DIP: deps are injected ports).
 */
import type { NotificationEvent, NotificationDraft } from "./factory/factory.js";
import { applyUpdateRule, UPDATE_RULES, type NotificationDraft as LifecycleDraft } from "./lifecycle/lifecycle.js";
import { buildNotificationDedupKey, DEDUP_WINDOW_HOURS } from "workers/contracts";
import type { CreateManyEntry, ListNotificationsOptions, NotificationRepositoryPort, PaginatedNotifications, TransactionSession, UnreadCountByPriorityResult } from "./ports/notificationRepository.port.js";
import type { UserNotificationStatePort } from "./ports/userNotificationState.port.js";
import type { RecipientResolverPort } from "./ports/recipientResolver.port.js";
import type { NotificationCreateResult } from "./outbox/notificationOutbox.dispatcher.js";

/** Structural twin of the outbox dispatcher's NotificationCreateResult (S4 bridge). */
export type CreateNotificationsResult = NotificationCreateResult;

/** Thrown when a single fan-out exceeds the recipient cap. */
export class NotificationFanoutLimitError extends Error {
  constructor() {
    super("fan-out exceeds 5000 recipients");
    this.name = "NotificationFanoutLimitError";
  }
}

export const BULK_CHUNK = 500;
export const MAX_FANOUT = 5000;

export class NotificationService {
  constructor(
    private readonly repo: NotificationRepositoryPort,
    private readonly stateRepo: UserNotificationStatePort,
    private readonly resolver: RecipientResolverPort,
    private readonly sessionFactory?: () => Promise<TransactionSession>,
  ) {}

  async create(tenantId: string, draft: NotificationDraft, recipientUserIds: string[]): Promise<CreateNotificationsResult> {
    if (recipientUserIds.length > MAX_FANOUT) throw new NotificationFanoutLimitError();
    const result: CreateNotificationsResult = { results: [], createdIds: [], updatedIds: [], ignoredCount: 0 };
    for (let i = 0; i < recipientUserIds.length; i += BULK_CHUNK) {
      await this.processChunk(tenantId, draft, recipientUserIds.slice(i, i + BULK_CHUNK), result);
    }
    return result;
  }

  async createFromEvent(tenantId: string, event: NotificationEvent, draft: NotificationDraft): Promise<CreateNotificationsResult> {
    const { userIds, excludedActors } = await this.resolver.resolveRecipients(event);
    const excluded = new Set(excludedActors);
    const remaining = userIds.filter((id) => !excluded.has(id));
    return this.create(tenantId, draft, [...new Set(remaining)]);
  }

  async markRead(tenantId: string, userId: string, notificationId: string): Promise<void> {
    const { matched } = await this.repo.markRead(tenantId, userId, notificationId);
    if (matched) await this.stateRepo.decrementUnread(tenantId, userId);
  }

  async markAllRead(tenantId: string, userId: string): Promise<{ matchedCount: number }> {
    const now = new Date();
    return this.withSession(async (session) => {
      const { matchedCount } = await this.repo.markAllRead(tenantId, userId, now, session);
      await this.stateRepo.markAllReadAdjustment(tenantId, userId, matchedCount, now, session);
      return { matchedCount };
    });
  }

  async markSeen(tenantId: string, userId: string, notificationId: string): Promise<void> {
    await this.repo.markSeen(tenantId, userId, notificationId);
  }

  async markAllSeen(tenantId: string, userId: string): Promise<{ matchedCount: number }> {
    return this.repo.markAllSeen(tenantId, userId);
  }

  async bulkRead(tenantId: string, userId: string, ids: string[]): Promise<{ matchedCount: number }> {
    return this.withSession(async (session) => {
      const { matchedCount } = await this.repo.bulkRead(tenantId, userId, ids, session);
      await this.stateRepo.markAllReadAdjustment(tenantId, userId, matchedCount, new Date(), session);
      return { matchedCount };
    });
  }

  async archive(tenantId: string, userId: string, notificationId: string): Promise<{ matched: boolean }> {
    return this.withSession(async (session) => {
      const existing = await this.repo.getById(tenantId, notificationId);
      const wasUnread = existing?.isRead === false;
      const { matched } = await this.repo.archive(tenantId, userId, notificationId, session);
      if (matched && wasUnread) await this.stateRepo.decrementUnread(tenantId, userId, session);
      return { matched };
    });
  }

  async softDelete(tenantId: string, userId: string, notificationId: string, actorId: string): Promise<{ matched: boolean }> {
    return this.withSession(async (session) => {
      const existing = await this.repo.getById(tenantId, notificationId);
      const wasUnread = existing?.isRead === false;
      const { matched } = await this.repo.softDelete(tenantId, userId, notificationId, actorId, session);
      if (matched && wasUnread) await this.stateRepo.decrementUnread(tenantId, userId, session);
      return { matched };
    });
  }

  async list(tenantId: string, userId: string, opts: ListNotificationsOptions): Promise<PaginatedNotifications> {
    return this.repo.list(tenantId, userId, opts);
  }

  async getById(tenantId: string, notificationId: string): Promise<Record<string, unknown> | null> {
    return this.repo.getById(tenantId, notificationId);
  }

  async unreadCount(tenantId: string, userId: string): Promise<UnreadCountByPriorityResult> {
    return this.repo.unreadCountByPriority(tenantId, userId);
  }

  /** T7 admin-debug helper — persists ONE notification for the caller. The
   *  dedupEventId is unique per call so the dedup sliding window never
   *  collapses repeated test notifications. Persist-only: NO enqueue (Phase-1
   *  polling delivery makes the doc visible on the next poll). */
  async createTestNotification(
    tenantId: string,
    userId: string,
  ): Promise<{ notificationId: string | null }> {
    const draft: NotificationDraft = {
      type: "welcome",
      category: "system",
      priority: "normal",
      title: { en: "Test notification", ar: "إشعار تجريبي" },
      body: {
        en: "This is a test notification sent from the admin debug endpoint.",
        ar: "هذا إشعار تجريبي أُرسل من نقطة التحكم للمشرف.",
      },
      dedupEventId: `test:${userId}:${globalThis.crypto.randomUUID()}`,
      actions: [],
      metadata: { test: true },
      version: 1,
    };
    const result = await this.create(tenantId, draft, [userId]);
    return { notificationId: result.createdIds[0] ?? null };
  }

  async purgeUserNotifications(tenantId: string, userId: string, session?: TransactionSession): Promise<{ matchedCount: number }> {
    const { matchedCount } = await this.repo.purgeUserNotifications(tenantId, userId, session);
    await this.stateRepo.deleteState(tenantId, userId, session);
    return { matchedCount };
  }

  /** Core dedup orchestration for one recipient chunk — sequential
   *  (correctness over speed): mute check → sliding-window dedup → insert /
   *  update / ignore, then E11000 conflict re-resolution + post-insert
   *  straddle mitigation (all inside one transaction when a factory exists). */
  private async processChunk(tenantId: string, draft: NotificationDraft, userIds: string[], results: CreateNotificationsResult): Promise<void> {
    await this.withSession(async (session) => {
      const now = new Date();
      const windowHours = DEDUP_WINDOW_HOURS[draft.type];
      const query = { type: draft.type, dedupEventId: draft.dedupEventId, now, windowMs: windowHours * 3600e3 };
      const incoming = draft as unknown as LifecycleDraft;
      const insertEntries: CreateManyEntry[] = [];
      for (const userId of userIds) {
        const state = await this.stateRepo.get(tenantId, userId);
        if (state?.mutedTypes?.includes(draft.type)) {
          results.results.push({ userId, notificationId: null, action: "ignored" });
          results.ignoredCount++;
          continue;
        }
        const existing = await this.repo.findDedupRange(tenantId, userId, query);
        if (existing) {
          const r = applyUpdateRule(UPDATE_RULES[draft.type], existing, incoming);
          if (r.action === "update" && r.next) {
            await this.repo.updateDeduped(tenantId, existing.id, r.next as Record<string, unknown>, now);
            results.results.push({ userId, notificationId: existing.id, action: "updated" });
            results.updatedIds.push(existing.id);
          } else {
            results.results.push({ userId, notificationId: null, action: "ignored" });
            results.ignoredCount++;
          }
          continue;
        }
        insertEntries.push({ userId, dedupKey: buildNotificationDedupKey(draft.type, draft.dedupEventId, now, windowHours) });
      }
      if (insertEntries.length === 0) return;
      const res = await this.repo.createMany(tenantId, draft, insertEntries, now);
      for (const ins of res.inserted) {
        const winner = await this.repo.findDedupRange(tenantId, ins.userId, query);
        if (winner && winner.id !== ins.id) {
          await this.repo.softDeleteById(tenantId, ins.id, session);
          results.results.push({ userId: ins.userId, notificationId: winner.id, action: "updated" });
          results.updatedIds.push(winner.id);
        } else {
          results.results.push({ userId: ins.userId, notificationId: ins.id, action: "created" });
          results.createdIds.push(ins.id);
          await this.stateRepo.incUnread(tenantId, ins.userId, session);
        }
      }
      for (const conf of res.conflicts) {
        const winner = await this.repo.findDedupRange(tenantId, conf.userId, query);
        if (winner) {
          const r2 = applyUpdateRule(UPDATE_RULES[draft.type], winner, incoming);
          if (r2.action === "update" && r2.next) {
            await this.repo.updateDeduped(tenantId, winner.id, r2.next as Record<string, unknown>, now);
            results.results.push({ userId: conf.userId, notificationId: winner.id, action: "updated" });
            results.updatedIds.push(winner.id);
          } else {
            results.results.push({ userId: conf.userId, notificationId: null, action: "ignored" });
            results.ignoredCount++;
          }
        } else {
          results.results.push({ userId: conf.userId, notificationId: null, action: "ignored" });
          results.ignoredCount++;
        }
      }
    });
  }

  /** Optional transactional wrapper: with a sessionFactory every step of a
   *  chunk/operation commits atomically; without one, degrade to direct calls. */
  private async withSession<T>(fn: (session?: TransactionSession) => Promise<T>): Promise<T> {
    if (!this.sessionFactory) return fn(undefined);
    const s = await this.sessionFactory();
    return s.withTransaction((inner) => fn(inner));
  }
}
