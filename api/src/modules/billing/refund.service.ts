import mongoose, { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  BILLING_INVOICE_NOT_FOUND,
  BILLING_OPERATION_ALREADY_PENDING,
  BILLING_OPERATION_NOT_ALLOWED,
  BILLING_IDEMPOTENCY_KEY_REUSED,
  BILLING_REFUND_REJECTED,
  BILLING_PROVIDER_OWNERSHIP_MISMATCH,
  BILLING_PROVIDER_UNAVAILABLE,
  BILLING_REFUND_AMOUNT_INVALID,
  BILLING_REFUND_NOT_FOUND,
  BILLING_REFUND_AMOUNT_EXCEEDS_ELIGIBILITY,
  BILLING_REFUND_DUPLICATE_PAYMENT_NOT_PROVEN,
  BILLING_REFUND_ELIGIBILITY_CHANGED,
  BILLING_REFUND_ELIGIBILITY_EXPIRED,
  BILLING_REFUND_WINDOW_EXPIRED,
  BILLING_REFUND_USAGE_DATA_UNAVAILABLE,
  NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import BillingOperationModel from "../../db/models/billingOperation.model.js";
import InvoiceModel from "../../db/models/invoice.model.js";
import RefundModel, { type RefundDocument } from "../../db/models/refund.model.js";
import RefundEligibilityPreviewModel from "../../db/models/refundEligibilityPreview.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import PackageModel from "../../db/models/package.model.js";
import { inspectSubscriptionIndexInvariant } from "../../db/subscription-index-invariant.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  authorizeTenantOperation,
  type OperationAuthorizationContext,
  type ResolvedOperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import { BillingOperationService, fingerprintBillingRequest, hashIdempotencyKey, mapBillingProviderError } from "./billing-operation.service.js";
import type { PaymentProvider } from "./ports/payment-provider.port.js";
import { authorizeRefundConfirmation } from "./refund-authorization.policy.js";
import { calculateRefundEligibilitySnapshot, SYSTEM_REFUND_REASON } from "./refund-eligibility.service.js";
import { assertSystemRefundTransitionReady, completeVoluntaryCancellationLocally, isSystemSettlementRefund } from "./voluntary-cancellation-transition.service.js";
import { calculateRemainingRefundableMinor, remainingRefundableMinorExpression } from "./refund-balances.js";

const TENANT_PENDING_REFUND_STATUSES = ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] as const;
const REFUND_REASONS = ["duplicate", "fraudulent", "customer_request", "service_issue", "billing_error", "other"] as const;

type RefundReason = (typeof REFUND_REASONS)[number];

interface InvoiceContext {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  provider: string;
  providerInvoiceId: string;
  paymentReference: string;
  invoiceNumber: string;
  currency: string;
  amountPaidMinor: number;
  refundedAmountMinor: number;
  reservedRefundAmountMinor: number;
  retainedConsumedMinor: number;
  status: string;
}

interface RefundDto {
  id: string;
  tenantId: string;
  tenant: { id: string; name: string | null; slug: string | null };
  invoiceId: string | null;
  invoiceNumber: string | null;
  subscriptionId: string | null;
  subscription: { id: string; status: string | null; packageName: string | null; packageCode: string | null; packageVersion: number | null } | null;
  amountMinor: number;
  currency: string;
  refundableRemainingMinor: number;
  refundedAmountMinor: number;
  reservedRefundAmountMinor: number;
  reason: string;
  requestedBy: { id: string; name: string | null; email: string | null };
  confirmedBy: { id: string; name: string | null; email: string | null } | null;
  requestedAt: Date;
  confirmedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  status: string;
  providerPending: boolean;
  failureCode: string | null;
  operationId: string;
  previousRefundSummary: { successfulCount: number; successfulAmountMinor: number; pendingCount: number; pendingAmountMinor: number };
  settlementCompleted: boolean;
  reasonCode: string;
  maximumEligibleRefundMinor: number;
  subscriptionImpact: string;
  subscriptionImpactStatus: string;
  localTransitionStatus: string;
  retainedConsumedMinor: number;
}

function normalizeReason(reason: string): RefundReason {
  const normalized = reason.trim().toLowerCase().replace(/\s+/g, "_");
  if ((REFUND_REASONS as readonly string[]).includes(normalized)) return normalized as RefundReason;
  if (normalized.length < 3 || normalized.length > 100) {
    throw new AppError(400, BILLING_REFUND_AMOUNT_INVALID, "Refund reason is invalid");
  }
  return "other";
}

function amountFromInput(input: { mode: "FULL" | "PARTIAL"; amountMinor?: number }, invoice: InvoiceContext): number {
  const remaining = refundableRemaining(invoice);
  if (input.mode === "FULL") return remaining;
  if (!Number.isSafeInteger(input.amountMinor) || (input.amountMinor ?? 0) <= 0) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_INVALID, "Refund amount is invalid");
  }
  return input.amountMinor!;
}

function refundableRemaining(invoice: Pick<InvoiceContext, "amountPaidMinor" | "retainedConsumedMinor" | "refundedAmountMinor" | "reservedRefundAmountMinor">): number {
  return calculateRemainingRefundableMinor({ amountPaidMinor: invoice.amountPaidMinor, retainedConsumedMinor: invoice.retainedConsumedMinor, confirmedRefundedMinor: invoice.refundedAmountMinor, pendingReservedMinor: invoice.reservedRefundAmountMinor });
}

async function loadTenantInvoice(invoiceId: string, tenantId: string): Promise<InvoiceContext> {
  if (!Types.ObjectId.isValid(invoiceId)) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  const invoice = await InvoiceModel.findOne({
    _id: new Types.ObjectId(invoiceId),
    tenantId: new Types.ObjectId(tenantId),
  }).select("+paymentReference").lean().exec() as Record<string, unknown> | null;
  if (!invoice) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  return {
    id: String(invoice._id),
    tenantId: String(invoice.tenantId),
    subscriptionId: invoice.subscriptionId ? String(invoice.subscriptionId) : null,
    provider: String(invoice.provider),
    providerInvoiceId: String(invoice.providerInvoiceId),
    paymentReference: String(invoice.paymentReference || ""),
    invoiceNumber: String(invoice.invoiceNumber || ""),
    currency: String(invoice.currency || "").toUpperCase(),
    amountPaidMinor: Number(invoice.amountPaidMinor ?? 0),
    refundedAmountMinor: Number(invoice.refundedAmountMinor ?? 0),
    reservedRefundAmountMinor: Number(invoice.reservedRefundAmountMinor ?? 0),
    retainedConsumedMinor: Number(invoice.retainedConsumedMinor ?? 0),
    status: String(invoice.status || ""),
  };
}

async function ensureRefundableInvoice(invoice: InvoiceContext): Promise<void> {
  if (!["paid", "open", "uncollectible"].includes(invoice.status) || invoice.amountPaidMinor <= 0) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Invoice is not eligible for refund");
  }
  if (refundableRemaining(invoice) <= 0) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_INVALID, "No refundable balance remains");
  }
}

async function loadRefundForTenant(refundId: string, tenantId: string): Promise<RefundDocument> {
  const refund = Types.ObjectId.isValid(refundId)
    ? await RefundModel.findOne({ _id: new Types.ObjectId(refundId), tenantId: new Types.ObjectId(tenantId) }).exec()
    : null;
  if (!refund) throw new AppError(404, BILLING_REFUND_NOT_FOUND, "Refund not found");
  return refund;
}

async function loadRefundForPlatform(refundId: string): Promise<RefundDocument> {
  const refund = Types.ObjectId.isValid(refundId)
    ? await RefundModel.findById(refundId).exec()
    : null;
  if (!refund) throw new AppError(404, BILLING_REFUND_NOT_FOUND, "Refund not found");
  return refund;
}

async function refundActors(refund: RefundDocument) {
  const ids = [refund.requestedBy, refund.confirmedBy].filter(Boolean) as Types.ObjectId[];
  const users = ids.length > 0
    ? await UserModel.find({ _id: { $in: ids } }).select("name email").lean().exec()
    : [];
  const byId = new Map(users.map((user) => [String(user._id), user]));
  const requester = byId.get(String(refund.requestedBy));
  const confirmer = refund.confirmedBy ? byId.get(String(refund.confirmedBy)) : null;
  return {
    requestedBy: {
      id: String(refund.requestedBy),
      name: requester?.name ?? null,
      email: requester?.email ?? null,
    },
    confirmedBy: refund.confirmedBy ? {
      id: String(refund.confirmedBy),
      name: confirmer?.name ?? null,
      email: confirmer?.email ?? null,
    } : null,
  };
}

