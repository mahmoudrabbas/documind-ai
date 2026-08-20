/**
 * invitation_accepted builder (T4) — one file knows this type's drafting,
 * localization, actions, category/priority (SRP + OCP). No I/O.
 *
 * Round-9: category workflow, priority normal, NO actions (plan line 254).
 * dedupEventId = invitee userId (per admin recipient — plan T25).
 */
import { resolveDedupEventId, resolveLocalized } from "../sanitize.js";
import {
  invitationAcceptedMetadataSchema,
  type InvitationAcceptedMetadata,
} from "../metadata.schemas.js";
import type { NotificationBuilder, NotificationDraft, NotificationEvent } from "../factory.js";

export const invitationAcceptedBuilder: NotificationBuilder = {
  type: "invitation_accepted",

  build(event: NotificationEvent): NotificationDraft {
    const metadata: InvitationAcceptedMetadata = invitationAcceptedMetadataSchema.parse(
      event.metadata,
    );
    const title = resolveLocalized(event.title, {
      en: "New team member",
      ar: "عضو جديد في الفريق",
    });
    const body = resolveLocalized(event.body, {
      en: `${metadata.inviteeName} joined the company.`,
      ar: `انضم ${metadata.inviteeName} إلى الشركة.`,
    });

    return {
      type: "invitation_accepted",
      category: "workflow",
      priority: "normal",
      title,
      body,
      dedupEventId: resolveDedupEventId(event, metadata.inviteeUserId),
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
