/**
 * API response types for the notification system (Phase 1).
 *
 * Mirrors the wire contract implemented in the api workspace
 * (api/src/modules/notifications/notifications.controller.ts). The list
 * endpoint serializes only SAFE_FIELDS, and `id` (not `_id`) is the
 * frontend-facing identifier.
 */

export type NotificationType =
  | "processing_complete"
  | "processing_failed"
  | "quota_exceeded"
  | "knowledge_gap_created"
  | "invitation_accepted"
  | "welcome"
  | "role_changed"
  | "document_uploaded";

export type NotificationCategory =
  | "system"
  | "billing"
  | "security"
  | "documents"
  | "knowledge"
  | "workflow"
  | "admin";

export type NotificationPriority = "critical" | "high" | "normal" | "low";

export type NotificationLifecycleState =
  | "CREATED"
  | "QUEUED"
  | "DISPATCHED"
  | "VISIBLE"
  | "SEEN"
  | "READ"
  | "ARCHIVED"
  | "EXPIRED"
  | "DELETED";

/** Bilingual content — both locales populated by the factory. */
export interface LocalizedText {
  en: string;
  ar: string;
}

export interface NotificationAction {
  label: LocalizedText;
  url: string;
  method?: string;
  icon?: string;
  variant?: string;
}

export interface NotificationSource {
  type?: string;
  id?: string;
  displayName?: string;
}

/** A single notification as returned by the API (serialized SAFE_FIELDS). */
export interface Notification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: LocalizedText;
  body: LocalizedText;
  source?: NotificationSource;
  actions: NotificationAction[];
  isRead: boolean;
  readAt?: string | null;
  isSeen: boolean;
  seenAt?: string | null;
  isArchived: boolean;
  archivedAt?: string | null;
  lifecycleState: NotificationLifecycleState;
  version: number;
  collapsedCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface UnreadCountByPriority {
  critical: number;
  high: number;
  normal: number;
  low: number;
}

/* ── Response shapes ─────────────────────────────────────────────────── */

export interface NotificationsListResponse {
  success: boolean;
  data: {
    items: Notification[];
    total: number;
  };
  meta: {
    page: number;
    limit: number;
  };
}

export interface UnreadCountResponse {
  success: boolean;
  data: {
    count: number;
    byPriority: UnreadCountByPriority;
  };
}

export interface NotificationReadResponse {
  success: boolean;
  data: {
    notificationId: string;
  };
}

export interface NotificationMatchedResponse {
  success: boolean;
  data: {
    matchedCount: number;
  };
}

export interface NotificationArchiveResponse {
  success: boolean;
  data: {
    notificationId: string;
    archived: boolean;
  };
}

export interface NotificationDeleteResponse {
  success: boolean;
  data: {
    notificationId: string;
    deleted: boolean;
  };
}

export interface ListNotificationsParams {
  page?: number;
  limit?: number;
  category?: NotificationCategory;
}