async function invoiceForRefundDto(refund: RefundDocument) {
  if (!refund.invoiceId) {
    return {
      invoiceNumber: null,
      refundableRemainingMinor: 0,
      refundedAmountMinor: 0,
      reservedRefundAmountMinor: 0,
      retainedConsumedMinor: 0,
      settlementCompleted: false,
      previousRefundSummary: {
        successfulCount: 0,
        successfulAmountMinor: 0,
        pendingCount: 0,
        pendingAmountMinor: 0,
      },
    };
  }
  const [invoice, refunds] = await Promise.all([
    InvoiceModel.findById(refund.invoiceId)
      .select("invoiceNumber amountPaidMinor refundedAmountMinor reservedRefundAmountMinor retainedConsumedMinor")
      .lean()
      .exec(),
    RefundModel.find({ invoiceId: refund.invoiceId, _id: { $ne: refund._id } })
      .select("status amountMinor retainedConsumedMinor")
      .lean()
      .exec(),
  ]);
  if (!invoice) {
    return {
      invoiceNumber: null,
      refundableRemainingMinor: 0,
      refundedAmountMinor: 0,
      reservedRefundAmountMinor: 0,
      retainedConsumedMinor: 0,
      settlementCompleted: false,
      previousRefundSummary: {
        successfulCount: 0,
        successfulAmountMinor: 0,
        pendingCount: 0,
        pendingAmountMinor: 0,
      },
    };
  }
  const previousRefundSummary = refunds.reduce(
    (summary, item) => {
      if (item.status === "SUCCEEDED") {
        summary.successfulCount += 1;
        summary.successfulAmountMinor += Number(item.amountMinor ?? 0);
      } else if (TENANT_PENDING_REFUND_STATUSES.includes(item.status as (typeof TENANT_PENDING_REFUND_STATUSES)[number])) {
        summary.pendingCount += 1;
        summary.pendingAmountMinor += Number(item.amountMinor ?? 0);
      }
      return summary;
    },
    {
      successfulCount: 0,
      successfulAmountMinor: 0,
      pendingCount: 0,
      pendingAmountMinor: 0,
    },
  );
  const amountPaidMinor = Number(invoice.amountPaidMinor ?? 0);
  const refundedAmountMinor = Number(invoice.refundedAmountMinor ?? 0);
  const reservedRefundAmountMinor = Number(invoice.reservedRefundAmountMinor ?? 0);
  const retainedConsumedMinor = Number(invoice.retainedConsumedMinor ?? 0);
  const pendingRetainedConsumedMinor = Math.max(
    Math.max(0, Number(refund.retainedConsumedMinor ?? 0)),
    refunds.reduce((floor, item) => Math.max(floor, Math.max(0, Number(item.retainedConsumedMinor ?? 0))), 0),
  );
  const refundableRemainingMinor = calculateRemainingRefundableMinor({
    amountPaidMinor,
    retainedConsumedMinor,
    pendingRetainedConsumedMinor,
    confirmedRefundedMinor: refundedAmountMinor,
    pendingReservedMinor: reservedRefundAmountMinor,
  });
  return {
    invoiceNumber: String(invoice.invoiceNumber || ""),
    refundableRemainingMinor,
    refundedAmountMinor,
    reservedRefundAmountMinor,
    retainedConsumedMinor,
    settlementCompleted: refundableRemainingMinor === 0 && retainedConsumedMinor > 0 && refundedAmountMinor > 0,
    previousRefundSummary,
  };
}

async function toRefundDto(refund: RefundDocument): Promise<RefundDto> {
  const [actors, invoice, tenant, subscription] = await Promise.all([
    refundActors(refund),
    invoiceForRefundDto(refund),
    TenantModel.findById(refund.tenantId).select("name slug").lean().exec(),
    refund.subscriptionId
      ? SubscriptionModel.findById(refund.subscriptionId)
        .populate("packageId", "name code version")
        .select("status packageVersion packageId")
        .lean()
        .exec()
      : Promise.resolve(null),
  ]);
  const packageRecord = (subscription?.packageId ?? null) as Record<string, unknown> | null;
  return {
    id: String(refund._id),
    tenantId: String(refund.tenantId),
    tenant: {
      id: String(refund.tenantId),
      name: tenant?.name ?? null,
      slug: tenant?.slug ?? null,
    },
    invoiceId: refund.invoiceId ? String(refund.invoiceId) : null,
    invoiceNumber: invoice.invoiceNumber,
    subscriptionId: refund.subscriptionId ? String(refund.subscriptionId) : null,
    subscription: subscription
      ? {
        id: String(subscription._id),
        status: typeof subscription.status === "string" ? subscription.status : null,
        packageName: typeof packageRecord?.name === "string" ? packageRecord.name : null,
        packageCode: typeof packageRecord?.code === "string" ? packageRecord.code : null,
        packageVersion: typeof subscription.packageVersion === "number" ? subscription.packageVersion : null,
      }
      : null,
    amountMinor: refund.amountMinor,
    currency: refund.currency,
    refundableRemainingMinor: invoice.refundableRemainingMinor,
    refundedAmountMinor: invoice.refundedAmountMinor,
    reservedRefundAmountMinor: invoice.reservedRefundAmountMinor,
    reason: refund.reason,
    reasonCode: refund.reasonCode,
    maximumEligibleRefundMinor: refund.maximumEligibleRefundMinor,
    retainedConsumedMinor: invoice.retainedConsumedMinor,
    settlementCompleted: invoice.settlementCompleted,
    subscriptionImpact: refund.subscriptionImpact,
    subscriptionImpactStatus: refund.subscriptionImpactStatus,
    localTransitionStatus: refund.localTransitionStatus,
    requestedBy: actors.requestedBy,
    confirmedBy: actors.confirmedBy,
    requestedAt: refund.requestedAt,
    confirmedAt: refund.confirmedAt,
    rejectedAt: refund.rejectedAt,
    rejectionReason: refund.rejectionReason || null,
    status: refund.status,
    providerPending: refund.status === "PROVIDER_PENDING" || refund.status === "RETRY_PENDING",
    failureCode: refund.failureCode || null,
    operationId: String(refund.operationId),
    previousRefundSummary: invoice.previousRefundSummary,
  };
}

function operationContextFor(
  tenantId: string,
  operationId: string,
  normalizedRequest: Record<string, unknown>,
  traceId?: string,
) {
  return {
    idempotencyKey: `refund:${operationId}`,
    requestFingerprint: fingerprintBillingRequest(normalizedRequest),
    tenantReference: tenantId,
    operationReference: operationId,
    traceId,
  };
}

async function reserveRefundAmountInSession(
  invoiceId: string,
  tenantId: string,
  amountMinor: number,
  session: mongoose.ClientSession,
  consumedFloorMinor = 0,
): Promise<void> {
  const updated = await InvoiceModel.updateOne(
    {
      _id: new Types.ObjectId(invoiceId),
      tenantId: new Types.ObjectId(tenantId),
      $expr: {
        $gte: [
          {
            $subtract: [
              "$amountPaidMinor",
              {
                $add: [
                  "$refundedAmountMinor",
                  "$reservedRefundAmountMinor",
                  consumedFloorMinor,
                ],
              },
            ],
          },
          amountMinor,
        ],
      },
    },
    { $inc: { reservedRefundAmountMinor: amountMinor } },
    { session },
  ).exec();
  if (updated.modifiedCount !== 1) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_INVALID, "Refund exceeds the remaining refundable balance");
  }
}

async function releaseReservedRefundAmount(invoiceId: Types.ObjectId | null, tenantId: Types.ObjectId, amountMinor: number): Promise<void> {
  if (!invoiceId) return;
  await InvoiceModel.updateOne(
    { _id: invoiceId, tenantId },
    [
      {
        $set: {
          reservedRefundAmountMinor: {
            $max: [0, { $subtract: ["$reservedRefundAmountMinor", amountMinor] }],
          },
        },
      },
    ],
    { updatePipeline: true },
  ).exec();
}

async function releaseReservedRefundAmountInSession(
  invoiceId: Types.ObjectId | null,
  tenantId: Types.ObjectId,
  amountMinor: number,
  session: mongoose.ClientSession,
): Promise<void> {
  if (!invoiceId) return;
  await InvoiceModel.updateOne(
    { _id: invoiceId, tenantId },
    [
      {
        $set: {
          reservedRefundAmountMinor: {
            $max: [0, { $subtract: ["$reservedRefundAmountMinor", amountMinor] }],
          },
        },
      },
    ],
    { session, updatePipeline: true },
  ).exec();
}

