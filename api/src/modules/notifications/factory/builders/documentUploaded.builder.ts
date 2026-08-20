/**
 * document_uploaded builder (T4) — one file knows this type's drafting,
 * localization, actions, category/priority (SRP + OCP). No I/O.
 *
 * Round-9: category documents, priority normal, actions [View →
 * GET /documents/:id] (plan line 254; View template allowlisted in T4).
 */
import type { NotificationAction } from "../../../../db/models/notification.model.js";
import {
  buildActionUrl,
  resolveDedupEventId,
  resolveLocalized,
} from "../sanitize.js";
import {
  documentUploadedMetadataSchema,
  type DocumentUploadedMetadata,
} from "../metadata.schemas.js";
import type { NotificationBuilder, NotificationDraft, NotificationEvent } from "../factory.js";

export const documentUploadedBuilder: NotificationBuilder = {
  type: "document_uploaded",

  build(event: NotificationEvent): NotificationDraft {
    const metadata: DocumentUploadedMetadata = documentUploadedMetadataSchema.parse(event.metadata);

    const title = resolveLocalized(event.title, {
      en: "New document",
      ar: "مستند جديد",
    });
    const body = resolveLocalized(event.body, {
      en: `A new document "${metadata.documentTitle}" was uploaded.`,
      ar: `تم رفع مستند جديد "${metadata.documentTitle}".`,
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
      type: "document_uploaded",
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
