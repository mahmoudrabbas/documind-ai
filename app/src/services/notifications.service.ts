import { api } from "@/lib/api-client";
import type {
  ListNotificationsParams,
  NotificationArchiveResponse,
  NotificationDeleteResponse,
  NotificationMatchedResponse,
  NotificationReadResponse,
  NotificationsListResponse,
  UnreadCountResponse,
} from "@/types/api/notifications.types";

/**
 * Notifications service — wraps the shared api client for the notification
 * endpoints (Phase 1 REST). Mirrors the structure of
 * processingProgress.service.ts / email.service.ts: each method builds the
 * endpoint + query string and returns the typed `{success, data}` envelope.
 * Errors are thrown as `ApiError` (the api client does this) and caught by
 * the hooks that consume this service.
 */

export async function listNotifications(
  params: ListNotificationsParams = {},
): Promise<NotificationsListResponse> {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.category !== undefined) query.set("category", params.category);
  const queryString = query.toString();
  return api.get<NotificationsListResponse>(
    `/notifications${queryString ? `?${queryString}` : ""}`,
  );
}

export function getUnreadCount(): Promise<UnreadCountResponse> {
  return api.get<UnreadCountResponse>("/notifications/unread-count");
}

export function markRead(id: string): Promise<NotificationReadResponse> {
  return api.post<NotificationReadResponse>(`/notifications/${id}/read`);
}

export function markAllRead(): Promise<NotificationMatchedResponse> {
  return api.post<NotificationMatchedResponse>("/notifications/read-all");
}

export function markSeenAll(): Promise<NotificationMatchedResponse> {
  return api.post<NotificationMatchedResponse>("/notifications/seen-all");
}

export function bulkRead(ids: string[]): Promise<NotificationMatchedResponse> {
  return api.post<NotificationMatchedResponse>("/notifications/bulk-read", {
    ids,
  });
}

export function archive(id: string): Promise<NotificationArchiveResponse> {
  return api.post<NotificationArchiveResponse>(`/notifications/${id}/archive`);
}

export function softDelete(id: string): Promise<NotificationDeleteResponse> {
  return api.delete<NotificationDeleteResponse>(`/notifications/${id}`);
}

export function clearAllNotifications(): Promise<NotificationMatchedResponse> {
  return api.delete<NotificationMatchedResponse>("/notifications");
}