export async function reconcileInvoiceRefundProjection(
  invoiceId: Types.ObjectId | null,
  tenantId: Types.ObjectId,
  session?: mongoose.ClientSession,
): Promise<void> {
  if (!invoiceId) return;
  const query = RefundModel.find({ invoiceId, tenantId })
    .select("status amountMinor retainedConsumedMinor reasonCode subscriptionImpact maximumEligibleRefundMinor");
  if (session) query.session(session);
  const refunds = await query.lean().exec();
  let confirmedRefundedMinor = 0;
  let pendingReservedMinor = 0;
  let retainedConsumedMinor = 0;
  for (const item of refunds) {
    const amountMinor = Number(item.amountMinor ?? 0);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) continue;
    if (item.status === "SUCCEEDED") {
      confirmedRefundedMinor += amountMinor;
      if (isSystemSettlementRefund(item as Pick<RefundDocument, "reasonCode" | "subscriptionImpact" | "amountMinor" | "maximumEligibleRefundMinor">)) {
        retainedConsumedMinor = Math.max(retainedConsumedMinor, Number(item.retainedConsumedMinor ?? 0));
      }
    } else if (TENANT_PENDING_REFUND_STATUSES.includes(item.status as (typeof TENANT_PENDING_REFUND_STATUSES)[number])) {
      pendingReservedMinor += amountMinor;
    }
  }
  const invoiceQuery = InvoiceModel.findOne({ _id: invoiceId, tenantId }).select("amountPaidMinor");
  if (session) invoiceQuery.session(session);
  const invoice = await invoiceQuery.lean().exec();
  if (!invoice) return;
  const amountPaidMinor = Math.max(0, Number(invoice.amountPaidMinor ?? 0));
  confirmedRefundedMinor = Math.min(amountPaidMinor, confirmedRefundedMinor);
  pendingReservedMinor = Math.min(Math.max(0, amountPaidMinor - confirmedRefundedMinor), pendingReservedMinor);
  retainedConsumedMinor = Math.min(Math.max(0, amountPaidMinor - confirmedRefundedMinor - pendingReservedMinor), Math.max(0, retainedConsumedMinor));
  await InvoiceModel.updateOne(
    { _id: invoiceId, tenantId },
    { $set: { refundedAmountMinor: confirmedRefundedMinor, reservedRefundAmountMinor: pendingReservedMinor, retainedConsumedMinor } },
    { session },
  ).exec();
}

async function ensureInvoicePaymentReference(invoice: InvoiceContext, expectedCustomerId: string, provider: PaymentProvider): Promise<InvoiceContext> {
  if (invoice.paymentReference) return invoice;
  const providerInvoice = await provider.retrieveInvoice({
    invoiceId: invoice.providerInvoiceId,
    expectedCustomerId,
  });
  if (providerInvoice.customerId !== expectedCustomerId) {
    throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Billing provider ownership validation failed");
  }
  const paymentReference = providerInvoice.paymentReference ?? "";
  if (!paymentReference) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Invoice is not eligible for refund");
  }
  await InvoiceModel.updateOne(
    { _id: new Types.ObjectId(invoice.id), tenantId: new Types.ObjectId(invoice.tenantId) },
    { $set: { paymentReference, refundedAmountMinor: Math.max(0, providerInvoice.refundedAmountMinor ?? invoice.refundedAmountMinor) } },
  ).exec();
  return { ...invoice, paymentReference };
}

export async function createRefundRequest(input: {
  tenantId: string;
  previewId?: string;
  /** @deprecated Internal compatibility only. HTTP callers must use previewId. */
  invoiceId?: string;
  mode?: "FULL" | "PARTIAL";
  amountMinor?: number;
  /** @deprecated Internal compatibility only. */
  reason?: string;
  idempotencyKey: string;
  provider: PaymentProvider;
  context: OperationAuthorizationContext;
}): Promise<{ refund: RefundDto; replayed: boolean }> {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_MANAGE);
  if (actor.tenantId !== input.tenantId) throw new AppError(404, NOT_FOUND, "Refund not found");
  const preview = input.previewId && Types.ObjectId.isValid(input.previewId)
    ? await RefundEligibilityPreviewModel.findOne({ _id: new Types.ObjectId(input.previewId), tenantId: new Types.ObjectId(input.tenantId) }).exec()
    : null;
  if (input.previewId && !preview) throw new AppError(404, BILLING_REFUND_NOT_FOUND, "Refund eligibility preview not found");
  if (preview && preview.expiresAt <= new Date() && !preview.consumedAt) throw new AppError(409, BILLING_REFUND_ELIGIBILITY_EXPIRED, "Refund eligibility preview expired");
  const invoiceId = preview ? String(preview.invoiceId) : input.invoiceId;
  if (!invoiceId) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  const invoice = await loadTenantInvoice(invoiceId, input.tenantId);
  const reason = preview?.reason ?? normalizeReason(input.reason ?? "billing_error");
  const systemBalanceRefund = reason === SYSTEM_REFUND_REASON;
  if (systemBalanceRefund && (input.amountMinor !== undefined || input.mode !== undefined || input.reason !== undefined)) {
    throw new AppError(400, BILLING_REFUND_AMOUNT_INVALID, "Refund amount, type, reason, and impact are calculated by the server");
  }
  if (!systemBalanceRefund && !input.mode) {
    throw new AppError(400, BILLING_REFUND_AMOUNT_INVALID, "Refund mode is required");
  }
  let maximumEligibleRefundMinor = refundableRemaining(invoice);
  let currentEligibility: Awaited<ReturnType<typeof calculateRefundEligibilitySnapshot>> | null = null;
  if (preview && !preview.consumedAt) {
    currentEligibility = await calculateRefundEligibilitySnapshot({ tenantId: input.tenantId, invoiceId: invoice.id, reason: preview.reason });
    if (currentEligibility.decisionReason === "REFUND_WINDOW_EXPIRED") {
      throw new AppError(409, BILLING_REFUND_WINDOW_EXPIRED, "Refunds are only available within 7 days of the subscription payment");
    }
    const usageChanged = JSON.stringify(currentEligibility.includedUsageMetrics) !== JSON.stringify(preview.includedUsageMetrics.map((metric) => ({ dimension: metric.dimension, usage: metric.usage, limit: metric.limit, ratioBps: metric.ratioBps })));
    if (currentEligibility.subscriptionRevision !== preview.subscriptionRevision || currentEligibility.amountPaidMinor !== preview.amountPaidMinor || currentEligibility.currency !== preview.currency || currentEligibility.maximumEligibleRefundMinor !== preview.maximumEligibleRefundMinor || usageChanged) {
      throw new AppError(409, BILLING_REFUND_ELIGIBILITY_CHANGED, "Refund eligibility changed", { maximumEligibleRefundMinor: currentEligibility.maximumEligibleRefundMinor });
    }
    if (currentEligibility.reviewRequired) throw new AppError(409, BILLING_REFUND_USAGE_DATA_UNAVAILABLE, "Authoritative usage data is unavailable");
    if (currentEligibility.decisionReason === "DUPLICATE_PAYMENT_NOT_PROVEN") throw new AppError(409, BILLING_REFUND_DUPLICATE_PAYMENT_NOT_PROVEN, "Duplicate payment was not proven");
    maximumEligibleRefundMinor = currentEligibility.maximumEligibleRefundMinor;
  } else if (preview) {
    maximumEligibleRefundMinor = preview.maximumEligibleRefundMinor;
  }
  const priorOperation = await BillingOperationModel.findOne({
    tenantId: new Types.ObjectId(input.tenantId),
    idempotencyKeyHash: hashIdempotencyKey(input.idempotencyKey),
    operationType: "REFUND",
  }).select("+requestFingerprint").exec();
  if (priorOperation) {
    const existingRefund = await RefundModel.findOne({
      operationId: priorOperation._id,
      tenantId: new Types.ObjectId(input.tenantId),
    }).exec();
    if (!existingRefund) {
      throw new AppError(409, BILLING_OPERATION_ALREADY_PENDING, "Refund request replay is incomplete");
    }
    const replayAmountMinor = systemBalanceRefund
      ? existingRefund.amountMinor
      : input.mode === "FULL"
      ? existingRefund.amountMinor
      : input.amountMinor;
    const replayFingerprint = fingerprintBillingRequest({
      invoiceId: invoice.id,
      mode: systemBalanceRefund ? "CALCULATED" : input.mode,
      amountMinor: replayAmountMinor,
      currency: invoice.currency,
      reason,
      ...(preview ? { previewId: String(preview._id) } : {}),
    });
    if (priorOperation.requestFingerprint !== replayFingerprint) {
      throw new AppError(409, BILLING_IDEMPOTENCY_KEY_REUSED, "Billing idempotency key was reused for another request");
    }
    return { refund: await toRefundDto(existingRefund), replayed: true };
  }

  await ensureRefundableInvoice(invoice);
  const financialRemaining = refundableRemaining(invoice);
  const amountMinor = systemBalanceRefund
    ? maximumEligibleRefundMinor
    : input.mode === "FULL"
    ? maximumEligibleRefundMinor
    : amountFromInput({ mode: input.mode!, amountMinor: input.amountMinor }, invoice);
  if (amountMinor <= 0 || amountMinor > refundableRemaining(invoice)) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_INVALID, "Refund amount is invalid");
  }
  if (amountMinor > maximumEligibleRefundMinor || (input.mode === "FULL" && maximumEligibleRefundMinor !== financialRemaining)) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_EXCEEDS_ELIGIBILITY, "Refund amount exceeds current eligibility", { maximumEligibleRefundMinor });
  }

  const normalizedRequest = {
    invoiceId: invoice.id,
    mode: systemBalanceRefund ? "CALCULATED" : input.mode,
    amountMinor,
    currency: invoice.currency,
    reason,
    ...(preview ? { previewId: String(preview._id) } : {}),
  };
  const operationService = new BillingOperationService();
  let createdRefund: RefundDocument | null = null;
  let replayedRefund: RefundDocument | null = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const started = await operationService.begin({
        tenantId: input.tenantId,
        actor,
        operationType: "REFUND",
        idempotencyKey: input.idempotencyKey,
        normalizedRequest,
        subscriptionId: invoice.subscriptionId ?? undefined,
        provider: invoice.provider,
      }, { session });
      if (started.replayed) {
        replayedRefund = await RefundModel.findOne({
          operationId: started.operation._id,
          tenantId: new Types.ObjectId(input.tenantId),
        }).session(session).exec();
        if (!replayedRefund) {
          throw new AppError(409, BILLING_OPERATION_ALREADY_PENDING, "Refund request replay is incomplete");
        }
        return;
      }

      const duplicatePending = await RefundModel.exists({
        tenantId: new Types.ObjectId(input.tenantId),
        ...(systemBalanceRefund
          ? { subscriptionId: invoice.subscriptionId ? new Types.ObjectId(invoice.subscriptionId) : null, reasonCode: SYSTEM_REFUND_REASON }
          : { invoiceId: new Types.ObjectId(invoice.id), amountMinor, reason }),
        status: { $in: TENANT_PENDING_REFUND_STATUSES },
      }).session(session);
      if (duplicatePending) {
        throw new AppError(409, BILLING_OPERATION_ALREADY_PENDING, "A refund request is already pending");
      }
      const consumedFloorMinor = Math.max(
        Number(invoice.retainedConsumedMinor ?? 0),
        currentEligibility?.consumedValueMinor ?? preview?.consumedValueMinor ?? 0,
      );
      await reserveRefundAmountInSession(invoice.id, input.tenantId, amountMinor, session, consumedFloorMinor);
      const [refund] = await RefundModel.create([{
        tenantId: new Types.ObjectId(input.tenantId),
        invoiceId: new Types.ObjectId(invoice.id),
        paymentReference: invoice.paymentReference,
        subscriptionId: invoice.subscriptionId ? new Types.ObjectId(invoice.subscriptionId) : null,
        operationId: started.operation._id,
        amountMinor,
        currency: invoice.currency,
        reason,
        reasonCode: preview?.reason ?? "BILLING_ERROR",
        explanation: preview?.explanation ?? "",
        eligibilityPreviewId: preview?._id ?? null,
        eligibilityPolicyVersion: preview?.policyVersion ?? "legacy",
        eligibilitySnapshotHash: preview?.snapshotHash ?? "",
        maximumEligibleRefundMinor,
        retainedConsumedMinor: systemBalanceRefund ? Math.max(0, preview?.consumedValueMinor ?? 0) : 0,
        subscriptionImpact: preview?.subscriptionImpact ?? "NONE",
        subscriptionImpactStatus: preview?.subscriptionImpact === "CANCEL_IMMEDIATELY_AFTER_REFUND" || preview?.subscriptionImpact === "CANCEL_AND_MOVE_TO_FREE" ? "PENDING" : "NOT_REQUIRED",
        requestedBy: new Types.ObjectId(actor.actorId),
        provider: invoice.provider,
        status: "REQUESTED",
      }], { session });
      createdRefund = refund;
      if (preview) {
        const consumed = await RefundEligibilityPreviewModel.updateOne(
          { _id: preview._id, tenantId: preview.tenantId, consumedAt: null },
          { $set: { consumedAt: new Date(), consumedByRefundId: refund._id } },
          { session },
        );
        if (consumed.modifiedCount !== 1) throw new AppError(409, BILLING_REFUND_ELIGIBILITY_CHANGED, "Refund eligibility preview was already consumed");
      }
    });
    if (replayedRefund) {
      return { refund: await toRefundDto(replayedRefund), replayed: true };
    }
    await getAuditWriter().write({
      action: "BILLING_REFUND_REQUESTED",
      resourceType: "Refund",
      resourceId: String(createdRefund!._id),
      tenantId: input.tenantId,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      changes: { invoiceId: invoice.id, amountMinor, currency: invoice.currency, reason },
    });
    if (systemBalanceRefund) {
      try {
        await executeApprovedRefund(createdRefund!, input.provider, actor, input.context.traceId);
        const executed = await loadRefundForTenant(String(createdRefund!._id), input.tenantId);
        if (executed.status === "PROVIDER_PENDING" && executed.providerRefundId) {
          // Providers commonly confirm card refunds immediately. Settle inline
          // so the caller sees the final state; the refund webhook remains the
          // fallback settlement path when this stays pending.
          try {
            await synchronizeRefundFromProvider({
              provider: input.provider,
              providerRefundId: String(executed.providerRefundId),
              operationReference: String(executed.operationId),
              sourceEventId: `self-serve-refund:${String(executed._id)}`,
              tenantIdHint: input.tenantId,
            });
          } catch {
            // Webhook/reconciliation will settle the refund later.
          }
        }
        return { refund: await toRefundDto(await loadRefundForTenant(String(createdRefund!._id), input.tenantId)), replayed: false };
      } catch {
        return { refund: await toRefundDto(await loadRefundForTenant(String(createdRefund!._id), input.tenantId)), replayed: false };
      }
    }
    return { refund: await toRefundDto(createdRefund!), replayed: false };
  } finally {
    await session.endSession();
  }
}

