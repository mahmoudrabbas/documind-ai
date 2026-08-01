import type { NotificationEvent } from "./factory/factory.js";
import type {
  RecipientResolution,
  RecipientResolverPort,
} from "./ports/recipientResolver.port.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
    }
  }
  return [...new Set(out)];
}

/**
 * Recipient resolver (T6) — implements RecipientResolverPort (DIP: the service
 * depends on the port, never on this class). Minimal Phase-1 resolution:
 *
 *  - `recipientUserIds` on the event envelope (producer-resolved explicit ids),
 *  - OR `metadata.recipients.userIds` (producer-supplied metadata shape).
 *
 * Department/role/tenant_member subject resolution is T25 (document_uploaded);
 * nothing is resolved here beyond the explicit id lists. The acting user is
 * always excluded (a user does not notify himself).
 */
export class RecipientResolver implements RecipientResolverPort {
  async resolveRecipients(event: NotificationEvent): Promise<RecipientResolution> {
    const excludedActors = event.actorId ? [event.actorId] : [];
    const userIds = this.resolveUserIds(event);
    return { userIds, excludedActors };
  }

  private resolveUserIds(event: NotificationEvent): string[] {
    // Optional producer-supplied envelope field, not declared on NotificationEvent.
    if (isRecord(event) && "recipientUserIds" in event) {
      const explicit = toStringArray(event.recipientUserIds);
      if (explicit.length > 0) {
        return explicit;
      }
    }
    if (isRecord(event.metadata)) {
      const recipients = event.metadata.recipients;
      if (isRecord(recipients)) {
        return toStringArray(recipients.userIds);
      }
    }
    return [];
  }
}
