/**
 * welcome builder (T4) — one file knows this type's drafting, localization,
 * actions, category/priority (SRP + OCP). No I/O.
 *
 * Round-9: category workflow, priority low, NO actions (plan line 254).
 */
import { resolveDedupEventId, resolveLocalized } from "../sanitize.js";
import {
  welcomeMetadataSchema,
  type WelcomeMetadata,
} from "../metadata.schemas.js";
import type { NotificationBuilder, NotificationDraft, NotificationEvent } from "../factory.js";

export const welcomeBuilder: NotificationBuilder = {
  type: "welcome",

  build(event: NotificationEvent): NotificationDraft {
    const metadata: WelcomeMetadata = welcomeMetadataSchema.parse(event.metadata);

    const title = resolveLocalized(event.title, {
      en: "Welcome to DocuMind",
      ar: "مرحباً بك في DocuMind",
    });
    const body = resolveLocalized(event.body, {
      en: `Welcome to ${metadata.companyName}! Your account is ready.`,
      ar: `مرحباً بك في ${metadata.companyName}! حسابك جاهز.`,
    });

    return {
      type: "welcome",
      category: "workflow",
      priority: "low",
      title,
      body,
      dedupEventId: resolveDedupEventId(event),
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