export async function listTenantRefundRequests(input: {
  tenantId: string;
  page: number;
  pageSize: number;
  context: OperationAuthorizationContext;
}): Promise<{ refunds: RefundDto[]; pagination: { page: number; pageSize: number; totalRecords: number; totalPages: number } }> {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_READ);
  if (actor.tenantId !== input.tenantId) throw new AppError(404, NOT_FOUND, "Refund not found");
  const query = { tenantId: new Types.ObjectId(input.tenantId) };
  const [refunds, totalRecords] = await Promise.all([
    RefundModel.find(query).sort({ createdAt: -1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).exec(),
    RefundModel.countDocuments(query),
  ]);
  return {
    refunds: await Promise.all(refunds.map((refund) => toRefundDto(refund))),
    pagination: { page: input.page, pageSize: input.pageSize, totalRecords, totalPages: Math.max(1, Math.ceil(totalRecords / input.pageSize)) },
  };
}

export async function getTenantRefundRequest(input: {
  tenantId: string;
  refundId: string;
  context: OperationAuthorizationContext;
}): Promise<RefundDto> {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_READ);
  if (actor.tenantId !== input.tenantId) throw new AppError(404, NOT_FOUND, "Refund not found");
  const refund = await loadRefundForTenant(input.refundId, input.tenantId);
  await getAuditWriter().write({
    action: "BILLING_REFUND_VIEWED",
    resourceType: "Refund",
    resourceId: String(refund._id),
    tenantId: input.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
  });
  return toRefundDto(refund);
}

