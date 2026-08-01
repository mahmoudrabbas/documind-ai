/**
 * Notification delivery transport port (T12 — plan round-11, LSP/ISP).
 *
 * This is the ONLY contract the dispatch worker (T11) knows. Any delivery
 * channel — RestDelivery (T12, Phase 1), SocketIoDelivery (T16, Phase 2), or a
 * future adapter — is substitutable without the worker changing (Liskov
 * Substitution Principle). The port is narrow (a single method) so no adapter
 * implements methods it does not use (Interface Segregation Principle).
 *
 * Failure taxonomy: `errorCategory` is the single failure classification every
 * adapter MUST honor — `'temporary' | 'permanent'`. The worker maps those to
 * RetryableJobError / PermanentJobError respectively.
 */

/** Notification types enumerated by the plan (T5 dedup windows, T4 builders). */
export type NotificationType =
  | "processing_failed"
  | "processing_complete"
  | "quota_exceeded"
  | "knowledge_gap_created"
  | "invitation_accepted"
  | "welcome"
  | "role_changed"
  | "document_uploaded";

/** Priority tiers used by the notification UI (T7 /unread-count, T14 badge). */
export type NotificationPriority = "critical" | "high" | "normal" | "low";

/** An action button rendered on a delivered notification (T4 allowlisted URLs). */
export interface NotificationAction {
  label: string;
  url: string;
}

export interface TransportDeliveryInput {
  notificationId: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  actions: readonly NotificationAction[];
  createdAt: Date;
}

export interface TransportDeliveryResult {
  ok: boolean;
  /** Failure taxonomy every adapter MUST honor: `'temporary' | 'permanent'`. */
  errorCategory?: string;
  errorMessage?: string;
}

export interface NotificationTransportPort {
  deliver(input: TransportDeliveryInput): Promise<TransportDeliveryResult>;
}
