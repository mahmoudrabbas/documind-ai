/**
 * processing_complete builder (T18) — one file knows this type's drafting,
 * localization, actions, category/priority (SRP + OCP). No I/O.
 *
 * Payload (strict zod, mirrors the sibling builder contract): metadata carries
 * { documentId, version, outcome, completedAt, recipients? }; tenantId and
 * actorId ride at the event envelope level (actorId is "system" — the pipeline,
 * not a real user). The default recipient — the document owner/uploader — rides
 * via `metadata.recipients.userIds` (the RecipientResolver's fallback path)
 * and/or the envelope `recipientUserIds` (the outbox dispatcher's
 * extractRecipientUserIds path).
 *
 * Actions: View (GET /documents/:id). Category documents, priority normal.
 */
import type { NotificationAction } from "../../../../db/models/notification.model.js";
import {
  buildActionUrl,
  resolveDedupEventId,
  resolveLocalized,
} from "../sanitize.js";
import {
  processingCompleteMetadataSchema,
  type ProcessingCompleteMetadata,
} from "../metadata.schemas.js";
import type { NotificationBuilder, NotificationDraft, NotificationEvent } from "../factory.js";

export const processingCompleteBuilder: NotificationBuilder = {
  type: "processing_complete",

  build(event: NotificationEvent): NotificationDraft {
    const metadata: ProcessingCompleteMetadata = processingCompleteMetadataSchema.parse(event.metadata);

    const title = resolveLocalized(event.title, {
      en: "Document processing complete",
      ar: "اكتملت معالجة المستند",
    });
    const body = resolveLocalized(event.body, {
      en: "Your document has finished processing and is ready to use.",
      ar: "اكتملت معالجة مستندك وهو جاهز للاستخدام.",
    });

    const actions: NotificationAction[] = [
      {
        label: { en: "View document", ar: "عرض المستند" },
        url: buildActionUrl("/documents/:id", metadata.documentId),
        method: "GET",
        icon: "eye",
        variant: "secondary",
      },
    ];

    return {
      type: "processing_complete",
      category: "documents",
      priority: "normal",
      title,
      body,
      dedupEventId: resolveDedupEventId(event, metadata.documentId),
      actions,
      metadata,
      source: event.source,
      actorId: event.actorId,
      traceIds: event.traceIds,
      createdBy: event.createdBy,
      version: 1,
    };
  },
};
