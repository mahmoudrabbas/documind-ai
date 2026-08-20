/**
 * quota_exceeded builder (T4) — one file knows this type's drafting,
 * localization, actions, category/priority (SRP + OCP). No I/O.
 *
 * Category billing (plan line 254). No actions (not specified by the plan).
 * Accepted stale-high-priority behavior: the notification stays until
 * read/archived or 90-day TTL — no auto-resolution (plan review round 4 #6).
 */
import {
  resolveDedupEventId,
  resolveLocalized,
} from "../sanitize.js";
import {
  quotaExceededMetadataSchema,
  type QuotaExceededMetadata,
} from "../metadata.schemas.js";
import type { NotificationBuilder, NotificationDraft, NotificationEvent } from "../factory.js";

export const quotaExceededBuilder: NotificationBuilder = {
  type: "quota_exceeded",

  build(event: NotificationEvent): NotificationDraft {
    const metadata: QuotaExceededMetadata = quotaExceededMetadataSchema.parse(event.metadata);

    const title = resolveLocalized(event.title, {
      en: "Quota exceeded",
      ar: "تم تجاوز الحصة",
    });
    const body = resolveLocalized(event.body, {
      en: `Your ${metadata.quotaType} quota (${metadata.usage}/${metadata.limit}) has been reached. It resets on ${metadata.resetAt}.`,
      ar: `تم بلوغ حصة "${metadata.quotaType}" (${metadata.usage}/${metadata.limit}). سيتم إعادة التحديد في ${metadata.resetAt}.`,
    });

    return {
      type: "quota_exceeded",
      category: "billing",
      priority: "high",
      title,
      body,
      dedupEventId: resolveDedupEventId(event, metadata.quotaType),
      actions: [],
      metadata,
      source: event.source,
      actorId: event.actorId,
      traceIds: event.traceIds,
      createdBy: event.createdBy,
      version: 1,
    };
  },
};
