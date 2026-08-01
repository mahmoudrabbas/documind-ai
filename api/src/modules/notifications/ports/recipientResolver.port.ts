import type { NotificationEvent } from "../factory/factory.js";

/**
 * Outcome of resolving an event's recipients (T6). The collaborator T25's
 * document_uploaded trigger uses this port — recipient logic lives HERE, not
 * in the service (SRP). `excludedActors` are filtered out of `userIds` by the
 * service before fan-out (typically the acting user, who does not notify
 * himself).
 */
export interface RecipientResolution {
  userIds: string[];
  excludedActors: string[];
}

/**
 * Recipient resolver port (T6) — pure TS interface. Implemented by
 * `RecipientResolver` (recipientResolver.ts); department/role resolution lands
 * in T25. Tests inject a fake.
 */
export interface RecipientResolverPort {
  resolveRecipients(event: NotificationEvent): Promise<RecipientResolution>;
}