export async function listPlatformRefunds(input: {
  page: number;
  pageSize: number;
  status?: string;
  tenantId?: string;
  context: OperationAuthorizationContext;
}): Promise<{ refunds: RefundDto[]; pagination: { page: number; pageSize: number; totalRecords: number; totalPages: number } }> {
  await authorizePlatformOperation(input.context, Permission.BILLING_READ);
  const query: Record<string, unknown> = {};
  if (input.status) query.status = input.status;
  if (input.tenantId && Types.ObjectId.isValid(input.tenantId)) query.tenantId = new Types.ObjectId(input.tenantId);
  const [refunds, totalRecords] = await Promise.all([
    RefundModel.find(query).sort({ createdAt: -1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).exec(),
    RefundModel.countDocuments(query),
  ]);
  return {
    refunds: await Promise.all(refunds.map((refund) => toRefundDto(refund))),
    pagination: { page: input.page, pageSize: input.pageSize, totalRecords, totalPages: Math.max(1, Math.ceil(totalRecords / input.pageSize)) },
  };
}

export async function getPlatformRefund(input: {
  refundId: string;
  context: OperationAuthorizationContext;
}): Promise<RefundDto> {
  const actor = await authorizePlatformOperation(input.context, Permission.BILLING_READ);
  const refund = await loadRefundForPlatform(input.refundId);
  await getAuditWriter().write({
    action: "BILLING_REFUND_VIEWED",
    resourceType: "Refund",
    resourceId: String(refund._id),
    tenantId: String(refund.tenantId),
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
  });
  return toRefundDto(refund);
}

export async function rejectRefundRequest(input: {
  refundId: string;
  reason: string;
  context: OperationAuthorizationContext;
}): Promise<RefundDto> {
  const refund = await loadRefundForPlatform(input.refundId);
  const actor = await authorizeRefundConfirmation(input.context, String(refund.requestedBy));
  if (refund.status !== "REQUESTED") throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund can no longer be rejected");
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const updatedRefund = await RefundModel.findOneAndUpdate(
        { _id: refund._id, tenantId: refund.tenantId, status: "REQUESTED" },
        {
          $set: {
            status: "REJECTED",
            rejectedAt: new Date(),
            rejectionReason: input.reason.trim(),
            confirmedBy: new Types.ObjectId(actor.actorId),
          },
        },
        { session, returnDocument: "after" },
      ).exec();
      if (!updatedRefund) {
        throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund can no longer be rejected");
      }
      refund.status = updatedRefund.status;
      refund.rejectedAt = updatedRefund.rejectedAt;
      refund.rejectionReason = updatedRefund.rejectionReason;
      refund.confirmedBy = updatedRefund.confirmedBy;
      await releaseReservedRefundAmountInSession(updatedRefund.invoiceId, updatedRefund.tenantId, updatedRefund.amountMinor, session);
      await new BillingOperationService().fail(String(updatedRefund.operationId), String(updatedRefund.tenantId), BILLING_REFUND_REJECTED, { session });
    });
  } finally {
    await session.endSession();
  }
  await getAuditWriter().write({
    action: "BILLING_REFUND_REJECTED",
    resourceType: "Refund",
    resourceId: String(refund._id),
    tenantId: String(refund.tenantId),
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    changes: { status: "REJECTED", reason: refund.rejectionReason },
  });
  return toRefundDto(refund);
}

async function loadRefundExecutionContext(refund: RefundDocument) {
  const invoice = refund.invoiceId ? await InvoiceModel.findOne({
    _id: refund.invoiceId,
    tenantId: refund.tenantId,
    ...(refund.subscriptionId ? { subscriptionId: refund.subscriptionId } : {}),
  }).select("+paymentReference").lean().exec() as Record<string, unknown> | null : null;
  if (!invoice) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  const subscription = refund.subscriptionId
    ? await SubscriptionModel.findOne({ _id: refund.subscriptionId, tenantId: refund.tenantId }).select("providerCustomerId providerSubscriptionId provider").lean().exec() as Record<string, unknown> | null
    : null;
  if (!subscription?.providerCustomerId) throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund cannot be executed for this invoice");
  return {
    invoice: {
      id: String(invoice._id),
      tenantId: String(invoice.tenantId),
      subscriptionId: invoice.subscriptionId ? String(invoice.subscriptionId) : null,
      provider: String(invoice.provider || refund.provider),
      providerInvoiceId: String(invoice.providerInvoiceId || ""),
      paymentReference: String(invoice.paymentReference || refund.paymentReference || ""),
      invoiceNumber: String(invoice.invoiceNumber || ""),
      currency: String(invoice.currency || refund.currency).toUpperCase(),
      amountPaidMinor: Number(invoice.amountPaidMinor ?? 0),
      refundedAmountMinor: Number(invoice.refundedAmountMinor ?? 0),
      reservedRefundAmountMinor: Number(invoice.reservedRefundAmountMinor ?? 0),
      retainedConsumedMinor: Number(invoice.retainedConsumedMinor ?? 0),
      status: String(invoice.status || ""),
    } satisfies InvoiceContext,
    expectedCustomerId: String(subscription.providerCustomerId),
  };
}

async function ensureRefundSubscriptionImpact(refund: RefundDocument, provider: PaymentProvider): Promise<void> {
  if (!["CANCEL_IMMEDIATELY_AFTER_REFUND", "CANCEL_AND_MOVE_TO_FREE"].includes(refund.subscriptionImpact) || refund.subscriptionImpactStatus === "SUCCEEDED") return;
  if (!refund.subscriptionId) {
    refund.subscriptionImpactStatus = "FAILED";
    await refund.save();
    return;
  }
  const subscription = await SubscriptionModel.findOne({ _id: refund.subscriptionId, tenantId: refund.tenantId })
    .select("provider providerCustomerId providerSubscriptionId revision status")
    .lean().exec();
  if (!subscription?.providerCustomerId || !subscription.providerSubscriptionId) {
    refund.subscriptionImpactStatus = "FAILED";
    await refund.save();
    return;
  }
  const idempotencyKey = `refund-impact:${String(refund._id)}`;
  const normalizedRequest = { refundId: String(refund._id), subscriptionId: String(subscription._id), cancellationType: "IMMEDIATE" };
  const invokeCancellation = (operation: { _id: unknown }) => provider.cancelImmediately({
    subscriptionId: subscription.providerSubscriptionId,
    expectedCustomerId: subscription.providerCustomerId,
    operationContext: {
      idempotencyKey,
      requestFingerprint: fingerprintBillingRequest(normalizedRequest),
      tenantReference: String(refund.tenantId), operationReference: String(operation._id), traceId: "refund-impact",
    },
  });
  try {
    const operationService = new BillingOperationService();
    if (refund.subscriptionImpactOperationId) {
      const existing = await BillingOperationModel.findOne({
        _id: refund.subscriptionImpactOperationId,
        tenantId: refund.tenantId,
        operationType: "CANCEL_IMMEDIATELY",
      }).exec();
      if (!existing) throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund transition operation is unavailable");
      if (existing.status === "CONFIRMED") {
        refund.subscriptionImpactStatus = "SUCCEEDED";
        await refund.save();
        return;
      }
      if (existing.status === "RETRY_PENDING") {
        const resumed = await operationService.resume(String(existing._id), String(refund.tenantId), invokeCancellation);
        refund.subscriptionImpactStatus = resumed.operation.status === "RETRY_PENDING" ? "RETRY_PENDING" : "PENDING";
        await refund.save();
        return;
      }
      if (existing.status === "PROVIDER_PENDING" && provider.retrieveCurrentSubscriptionState) {
        const state = await provider.retrieveCurrentSubscriptionState({
          subscriptionId: subscription.providerSubscriptionId,
          expectedCustomerId: subscription.providerCustomerId,
        });
        if (state.status === "canceled") {
          await operationService.confirm(String(existing._id), String(refund.tenantId), `refund-impact-reconciliation:${String(refund._id)}`);
          refund.subscriptionImpactStatus = "SUCCEEDED";
          await refund.save();
        }
        return;
      }
      return;
    }
    const started = await operationService.execute({
      tenantId: String(refund.tenantId),
      actor: { tenantId: String(refund.tenantId), actorId: String(refund.confirmedBy ?? refund.requestedBy), actorEmail: "", actorRole: "SUPER_ADMIN" },
      operationType: "CANCEL_IMMEDIATELY", idempotencyKey, normalizedRequest,
      subscriptionId: String(subscription._id), provider: subscription.provider,
      expectedSubscriptionRevision: subscription.revision, cancellationType: "IMMEDIATE",
    }, invokeCancellation);
    refund.subscriptionImpactOperationId = started.operation._id;
    refund.subscriptionImpactStatus = started.operation.status === "RETRY_PENDING" ? "RETRY_PENDING" : "PENDING";
  } catch (error) {
    refund.subscriptionImpactStatus = error instanceof AppError && error.statusCode >= 500 ? "RETRY_PENDING" : "FAILED";
  }
  await refund.save();
  await getAuditWriter().write({
    action: "BILLING_REFUND_SUBSCRIPTION_IMPACT_REQUESTED", resourceType: "Refund", resourceId: String(refund._id), tenantId: String(refund.tenantId),
    changes: { subscriptionImpact: refund.subscriptionImpact, subscriptionImpactStatus: refund.subscriptionImpactStatus },
  });
}

