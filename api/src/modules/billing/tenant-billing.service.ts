import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  BILLING_INVOICE_LINK_UNAVAILABLE,
  BILLING_INVOICE_NOT_FOUND,
  BILLING_PORTAL_UNAVAILABLE,
  BILLING_PROVIDER_CONFIGURATION_INVALID,
  BILLING_PROVIDER_OWNERSHIP_MISMATCH,
  BILLING_PROVIDER_UNAVAILABLE,
  NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import { config } from "../../config/index.js";
import BillingOperationModel from "../../db/models/billingOperation.model.js";
import InvoiceModel from "../../db/models/invoice.model.js";
import RefundModel from "../../db/models/refund.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { authorizePermission } from "../permissions/permissions.authorization.js";
import { authorizeTenantOperation, type OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { toCompanyBillingSummary } from "./company-billing-summary.js";
import { assertBillingPortalFlowAvailable, isBillingPortalFlowAvailable } from "./portal-flow-policy.js";
import { assertBillingPortalReturnUrl } from "./portal-url-policy.js";
import type { PaymentProvider } from "./ports/payment-provider.port.js";
import { refundCapabilitiesForTenant, refundInvoiceSummary } from "./refund.service.js";
import { evaluateSubscriptionAccess } from "./subscription-access-policy.js";

export async function getCompanyBillingSummary(tenantId: string, context: OperationAuthorizationContext) {
  const actor = await authorizeTenantOperation(context, Permission.BILLING_READ);
  assertTenant(tenantId, actor.tenantId);
  const canManageBilling = await hasBillingManage(actor);
  let transitionState: "ACTIVE" | "TRANSITION_PENDING" | "TRANSITION_RETRYABLE" | "REPAIR_REQUIRED" = "ACTIVE";
  const transitionRefund = await RefundModel.findOne({
    tenantId: new Types.ObjectId(tenantId),
    status: "SUCCEEDED",
    subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE",
    localTransitionStatus: { $ne: "SUCCEEDED" },
    $or: [
      { reasonCode: "SYSTEM_REMAINING_BALANCE_REFUND" },
      { reasonCode: "VOLUNTARY_CANCELLATION", amountMinor: { $gt: 0 }, $expr: { $eq: ["$amountMinor", "$maximumEligibleRefundMinor"] } },
    ],
  }).sort({ confirmedAt: -1, createdAt: -1 }).lean().exec();
  if (transitionRefund) {
    transitionState = transitionRefund.localTransitionStatus === "FAILED"
      ? "REPAIR_REQUIRED"
      : transitionRefund.localTransitionStatus === "RETRY_PENDING"
      ? "TRANSITION_RETRYABLE"
      : "TRANSITION_PENDING";
  }
  let subscription = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId), status: { $in: ["ACTIVE", "TRIALING", "CANCEL_AT_PERIOD_END", "PAST_DUE"] } })
    .populate("packageId", "name code version monthlyPrice annualPrice currency entitlements")
    .lean().exec();
  if (!subscription) {
    if (transitionRefund?.subscriptionId) {
      subscription = await SubscriptionModel.findOne({
        _id: transitionRefund.subscriptionId,
        tenantId: new Types.ObjectId(tenantId),
        status: "CANCELED",
      }).populate("packageId", "name code version monthlyPrice annualPrice currency entitlements").lean().exec();
    }
  }
  if (!subscription) throw new AppError(404, NOT_FOUND, "Subscription not found");
  const pendingFilter = { tenantId: new Types.ObjectId(tenantId), status: { $in: ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] as const } };
  const [pending, pendingMutation, counts, canRequestRefund] = await Promise.all([
    BillingOperationModel.findOne(pendingFilter).select("operationType status requestedAt conflictGroup failureCode effectiveAt cancellationType").sort({ createdAt: -1 }).lean().exec(),
    BillingOperationModel.exists({ ...pendingFilter, conflictGroup: "SUBSCRIPTION_MUTATION" }),
    InvoiceModel.aggregate<{ _id: string; count: number }>([
      { $match: { tenantId: new Types.ObjectId(tenantId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    canManageBilling ? refundCapabilitiesForTenant(tenantId) : Promise.resolve(false),
  ]);
  const record = subscription as unknown as Record<string, unknown>;
  const lifecycle = evaluateSubscriptionAccess({
    status: record.status as Parameters<typeof evaluateSubscriptionAccess>[0]["status"],
    now: new Date(),
    periodEnd: dateOrNull(record.currentPeriodEnd ?? record.periodEnd),
    trialEnd: dateOrNull(record.trialEnd),
    cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd),
    pastDueSince: record.status === "PAST_DUE" ? dateOrNull(record.lastProviderEventTimestamp) : null,
    pastDueGraceDays: config.BILLING_PAST_DUE_GRACE_DAYS,
  });
  const byStatus = Object.fromEntries(counts.map((item) => [item._id, item.count]));
  const summary = toCompanyBillingSummary(record, pending, Boolean(pendingMutation), {
    lifecycle,
    invoiceSummary: {
      total: counts.reduce((sum, item) => sum + item.count, 0),
      open: byStatus.open ?? 0,
      paid: byStatus.paid ?? 0,
      pastDue: byStatus.uncollectible ?? 0,
    },
    capabilities: {
      canOpenPortal: canManageBilling && Boolean(record.providerCustomerId) && Boolean(record.providerSubscriptionId) && isBillingPortalFlowAvailable(String(record.provider || ""), "general"),
      canUpdatePaymentMethod: canManageBilling && Boolean(record.providerCustomerId) && Boolean(record.providerSubscriptionId) && isBillingPortalFlowAvailable(String(record.provider || ""), "payment_method_update"),
      canViewInvoices: Boolean(record.providerSubscriptionId),
      canChangePlan: canManageBilling && Boolean(record.providerSubscriptionId) && lifecycle.eligible && !pendingMutation,
      canCancel: canManageBilling && Boolean(record.providerSubscriptionId) && !pendingMutation && ["TRIALING", "ACTIVE", "PAST_DUE"].includes(String(record.status)) && !record.cancelAtPeriodEnd,
      canReactivate: canManageBilling && Boolean(record.providerSubscriptionId) && !pendingMutation && Boolean(record.cancelAtPeriodEnd) && lifecycle.eligible,
      canRequestRefund,
    },
  });
  summary.transitionState = transitionState;
  if (transitionState !== "ACTIVE") {
    summary.canOpenPortal = false;
    summary.canUpdatePaymentMethod = false;
    summary.canChangePlan = false;
    summary.canCancel = false;
    summary.canReactivate = false;
    summary.canRequestRefund = false;
    summary.lifecycle = { eligible: false, inGracePeriod: false, accessEndsAt: null, reason: "REFUND_TRANSITION_PENDING" };
  }
  await getAuditWriter().write({ action: "BILLING_SUMMARY_ACCESSED", resourceType: "Subscription", resourceId: summary.id, tenantId });
  return summary;
}

export async function createCompanyPortalSession(input: {
  tenantId: string;
  flow: "general" | "payment_method_update";
  returnUrl: string;
  provider: PaymentProvider;
  context: OperationAuthorizationContext;
}) {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_MANAGE);
  assertTenant(input.tenantId, actor.tenantId);
  assertBillingPortalReturnUrl(input.returnUrl, config.BILLING_PORTAL_ALLOWED_ORIGIN);
  const subscription = await SubscriptionModel.findOne({
    tenantId: new Types.ObjectId(input.tenantId),
    status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] },
  }).lean().exec();
  if (!subscription?.providerCustomerId) throw new AppError(400, BILLING_PORTAL_UNAVAILABLE, "Billing portal is unavailable");
  if (input.flow === "payment_method_update" && !subscription.providerSubscriptionId) throw new AppError(400, BILLING_PORTAL_UNAVAILABLE, "Payment method update is unavailable");
  assertBillingPortalFlowAvailable(subscription.provider, input.flow);
  const requestReference = input.context.requestId || input.context.traceId || String(Date.now());
  try {
    const session = await input.provider.createBillingPortalSession({
      customerId: subscription.providerCustomerId,
      returnUrl: input.returnUrl,
      flow: input.flow,
      operationContext: {
        idempotencyKey: `portal:${input.tenantId}:${requestReference}`,
        requestFingerprint: createHash("sha256").update(`${input.tenantId}:${input.flow}`).digest("hex"),
        tenantReference: input.tenantId,
        operationReference: requestReference,
        traceId: input.context.traceId,
      },
    });
    assertSafeExternalUrl(session.url);
    await getAuditWriter().write({
      action: input.flow === "payment_method_update" ? "BILLING_PAYMENT_METHOD_PORTAL_SESSION_CREATED" : "BILLING_PORTAL_SESSION_CREATED",
      resourceType: "Subscription",
      resourceId: String(subscription._id),
      tenantId: input.tenantId,
      changes: { flow: input.flow },
    });
    return { url: session.url, expiresAt: session.expiresAt };
  } catch (error) {
    getMetricRecorder().increment("billing.portal.launch_failed", { flow: input.flow });
    if (error instanceof AppError) throw error;
    throw new AppError(503, BILLING_PROVIDER_UNAVAILABLE, "Billing provider is temporarily unavailable");
  }
}

