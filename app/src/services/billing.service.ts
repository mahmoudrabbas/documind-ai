import { apiClient } from "@/lib/api-client";
import type {
  CheckoutSessionResponse,
  CheckoutSession,
  SubscriptionStatus,
  PaymentEvent,
  Pagination,
  BillingPortalSessionResponse,
  BillingPortalFlow,
  BillingChangePreview,
  BillingOperationStatus,
  BillingInvoice,
  InvoiceLinks,
  InvoiceStatus,
  PublicPackage,
  BillingRefund,
  RefundStatus,
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

export function synchronizeCheckoutSession(sessionId: string, signal?: AbortSignal) {
  return apiClient<Success<{ synchronized: boolean; changed: boolean; subscription: SubscriptionStatus }>>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}/sync`,
    { method: "POST", signal },
  );
}

export function getSubscriptionStatus(signal?: AbortSignal) {
  return apiClient<Success<SubscriptionStatus>>("/checkout/subscription", {
    signal,
    cache: "no-store",
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
    "/super-admin/reconciliation/subscriptions",
    { method: "POST" },
  );
}

export function syncSubscriptionFromStripe(tenantId: string) {
  return apiClient<Success<Record<string, unknown>>>(
    `/super-admin/reconciliation/subscriptions/${encodeURIComponent(tenantId)}/sync-provider`,
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

export function createBillingPortalSession(flow: BillingPortalFlow = "general") {
  return apiClient<Success<BillingPortalSessionResponse>>(
    "/billing/portal-sessions",
    { method: "POST", body: { flow } },
  );
}

export function getBillingSummary(signal?: AbortSignal) {
  return apiClient<Success<SubscriptionStatus>>("/billing/summary", { signal, cache: "no-store" });
}

export function listPublicBillingPackages(signal?: AbortSignal) {
  return apiClient<Success<PublicPackage[]>>("/public/packages", { signal, auth: false, cache: "no-store" });
}

export function createSubscriptionChangePreview(body: { targetPackageId: string; billingInterval: "monthly" | "annual" }) {
  return apiClient<Success<BillingChangePreview>>("/billing/subscription-change-previews", { method: "POST", body });
}

export function requestSubscriptionChange(body: { previewId: string; idempotencyKey: string }) {
  return apiClient<Success<{ operation: BillingOperationStatus; replayed: boolean }>>("/billing/subscription-changes", { method: "POST", body });
}

export function requestBillingCancellation(body: { cancellationType: "PERIOD_END" | "IMMEDIATE"; idempotencyKey: string }) {
  return apiClient<Success<{ operation: BillingOperationStatus; replayed: boolean }>>("/billing/cancellations", { method: "POST", body });
}

export function requestBillingReactivation(body: { idempotencyKey: string }) {
  return apiClient<Success<{ operation: BillingOperationStatus; replayed: boolean }>>("/billing/reactivations", { method: "POST", body });
}

export function getBillingOperation(operationId: string, signal?: AbortSignal) {
  return apiClient<Success<BillingOperationStatus>>(`/billing/operations/${encodeURIComponent(operationId)}`, { signal, cache: "no-store" });
}

export function listInvoices(params: { page?: number; pageSize?: number; status?: InvoiceStatus }, signal?: AbortSignal) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.status) search.set("status", params.status);
  const query = search.toString();
  return apiClient<Success<{ invoices: BillingInvoice[]; pagination: Pagination }>>(`/billing/invoices${query ? `?${query}` : ""}`, { signal, cache: "no-store" });
}

export function getInvoiceLinks(invoiceId: string) {
  return apiClient<Success<InvoiceLinks>>(`/billing/invoices/${encodeURIComponent(invoiceId)}/links`, { cache: "no-store" });
}

export function createRefundRequest(body: {
  invoiceId: string;
  mode: "FULL" | "PARTIAL";
  amountMinor?: number;
  reason: string;
  idempotencyKey: string;
}) {
  return apiClient<Success<{ refund: BillingRefund; replayed: boolean }>>(
    "/billing/refund-requests",
    { method: "POST", body },
  );
}

export function listRefundRequests(
  params: { page?: number; pageSize?: number },
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return apiClient<Success<{ refunds: BillingRefund[]; pagination: Pagination }>>(
    `/billing/refund-requests${query ? `?${query}` : ""}`,
    { signal, cache: "no-store" },
  );
}

export function getRefundRequest(refundId: string, signal?: AbortSignal) {
  return apiClient<Success<BillingRefund>>(
    `/billing/refund-requests/${encodeURIComponent(refundId)}`,
    { signal, cache: "no-store" },
  );
}

export function listPlatformRefunds(
  params: { page?: number; pageSize?: number; status?: RefundStatus; tenantId?: string },
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.status) search.set("status", params.status);
  if (params.tenantId) search.set("tenantId", params.tenantId);
  const query = search.toString();
  return apiClient<Success<{ refunds: BillingRefund[]; pagination: Pagination }>>(
    `/super-admin/refunds${query ? `?${query}` : ""}`,
    { signal, cache: "no-store" },
  );
}

export function getPlatformRefund(refundId: string, signal?: AbortSignal) {
  return apiClient<Success<BillingRefund>>(
    `/super-admin/refunds/${encodeURIComponent(refundId)}`,
    { signal, cache: "no-store" },
  );
}

export function confirmPlatformRefund(refundId: string) {
  return apiClient<Success<{ refund: BillingRefund; replayed: boolean }>>(
    `/super-admin/refunds/${encodeURIComponent(refundId)}/confirm`,
    { method: "POST" },
  );
}

export function rejectPlatformRefund(refundId: string, reason: string) {
  return apiClient<Success<BillingRefund>>(
    `/super-admin/refunds/${encodeURIComponent(refundId)}/reject`,
    { method: "POST", body: { reason } },
  );
}

export function retryPlatformRefund(refundId: string) {
  return apiClient<Success<BillingRefund>>(
    `/super-admin/refunds/${encodeURIComponent(refundId)}/retry`,
    { method: "POST" },
  );
}