async function executeApprovedRefund(
  refund: RefundDocument,
  provider: PaymentProvider,
  actor: Pick<ResolvedOperationAuthorizationContext, "actorId" | "actorEmail" | "actorRole">,
  traceId?: string,
): Promise<{ refund: RefundDto; replayed: boolean }> {
  const { invoice, expectedCustomerId } = await loadRefundExecutionContext(refund);
  const refreshedInvoice = await ensureInvoicePaymentReference(invoice, expectedCustomerId, provider);
  if (refreshedInvoice.reservedRefundAmountMinor < refund.amountMinor) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund reservation is no longer held");
  }
  const availableForConfirmation = Math.max(
    0,
    refreshedInvoice.amountPaidMinor
      - refreshedInvoice.refundedAmountMinor
      - Math.max(0, refreshedInvoice.reservedRefundAmountMinor - refund.amountMinor),
  );
  if (
    !["paid", "open", "uncollectible"].includes(refreshedInvoice.status)
    || refreshedInvoice.amountPaidMinor <= 0
    || refund.currency !== refreshedInvoice.currency
    || refund.amountMinor > availableForConfirmation
  ) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_INVALID, "Refund amount is invalid");
  }
  if (isSystemSettlementRefund(refund)) {
    if (!refund.subscriptionId) throw new AppError(503, BILLING_OPERATION_NOT_ALLOWED, "Refund transition is temporarily unavailable");
    await assertSystemRefundTransitionReady({
      tenantId: String(refund.tenantId),
      subscriptionId: String(refund.subscriptionId),
      refund: { subscriptionImpactStatus: refund.subscriptionImpactStatus, localTransitionStatus: refund.localTransitionStatus },
    });
  }
  const operation = await BillingOperationModel.findOne({ _id: refund.operationId, tenantId: refund.tenantId }).select("+requestFingerprint").exec();
  if (!operation) throw new AppError(404, BILLING_REFUND_NOT_FOUND, "Refund operation not found");
  const operationService = new BillingOperationService();
  const session = await mongoose.startSession();
  let pendingOperationId = String(operation._id);
  const invoiceForExecution = refreshedInvoice;
  try {
    await session.withTransaction(async () => {
      const pending = await operationService.markProviderPending(operation, { session });
      pendingOperationId = String(pending._id);
      const updatedRefund = await RefundModel.findOneAndUpdate(
        { _id: refund._id, tenantId: refund.tenantId, status: "REQUESTED" },
        {
          $set: {
            status: "PROVIDER_PENDING",
            confirmedBy: new Types.ObjectId(actor.actorId),
            confirmedAt: new Date(),
            failureCode: "",
            paymentReference: invoiceForExecution.paymentReference,
          },
        },
        { session, returnDocument: "after" },
      ).exec();
      if (!updatedRefund) {
        throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund can no longer be confirmed");
      }
      refund.status = updatedRefund.status;
      refund.confirmedBy = updatedRefund.confirmedBy;
      refund.confirmedAt = updatedRefund.confirmedAt;
      refund.failureCode = updatedRefund.failureCode;
      refund.paymentReference = updatedRefund.paymentReference;
    });
  } finally {
    await session.endSession();
  }
  const normalizedRequest = {
    refundId: String(refund._id),
    invoiceId: refreshedInvoice.id,
    amountMinor: refund.amountMinor,
    currency: refund.currency,
    reason: refund.reason,
  };
  try {
    const result = await provider.createRefund({
      chargeId: refreshedInvoice.paymentReference,
      expectedCustomerId,
      amountMinor: refund.amountMinor,
      currency: refund.currency,
      reason: refund.reason,
      operationContext: operationContextFor(String(refund.tenantId), String(refund.operationId), normalizedRequest, traceId),
    });
    await operationService.recordProviderResult(pendingOperationId, String(refund.tenantId), {
      operationReference: result.refund.id,
      objectReference: result.refund.id,
    });
    refund.providerRefundId = result.refund.id;
    refund.providerStatus = result.refund.status;
    await refund.save();
    await getAuditWriter().write({
      action: "BILLING_REFUND_APPROVED",
      resourceType: "Refund",
      resourceId: String(refund._id),
      tenantId: String(refund.tenantId),
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      changes: { status: "PROVIDER_PENDING", amountMinor: refund.amountMinor, currency: refund.currency },
    });
    return { refund: await toRefundDto(refund), replayed: false };
  } catch (error) {
    const mapped = mapBillingProviderError(error);
    if (mapped.statusCode >= 500) {
      await operationService.markRetryPending(pendingOperationId, String(refund.tenantId), mapped.code, new Date(Date.now() + 60_000));
      refund.status = "RETRY_PENDING";
      await getAuditWriter().write({
        action: "BILLING_REFUND_RETRY_SCHEDULED",
        resourceType: "Refund",
        resourceId: String(refund._id),
        tenantId: String(refund.tenantId),
        actorId: actor.actorId,
        actorEmail: actor.actorEmail,
        actorRole: actor.actorRole,
        changes: { failureCode: mapped.code },
      });
    } else {
      await operationService.fail(pendingOperationId, String(refund.tenantId), mapped.code);
      refund.status = "FAILED";
      await releaseReservedRefundAmount(refund.invoiceId, refund.tenantId, refund.amountMinor);
    }
    refund.failureCode = mapped.code;
    await refund.save();
    throw mapped;
  }
}

export async function confirmRefundRequest(input: {
  refundId: string;
  provider: PaymentProvider;
  context: OperationAuthorizationContext;
}): Promise<{ refund: RefundDto; replayed: boolean }> {
  const refund = await loadRefundForPlatform(input.refundId);
  const actor = await authorizeRefundConfirmation(input.context, String(refund.requestedBy));
  if (refund.status !== "REQUESTED") throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund can no longer be confirmed");
  return executeApprovedRefund(refund, input.provider, actor, input.context.traceId);
}

export async function retryRefundRequest(input: {
  refundId: string;
  provider: PaymentProvider;
  context: OperationAuthorizationContext;
}): Promise<RefundDto> {
  const refund = await loadRefundForPlatform(input.refundId);
  const actor = await authorizeRefundConfirmation(input.context, String(refund.requestedBy));
  if (refund.providerRefundId) {
    const synchronized = await synchronizeRefundFromProvider({
      provider: input.provider, providerRefundId: refund.providerRefundId,
      operationReference: String(refund.operationId), sourceEventId: `manual-reconciliation:${String(refund._id)}`,
      tenantIdHint: String(refund.tenantId),
    });
    if (synchronized.status === "SUCCEEDED" || synchronized.status === "PROVIDER_PENDING") {
      return toRefundDto(await loadRefundForPlatform(input.refundId));
    }
  }
  const operation = await BillingOperationModel.findOne({ _id: refund.operationId, tenantId: refund.tenantId }).exec();
  if (!operation || operation.status !== "RETRY_PENDING" || refund.status !== "RETRY_PENDING") {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund is not retryable");
  }
  const { invoice, expectedCustomerId } = await loadRefundExecutionContext(refund);
  const refreshedInvoice = await ensureInvoicePaymentReference(invoice, expectedCustomerId, input.provider);
  if (isSystemSettlementRefund(refund)) {
    if (!refund.subscriptionId) throw new AppError(503, BILLING_OPERATION_NOT_ALLOWED, "Refund transition is temporarily unavailable");
    await assertSystemRefundTransitionReady({
      tenantId: String(refund.tenantId),
      subscriptionId: String(refund.subscriptionId),
      refund: { subscriptionImpactStatus: refund.subscriptionImpactStatus, localTransitionStatus: refund.localTransitionStatus },
    });
  }
  try {
    const resumed = await new BillingOperationService().resume(String(operation._id), String(refund.tenantId), async () => input.provider.createRefund({
      chargeId: refreshedInvoice.paymentReference,
      expectedCustomerId,
      amountMinor: refund.amountMinor,
      currency: refund.currency,
      reason: refund.reason,
      operationContext: operationContextFor(String(refund.tenantId), String(refund.operationId), {
        refundId: String(refund._id),
        invoiceId: refreshedInvoice.id,
        amountMinor: refund.amountMinor,
        currency: refund.currency,
        reason: refund.reason,
      }, input.context.traceId),
    }).then((result) => ({
      operationReference: result.refund.id,
      state: { id: result.refund.id },
    })));
    refund.status = "PROVIDER_PENDING";
    refund.failureCode = "";
    refund.providerRefundId = resumed.result.operationReference;
    await refund.save();
    await getAuditWriter().write({
      action: "BILLING_REFUND_RETRY_EXECUTED",
      resourceType: "Refund",
      resourceId: String(refund._id),
      tenantId: String(refund.tenantId),
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      changes: { status: "PROVIDER_PENDING" },
    });
    return toRefundDto(refund);
  } catch (error) {
    throw mapBillingProviderError(error);
  }
}