export async function listCompanyInvoices(input: {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: string;
  from?: Date;
  to?: Date;
  subscriptionId?: string;
  context: OperationAuthorizationContext;
}) {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_READ);
  assertTenant(input.tenantId, actor.tenantId);
  const query: Record<string, unknown> = { tenantId: new Types.ObjectId(input.tenantId) };
  if (input.status) query.status = input.status;
  if (input.subscriptionId) query.subscriptionId = new Types.ObjectId(input.subscriptionId);
  if (input.from || input.to) query.createdAtProvider = { ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lte: input.to } : {}) };
  const [invoices, totalRecords] = await Promise.all([
    InvoiceModel.find(query).sort({ createdAtProvider: -1, _id: -1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).lean().exec(),
    InvoiceModel.countDocuments(query),
  ]);
  return {
    invoices: invoices.map((invoice) => invoiceDto(invoice as unknown as Record<string, unknown>)),
    pagination: { page: input.page, pageSize: input.pageSize, totalRecords, totalPages: Math.ceil(totalRecords / input.pageSize) },
  };
}

export async function getCompanyInvoice(invoiceId: string, tenantId: string, context: OperationAuthorizationContext) {
  const actor = await authorizeTenantOperation(context, Permission.BILLING_READ);
  assertTenant(tenantId, actor.tenantId);
  const invoice = await InvoiceModel.findOne({ _id: new Types.ObjectId(invoiceId), tenantId: new Types.ObjectId(tenantId) }).lean().exec();
  if (!invoice) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  return invoiceDto(invoice as unknown as Record<string, unknown>);
}

