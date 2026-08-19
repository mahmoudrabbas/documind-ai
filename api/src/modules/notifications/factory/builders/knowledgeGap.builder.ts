/**
 * knowledge_gap_created builder (T4) — one file knows this type's drafting,
 * localization, actions, category/priority (SRP + OCP). No I/O.
 *
 * Category knowledge (plan line 254). No actions (not specified by the plan).
 */
import {
  resolveDedupEventId,
  resolveLocalized,
} from "../sanitize.js";
import {
  knowledgeGapMetadataSchema,
  type KnowledgeGapMetadata,
} from "../metadata.schemas.js";
import type { NotificationBuilder, NotificationDraft, NotificationEvent } from "../factory.js";

export const knowledgeGapBuilder: NotificationBuilder = {
  type: "knowledge_gap_created",

  build(event: NotificationEvent): NotificationDraft {
    const metadata: KnowledgeGapMetadata = knowledgeGapMetadataSchema.parse(event.metadata);

    const title = resolveLocalized(event.title, {
      en: "New knowledge gap",
      ar: "فجوة معرفية جديدة",
    });
    // Topic and preview are the user's own words, carried verbatim: the reader
    // renders them as text, so entity-encoding them here would only surface
    // `company&#39;s` where the user wrote `company's`.
    const body = resolveLocalized(event.body, {
      en: `A new knowledge gap was created: "${metadata.topic}". Preview: "${metadata.questionPreview}".`,
      ar: `تم إنشاء فجوة معرفية جديدة: "${metadata.topic}". معاينة: "${metadata.questionPreview}".`,
    });

    return {
      type: "knowledge_gap_created",
      category: "knowledge",
      priority: "normal",
      title,
      body,
      dedupEventId: resolveDedupEventId(event, metadata.topic),
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