export async function synchronizeRefundFromProvider(input: {
  provider: PaymentProvider;
  providerRefundId: string;
  operationReference?: string;
  sourceEventId: string;
  tenantIdHint?: string;
}): Promise<{ refundId: string; status: string }> {
  let refund = input.operationReference && Types.ObjectId.isValid(input.operationReference)
    ? await RefundModel.findOne({ operationId: new Types.ObjectId(input.operationReference) }).exec()
    : null;
  if (!refund) {
    refund = await RefundModel.findOne({ providerRefundId: input.providerRefundId }).exec();
  }
  if (!refund) throw new AppError(404, BILLING_REFUND_NOT_FOUND, "Refund not found");
  if (input.tenantIdHint && String(refund.tenantId) !== input.tenantIdHint) {
    throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Billing provider ownership validation failed");
  }
  const { invoice, expectedCustomerId } = await loadRefundExecutionContext(refund);
  const providerRefund = await input.provider.retrieveRefund({ refundId: input.providerRefundId, expectedCustomerId });
  if (invoice.paymentReference && providerRefund.chargeId !== invoice.paymentReference) {
    throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Billing provider ownership validation failed");
  }
  if (providerRefund.amountMinor !== refund.amountMinor) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_INVALID, "Refund amount is invalid");
  }
  if (providerRefund.currency.toUpperCase() !== refund.currency.toUpperCase() || providerRefund.currency.toUpperCase() !== invoice.currency.toUpperCase()) {
    throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Billing provider ownership validation failed");
  }

  refund.providerRefundId = providerRefund.id;
  refund.providerStatus = providerRefund.status;
  if (providerRefund.status === "succeeded") {
    const session = await mongoose.startSession();
    let transitioned = false;
    try {
      await session.withTransaction(async () => {
        const claimed = await RefundModel.findOneAndUpdate(
          { _id: refund!._id, status: { $ne: "SUCCEEDED" } },
          { $set: { status: "SUCCEEDED", failureCode: "", providerRefundId: providerRefund.id, providerStatus: providerRefund.status } },
          { returnDocument: "after", session },
        ).exec();
        const authoritativeRefund = claimed ?? await RefundModel.findById(refund!._id).session(session).exec();
        if (!authoritativeRefund || authoritativeRefund.status !== "SUCCEEDED") return;
        await reconcileInvoiceRefundProjection(authoritativeRefund.invoiceId, authoritativeRefund.tenantId, session);
        if (claimed) {
          await new BillingOperationService().confirm(String(claimed.operationId), String(claimed.tenantId), input.sourceEventId, { session });
          transitioned = true;
        }
      });
    } finally {
      await session.endSession();
    }
    refund = await RefundModel.findById(refund._id).exec();
    if (!refund) throw new AppError(404, BILLING_REFUND_NOT_FOUND, "Refund not found");
    if (transitioned) {
      await getAuditWriter().write({ action: "BILLING_REFUND_CONFIRMED", resourceType: "Refund", resourceId: String(refund._id), tenantId: String(refund.tenantId), changes: { status: "SUCCEEDED" } });
    }
  } else if (providerRefund.status === "failed" || providerRefund.status === "canceled") {
    if (refund.status !== "FAILED") {
      await releaseReservedRefundAmount(refund.invoiceId, refund.tenantId, refund.amountMinor);
    }
    refund.status = "FAILED";
    refund.failureCode = providerRefund.status === "canceled" ? "BILLING_REFUND_CANCELED" : BILLING_PROVIDER_UNAVAILABLE;
    await new BillingOperationService().fail(String(refund.operationId), String(refund.tenantId), refund.failureCode);
    await getAuditWriter().write({ action: "BILLING_REFUND_FAILED", resourceType: "Refund", resourceId: String(refund._id), tenantId: String(refund.tenantId), changes: { status: "FAILED", failureCode: refund.failureCode } });
  } else {
    refund.status = "PROVIDER_PENDING";
  }
  if (providerRefund.status !== "succeeded") await refund.save();
  let systemSettlementComplete = true;
  if (refund.status === "SUCCEEDED" && isSystemSettlementRefund(refund)) {
    let localTransitionReady = true;
    try {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => { systemSettlementComplete = await completeVoluntaryCancellationLocally(refund!, session); });
      } finally {
        await session.endSession();
      }
    } catch {
      localTransitionReady = false;
      // The transaction rolled back. Preserve the effective paid record, mark
      // the transition retryable, and let entitlement reads fail closed from
      // this durable state until reconciliation succeeds.
      refund.localTransitionStatus = "RETRY_PENDING";
      refund.subscriptionImpactStatus = "RETRY_PENDING";
      await refund.save();
    }
    if (!localTransitionReady || !systemSettlementComplete) return { refundId: String(refund._id), status: refund.status };
  }
  if (refund.status === "SUCCEEDED" && systemSettlementComplete) await ensureRefundSubscriptionImpact(refund, input.provider);
  getMetricRecorder().increment("billing.refund.synchronized", { status: refund.status });
  return { refundId: String(refund._id), status: refund.status };
}

export interface RefundSettlementReconciliationResult {
  indexInvariant: { status: "READY" | "MIGRATION_REQUIRED"; issues: string[]; effectiveDuplicateTenantCount: number };
  examined: number;
  eligibleForTransitionRepair: number;
  transitionOperationsCreated: number;
  transitionsCompleted: number;
  transitionsRetryable: number;
  providerCancellationsCreated: number;
  providerCancellationsConfirmed: number;
  providerCancellationsRetryable: number;
  failed: number;
}

/**
 * Replays authoritative provider reads for succeeded system settlements. This
 * never creates a refund; it only repairs the local settlement transition and
 * lets the existing durable cancellation operation converge.
 */