export async function getCompanyInvoiceLinks(input: { invoiceId: string; tenantId: string; provider: PaymentProvider; context: OperationAuthorizationContext }) {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_READ);
  assertTenant(input.tenantId, actor.tenantId);
  const invoice = await InvoiceModel.findOne({ _id: new Types.ObjectId(input.invoiceId), tenantId: new Types.ObjectId(input.tenantId) }).lean().exec();
  if (!invoice) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  const subscription = invoice.subscriptionId
    ? await SubscriptionModel.findOne({ _id: invoice.subscriptionId, tenantId: new Types.ObjectId(input.tenantId) }).lean().exec()
    : null;
  if (!subscription?.providerCustomerId) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  try {
    const current = await input.provider.retrieveInvoice({ invoiceId: invoice.providerInvoiceId, expectedCustomerId: subscription.providerCustomerId });
    if (current.subscriptionId && current.subscriptionId !== subscription.providerSubscriptionId) {
      throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Provider invoice ownership mismatch");
    }
    const links = await input.provider.getSecureInvoiceLinks({ invoiceId: invoice.providerInvoiceId, expectedCustomerId: subscription.providerCustomerId });
    const safe = { hostedInvoiceUrl: safeLink(links.hostedInvoiceUrl), invoicePdfUrl: safeLink(links.invoicePdfUrl), receiptUrl: safeLink(links.receiptUrl) };
    if (!safe.hostedInvoiceUrl && !safe.invoicePdfUrl && !safe.receiptUrl) throw new AppError(404, BILLING_INVOICE_LINK_UNAVAILABLE, "Invoice links are unavailable");
    await getAuditWriter().write({ action: "BILLING_INVOICE_LINK_ACCESSED", resourceType: "Invoice", resourceId: input.invoiceId, tenantId: input.tenantId, changes: { hosted: Boolean(safe.hostedInvoiceUrl), pdf: Boolean(safe.invoicePdfUrl), receipt: Boolean(safe.receiptUrl) } });
    return safe;
  } catch (error) {
    getMetricRecorder().increment("billing.invoice.link_failed");
    if (error instanceof AppError) throw error;
    throw new AppError(503, BILLING_PROVIDER_UNAVAILABLE, "Billing provider is temporarily unavailable");
  }
}

