/**
 * role_changed builder (T4) — one file knows this type's drafting,
 * localization, actions, category/priority (SRP + OCP). No I/O.
 *
 * Round-9: category workflow, priority normal, NO actions (plan line 254).
 * dedupEventId = target userId (plan T25) — must be supplied by the event.
 */
import {
  escapeHtml,
  resolveDedupEventId,
  resolveLocalized,
} from "../sanitize.js";
import {
  roleChangedMetadataSchema,
  type RoleChangeAction,
  type RoleChangedMetadata,
} from "../metadata.schemas.js";
import type { NotificationBuilder, NotificationDraft, NotificationEvent } from "../factory.js";

const ROLE_ACTION_EN: Record<RoleChangeAction, string> = {
  assigned: "assigned to you",
  removed: "removed from you",
  changed: "changed to",
  migrated: "migrated to",
};

const ROLE_ACTION_AR: Record<RoleChangeAction, string> = {
  assigned: "تم تعيينه لك",
  removed: "تمت إزالته منك",
  changed: "تم تغييره إلى",
  migrated: "تم ترحيله إلى",
};

export const roleChangedBuilder: NotificationBuilder = {
  type: "role_changed",

  build(event: NotificationEvent): NotificationDraft {
    const metadata: RoleChangedMetadata = roleChangedMetadataSchema.parse(event.metadata);
    const safeRoleName = escapeHtml(metadata.roleName);

    const title = resolveLocalized(event.title, {
      en: "Role updated",
      ar: "تم تحديث الدور",
    });
    const body = resolveLocalized(event.body, {
      en: `Your role was ${ROLE_ACTION_EN[metadata.action]}: ${safeRoleName}.`,
      ar: `تم تحديث دورك إلى ${ROLE_ACTION_AR[metadata.action]}: ${safeRoleName}.`,
    });

    return {
      type: "role_changed",
      category: "workflow",
      priority: "normal",
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