export async function reconcileSucceededSystemRefundSettlements(input: {
  provider: PaymentProvider;
  maxRecords?: number;
}): Promise<RefundSettlementReconciliationResult> {
  const maxRecords = Math.min(200, Math.max(1, Math.trunc(input.maxRecords ?? 200)));
  const invariant = await inspectSubscriptionIndexInvariant(SubscriptionModel.collection);
  const invariantSummary = {
    status: invariant.valid ? "READY" as const : "MIGRATION_REQUIRED" as const,
    issues: invariant.issues,
    effectiveDuplicateTenantCount: invariant.effectiveDuplicateTenantCount,
  };
  if (!invariant.valid) {
    return {
      indexInvariant: invariantSummary,
      examined: 0, eligibleForTransitionRepair: 0, transitionOperationsCreated: 0,
      transitionsCompleted: 0, transitionsRetryable: 0, providerCancellationsCreated: 0,
      providerCancellationsConfirmed: 0, providerCancellationsRetryable: 0, failed: 0,
    };
  }
  const candidates = await RefundModel.find({
    status: "SUCCEEDED",
    providerRefundId: { $type: "string" },
    $or: [
      { reasonCode: SYSTEM_REFUND_REASON },
      { reasonCode: "VOLUNTARY_CANCELLATION", subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE" },
    ],
  }).sort({ confirmedAt: 1, createdAt: 1 }).limit(maxRecords).exec();
  const result: RefundSettlementReconciliationResult = {
    indexInvariant: invariantSummary,
    examined: 0, eligibleForTransitionRepair: 0, transitionOperationsCreated: 0,
    transitionsCompleted: 0, transitionsRetryable: 0, providerCancellationsCreated: 0,
    providerCancellationsConfirmed: 0, providerCancellationsRetryable: 0, failed: 0,
  };
  for (const candidate of candidates) {
    result.examined += 1;
    const invoice = candidate.invoiceId ? await InvoiceModel.findOne({
      _id: candidate.invoiceId,
      tenantId: candidate.tenantId,
      ...(candidate.subscriptionId ? { subscriptionId: candidate.subscriptionId } : {}),
    }).lean().exec() : null;
    // Do not trust the derived invoice totals as a discovery predicate: those
    // are exactly what this reconciliation repairs. Provider retrieval below
    // revalidates the authoritative amount, currency and ownership before any
    // local transition is attempted.
    if (!invoice || !isSystemSettlementRefund(candidate)) continue;
    result.eligibleForTransitionRepair += 1;
    const beforeOperation = candidate.subscriptionImpactOperationId ? String(candidate.subscriptionImpactOperationId) : null;
    try {
      await synchronizeRefundFromProvider({ provider: input.provider, providerRefundId: candidate.providerRefundId!, operationReference: String(candidate.operationId), sourceEventId: `refund-settlement-reconciliation:${String(candidate._id)}` });
      const repaired = await RefundModel.findById(candidate._id).lean().exec();
      const afterOperation = repaired?.subscriptionImpactOperationId ? String(repaired.subscriptionImpactOperationId) : null;
      if (!beforeOperation && afterOperation) result.transitionOperationsCreated += 1;
      if (repaired?.subscriptionImpactStatus === "RETRY_PENDING" || repaired?.subscriptionImpactStatus === "FAILED") result.transitionsRetryable += repaired.subscriptionImpactStatus === "RETRY_PENDING" ? 1 : 0;
      if (repaired?.subscriptionImpactStatus === "SUCCEEDED") result.providerCancellationsConfirmed += 1;
      if (repaired?.subscriptionImpactStatus === "RETRY_PENDING") result.providerCancellationsRetryable += 1;
      const paid = repaired?.subscriptionId ? await SubscriptionModel.findOne({ _id: repaired.subscriptionId, tenantId: repaired.tenantId }).lean().exec() : null;
      const free = await PackageModel.findOne({ code: "free", active: true, visibility: "public" }).select("_id").lean().exec();
      const freeSubscription = free ? await SubscriptionModel.findOne({ tenantId: repaired?.tenantId, packageId: free._id, status: "ACTIVE" }).lean().exec() : null;
      if (paid?.status === "CANCELED" && freeSubscription) result.transitionsCompleted += 1;
      if (!beforeOperation && afterOperation) result.providerCancellationsCreated += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

export async function refundCapabilitiesForTenant(tenantId: string): Promise<boolean> {
  const count = await InvoiceModel.countDocuments({
    tenantId: new Types.ObjectId(tenantId),
    amountPaidMinor: { $gt: 0 },
    status: { $in: ["paid", "open", "uncollectible"] },
    $expr: {
      $gt: [remainingRefundableMinorExpression(), 0],
    },
  });
  return count > 0;
}

export interface PendingRefundSettlementsReconciliationResult {
  examined: number;
  synchronized: number;
  retried: number;
  confirmed: number;
  failed: number;
  pending: number;
}

export const PENDING_REFUND_RECONCILE_DEFAULT_GRACE_MS = 5 * 60 * 1000;
export const PENDING_REFUND_RECONCILE_DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;
export const PENDING_REFUND_RECONCILE_DEFAULT_LIMIT = 50;

/**
 * Reconcile refunds stuck in PROVIDER_PENDING / RETRY_PENDING. Refunds that
 * already have a provider refund object are synchronized against the provider
 * so a missed webhook can never strand a completed refund. RETRY_PENDING
 * refunds without a provider object re-issue the create under the original
 * stable idempotency key once their retry window elapses. Candidates that can
 * not be resolved are failed after a staleness window and their reservation is
 * released.
 */
export async function reconcilePendingRefundSettlements(input: {
  provider: PaymentProvider;
  limit?: number;
  graceMs?: number;
  staleMs?: number;
}): Promise<PendingRefundSettlementsReconciliationResult> {
  const now = new Date();
  const graceMs = input.graceMs ?? PENDING_REFUND_RECONCILE_DEFAULT_GRACE_MS;
  const staleMs = input.staleMs ?? PENDING_REFUND_RECONCILE_DEFAULT_STALE_MS;
  const limit = Math.max(1, Math.min(200, input.limit ?? PENDING_REFUND_RECONCILE_DEFAULT_LIMIT));

  const candidates = await RefundModel.find({
    status: { $in: ["PROVIDER_PENDING", "RETRY_PENDING"] },
    createdAt: { $lt: new Date(now.getTime() - graceMs) },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select("_id tenantId operationId invoiceId subscriptionId providerRefundId status providerStatus failureCode amountMinor currency reason")
    .lean()
    .exec();

  const result: PendingRefundSettlementsReconciliationResult = { examined: 0, synchronized: 0, retried: 0, confirmed: 0, failed: 0, pending: 0 };

  for (const refund of candidates) {
    result.examined += 1;
    const tenantId = String(refund.tenantId);
    const operation = await BillingOperationModel.findById(refund.operationId).lean().exec();
    if (refund.status === "RETRY_PENDING" && operation?.nextRetryAt && new Date(operation.nextRetryAt).getTime() > now.getTime()) {
      result.pending += 1;
      continue;
    }

    if (!refund.providerRefundId) {
      if (refund.status !== "RETRY_PENDING") {
        result.pending += 1;
        continue;
      }
      if (await retryPendingRefundCreation({ provider: input.provider, refund, result })) {
        result.retried += 1;
      }
      continue;
    }

    try {
      const synchronized = await synchronizeRefundFromProvider({
        provider: input.provider,
        providerRefundId: refund.providerRefundId,
        operationReference: String(refund.operationId),
        sourceEventId: `reconcile:${String(refund._id)}`,
        tenantIdHint: tenantId,
      });
      result.synchronized += 1;
      if (synchronized.status === "SUCCEEDED") result.confirmed += 1;
      else if (synchronized.status === "FAILED") result.failed += 1;
      else result.pending += 1;
    } catch {
      if (isRefundStale(refund.createdAt, now, staleMs)) {
        await failPendingRefund(refund as unknown as RefundDocument, result);
      } else {
        result.pending += 1;
      }
    }
  }

  return result;
}

async function retryPendingRefundCreation(input: {
  provider: PaymentProvider;
  refund: { _id: unknown; tenantId: unknown; operationId: unknown; invoiceId: unknown; subscriptionId: unknown; amountMinor: number; currency: string; reason?: string };
  result: PendingRefundSettlementsReconciliationResult;
}): Promise<boolean> {
  const refund = input.refund as unknown as RefundDocument;
  const { invoice, expectedCustomerId } = await loadRefundExecutionContext(refund);
  if (isSystemSettlementRefund(refund)) {
    if (!refund.subscriptionId) {
      input.result.pending += 1;
      return false;
    }
    try {
      await assertSystemRefundTransitionReady({ tenantId: String(refund.tenantId), subscriptionId: String(refund.subscriptionId) });
    } catch {
      input.result.pending += 1;
      return false;
    }
  }
  const refreshedInvoice = await ensureInvoicePaymentReference(invoice, expectedCustomerId, input.provider);
  try {
    const resumed = await new BillingOperationService().resume(String(refund.operationId), String(refund.tenantId), async () => input.provider.createRefund({
      chargeId: refreshedInvoice.paymentReference,
      expectedCustomerId,
      amountMinor: refund.amountMinor,
      currency: refund.currency,
      reason: refund.reason,
      operationContext: operationContextFor(String(refund.tenantId), String(refund.operationId), {
        refundId: String(refund._id),
        invoiceId: refreshedInvoice.id,
        amountMinor: refund.amountMinor,
        currency: refund.currency,
        reason: refund.reason,
      }),
    }).then((created) => ({ operationReference: created.refund.id, state: { id: created.refund.id } })));
    await RefundModel.updateOne(
      { _id: refund._id },
      { $set: { status: "PROVIDER_PENDING", failureCode: "", providerRefundId: resumed.result.operationReference, providerStatus: "pending" } },
    );
    await getAuditWriter().write({
      action: "BILLING_REFUND_RETRY_EXECUTED",
      resourceType: "Refund",
      resourceId: String(refund._id),
      tenantId: String(refund.tenantId),
      changes: { status: "PROVIDER_PENDING" },
    });
    input.result.pending += 1;
    return true;
  } catch (error) {
    const mapped = mapBillingProviderError(error);
    if (mapped.statusCode >= 500) {
      input.result.pending += 1;
    } else {
      await failPendingRefund(refund, input.result);
    }
    return false;
  }
}

async function failPendingRefund(
  refund: RefundDocument,
  result: PendingRefundSettlementsReconciliationResult,
): Promise<void> {
  await releaseReservedRefundAmount(refund.invoiceId, refund.tenantId, refund.amountMinor);
  await RefundModel.updateOne({ _id: refund._id }, { $set: { status: "FAILED", failureCode: BILLING_PROVIDER_UNAVAILABLE } });
  await new BillingOperationService().fail(String(refund.operationId), String(refund.tenantId), BILLING_PROVIDER_UNAVAILABLE);
  await getAuditWriter().write({
    action: "BILLING_REFUND_FAILED",
    resourceType: "Refund",
    resourceId: String(refund._id),
    tenantId: String(refund.tenantId),
    changes: { status: "FAILED", failureCode: BILLING_PROVIDER_UNAVAILABLE },
  });
  result.failed += 1;
}

function isRefundStale(requestedAt: Date, now: Date, staleMs: number): boolean {
  return requestedAt.getTime() < now.getTime() - staleMs;
}

export function refundInvoiceSummary(invoice: Record<string, unknown>, refunds?: Array<{ retainedConsumedMinor?: unknown }>) {
  const amountPaidMinor = Number(invoice.amountPaidMinor ?? 0);
  const refundedAmountMinor = Number(invoice.refundedAmountMinor ?? 0);
  const reservedRefundAmountMinor = Number(invoice.reservedRefundAmountMinor ?? 0);
  const retainedConsumedMinor = Number(invoice.retainedConsumedMinor ?? 0);
  const pendingRetainedConsumedMinor = Array.isArray(refunds) && refunds.length > 0
    ? refunds.reduce((floor, item) => Math.max(floor, Math.max(0, Number(item.retainedConsumedMinor ?? 0))), 0)
    : undefined;
  const grossUnrefundedMinor = Math.max(0, amountPaidMinor - refundedAmountMinor - reservedRefundAmountMinor);
  const remainingRefundableMinor = calculateRemainingRefundableMinor({ amountPaidMinor, retainedConsumedMinor, pendingRetainedConsumedMinor, confirmedRefundedMinor: refundedAmountMinor, pendingReservedMinor: reservedRefundAmountMinor });
  return {
    refundedAmountMinor,
    reservedRefundAmountMinor,
    retainedConsumedMinor,
    grossUnrefundedMinor,
    settlementCompleted: remainingRefundableMinor === 0 && retainedConsumedMinor > 0 && refundedAmountMinor > 0,
    remainingRefundableMinor,
    canRequestRefund: remainingRefundableMinor > 0 && ["paid", "open", "uncollectible"].includes(String(invoice.status || "")),
  };
}

export const REFUND_REASON_OPTIONS = [...REFUND_REASONS];
