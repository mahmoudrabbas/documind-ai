import { apiClient } from "@/lib/api-client";
import type {
  CheckoutSessionResponse,
  CheckoutSession,
  SubscriptionStatus,
  PaymentEvent,
  Pagination,
} from "@/types/api/billing.types";

type Success<T> = { success: true; data: T };

export function createCheckoutSession(
  packageId: string,
  billingInterval: "monthly" | "annual",
) {
  return apiClient<Success<CheckoutSessionResponse>>("/checkout/sessions", {
    method: "POST",
    body: { packageId, billingInterval },
  });
}

export function getCheckoutStatus(checkoutId: string, signal?: AbortSignal) {
  return apiClient<Success<CheckoutSession>>(
    `/checkout/sessions/${encodeURIComponent(checkoutId)}`,
    { signal },
  );
}

export function getSubscriptionStatus(signal?: AbortSignal) {
  return apiClient<Success<SubscriptionStatus>>("/checkout/subscription", {
    signal,
  });
}

export function listPaymentEvents(
  params: { page?: number; pageSize?: number; status?: string; eventType?: string },
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.status) search.set("status", params.status);
  if (params.eventType) search.set("eventType", params.eventType);
  const qs = search.toString();
  return apiClient<
    Success<{ events: PaymentEvent[]; pagination: Pagination }>
  >(`/super-admin/payment-events${qs ? `?${qs}` : ""}`, { signal });
}

export function reprocessPaymentEvent(eventId: string) {
  return apiClient<Success<{ reprocessed: boolean }>>(
    `/super-admin/payment-events/${encodeURIComponent(eventId)}/reprocess`,
    { method: "POST" },
  );
}

export function triggerReconciliation() {
  return apiClient<Success<{ totalSubscriptions: number; mismatched: Array<Record<string, unknown>> }>>(
    "/reconciliation/subscriptions",
    { method: "POST" },
  );
}

export function listCheckoutSessions(
  params: { page?: number; pageSize?: number },
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return apiClient<Success<{ sessions: CheckoutSession[]; pagination: Pagination }>>(
    `/checkout/sessions${qs ? `?${qs}` : ""}`,
    { signal },
  );
}
