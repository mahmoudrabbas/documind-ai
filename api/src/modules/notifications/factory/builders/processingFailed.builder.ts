/**
 * processing_failed builder (T4) — one file knows this type's drafting,
 * localization, actions, category/priority (SRP + OCP). No I/O.
 *
 * Actions: Retry (POST /documents/:id/ocr/retry, or POST
 * /documents/:id/index/retry for indexing-stage failures — mapped by
 * metadata.stage) + View (GET /documents/:id). Category documents, priority
 * normal (plan line 254).
 */
import type { NotificationAction } from "../../../../db/models/notification.model.js";
import {
  buildActionUrl,
  resolveDedupEventId,
  resolveLocalized,
} from "../sanitize.js";
import {
  processingFailedMetadataSchema,
  type ProcessingFailedMetadata,
} from "../metadata.schemas.js";
import type { NotificationBuilder, NotificationDraft, NotificationEvent } from "../factory.js";

/** Indexing pipeline stage names → use the /index/retry endpoint (indexing
 *  module uses stage values like "embed", "verify", "generation", "rollback"). */
const INDEXING_STAGES = new Set(["index", "indexing", "embed", "generation", "verify", "rollback"]);

function retryEndpointFor(stage: string): string {
  return INDEXING_STAGES.has(stage.toLowerCase())
    ? "/documents/:id/index/retry"
    : "/documents/:id/ocr/retry";
}

export const processingFailedBuilder: NotificationBuilder = {
  type: "processing_failed",

  build(event: NotificationEvent): NotificationDraft {
    const metadata: ProcessingFailedMetadata = processingFailedMetadataSchema.parse(event.metadata);

    const title = resolveLocalized(event.title, {
      en: "Document processing failed",
      ar: "فشل معالجة المستند",
    });
    const body = resolveLocalized(event.body, {
      en: `Your document "${metadata.documentTitle}" could not be processed.`,
      ar: `تعذرت معالجة المستند "${metadata.documentTitle}".`,
    });

    const retryUrl = buildActionUrl(retryEndpointFor(metadata.stage), metadata.documentId);
    const viewUrl = buildActionUrl("/documents/:id", metadata.documentId);
    const actions: NotificationAction[] = [
      {
        label: { en: "Retry", ar: "إعادة المحاولة" },
        url: retryUrl,
        method: "POST",
        icon: "refresh",
        variant: "primary",
      },
      {
        label: { en: "View document", ar: "عرض المستند" },
        url: viewUrl,
        method: "GET",
        icon: "eye",
        variant: "secondary",
      },
    ];

    return {
      type: "processing_failed",
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
