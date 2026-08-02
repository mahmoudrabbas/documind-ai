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
 * Audience selectors a producer can attach to an event (T25). They live on the
 * event under `metadata.recipients` alongside the explicit `userIds` fallback
 * (e.g. `metadata.recipients.departments`). All three are resolved against the
 * tenant's ACTIVE users only:
 *  - `departments` → users whose `employeeProfile.department` (name string)
 *    matches one of the given names (membership lives on the User — the
 *    Department model carries no member list);
 *  - `roles` → users whose `customRoleId` (Role ObjectId) is one of the ids;
 *  - `tenantMembers` → every active user of the tenant.
 * Explicit `recipientUserIds` always take precedence: when they are present the
 * audiences are never consulted. Unknown/empty audiences resolve to nothing.
 */
export interface RecipientAudiences {
  departments?: string[];
  roles?: string[];
  tenantMembers?: boolean;
}

/**
 * Recipient resolver port (T6, extended T25) — pure TS interface. Implemented
 * by `RecipientResolver` (recipientResolver.ts). `tenantId` scopes the T25
 * audience queries to one tenant. Tests inject a fake.
 */
export interface RecipientResolverPort {
  resolveRecipients(tenantId: string, event: NotificationEvent): Promise<RecipientResolution>;
}