function invoiceDto(invoice: Record<string, unknown>) {
  const refund = refundInvoiceSummary(invoice);
  return {
    id: String(invoice._id), invoiceNumber: String(invoice.invoiceNumber || ""), status: invoice.status,
    currency: invoice.currency, amountDueMinor: invoice.amountDueMinor, amountPaidMinor: invoice.amountPaidMinor,
    amountRemainingMinor: invoice.amountRemainingMinor, subtotalMinor: invoice.subtotalMinor, taxMinor: invoice.taxMinor,
    createdAt: invoice.createdAtProvider, dueAt: invoice.dueAt, paidAt: invoice.paidAt,
    periodStart: invoice.periodStart, periodEnd: invoice.periodEnd,
    refundedAmountMinor: refund.refundedAmountMinor,
    reservedRefundAmountMinor: refund.reservedRefundAmountMinor,
    retainedConsumedMinor: refund.retainedConsumedMinor,
    grossUnrefundedMinor: refund.grossUnrefundedMinor,
    settlementCompleted: refund.settlementCompleted,
    remainingRefundableMinor: refund.remainingRefundableMinor,
    canRequestRefund: refund.canRequestRefund,
    hostedInvoiceAvailable: Boolean(invoice.hostedInvoiceAvailable), invoicePdfAvailable: Boolean(invoice.invoicePdfAvailable), receiptAvailable: Boolean(invoice.receiptAvailable),
  };
}

function assertTenant(requested: string, authenticated: string): void {
  if (requested !== authenticated) throw new AppError(404, NOT_FOUND, "Billing resource not found");
}
async function hasBillingManage(context: OperationAuthorizationContext): Promise<boolean> {
  try {
    await authorizePermission({ actorId: context.actorId, tenantId: context.tenantId, baseRole: context.actorRole }, Permission.BILLING_MANAGE);
    return true;
  } catch {
    return false;
  }
}
function dateOrNull(value: unknown): Date | null { return value instanceof Date ? value : null; }
function safeLink(value: string | null): string | null { if (!value) return null; assertSafeExternalUrl(value); return value; }
function assertSafeExternalUrl(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError(503, BILLING_PROVIDER_CONFIGURATION_INVALID, "Billing provider configuration is invalid"); }
  if (url.protocol !== "https:" && !(config.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new AppError(503, BILLING_PROVIDER_CONFIGURATION_INVALID, "Billing provider configuration is invalid");
  }
}
