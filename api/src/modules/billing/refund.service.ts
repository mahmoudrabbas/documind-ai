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
  BILLING_REFUND_USAGE_DATA_UNAVAILABLE,
  NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import BillingOperationModel from "../../db/models/billingOperation.model.js";
import InvoiceModel from "../../db/models/invoice.model.js";
import RefundModel, { type RefundDocument } from "../../db/models/refund.model.js";
import RefundEligibilityPreviewModel from "../../db/models/refundEligibilityPreview.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  authorizeTenantOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import { BillingOperationService, fingerprintBillingRequest, hashIdempotencyKey, mapBillingProviderError } from "./billing-operation.service.js";
import type { PaymentProvider } from "./ports/payment-provider.port.js";
import { authorizeRefundConfirmation } from "./refund-authorization.policy.js";
import { calculateRefundEligibilitySnapshot } from "./refund-eligibility.service.js";

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
  reasonCode: string;
  maximumEligibleRefundMinor: number;
  subscriptionImpact: string;
  subscriptionImpactStatus: string;
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

function refundableRemaining(invoice: Pick<InvoiceContext, "amountPaidMinor" | "refundedAmountMinor" | "reservedRefundAmountMinor">): number {
  return Math.max(0, invoice.amountPaidMinor - invoice.refundedAmountMinor - invoice.reservedRefundAmountMinor);
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
      .select("invoiceNumber amountPaidMinor refundedAmountMinor reservedRefundAmountMinor")
      .lean()
      .exec(),
    RefundModel.find({ invoiceId: refund.invoiceId, _id: { $ne: refund._id } })
      .select("status amountMinor")
      .lean()
      .exec(),
  ]);
  if (!invoice) {
    return {
      invoiceNumber: null,
      refundableRemainingMinor: 0,
      refundedAmountMinor: 0,
      reservedRefundAmountMinor: 0,
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
  return {
    invoiceNumber: String(invoice.invoiceNumber || ""),
    refundableRemainingMinor: refundableRemaining({
      amountPaidMinor: Number(invoice.amountPaidMinor ?? 0),
      refundedAmountMinor: Number(invoice.refundedAmountMinor ?? 0),
      reservedRefundAmountMinor: Number(invoice.reservedRefundAmountMinor ?? 0),
    }),
    refundedAmountMinor: Number(invoice.refundedAmountMinor ?? 0),
    reservedRefundAmountMinor: Number(invoice.reservedRefundAmountMinor ?? 0),
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
    subscriptionImpact: refund.subscriptionImpact,
    subscriptionImpactStatus: refund.subscriptionImpactStatus,
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
              { $add: ["$refundedAmountMinor", "$reservedRefundAmountMinor"] },
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

async function applySuccessfulRefundAmount(invoiceId: Types.ObjectId | null, tenantId: Types.ObjectId, amountMinor: number, session?: mongoose.ClientSession): Promise<void> {
  if (!invoiceId) return;
  await InvoiceModel.updateOne(
    { _id: invoiceId, tenantId },
    [
      {
        $set: {
          reservedRefundAmountMinor: {
            $max: [0, { $subtract: ["$reservedRefundAmountMinor", amountMinor] }],
          },
          refundedAmountMinor: {
            $add: ["$refundedAmountMinor", amountMinor],
          },
        },
      },
    ],
    { updatePipeline: true, session },
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
  mode: "FULL" | "PARTIAL";
  amountMinor?: number;
  /** @deprecated Internal compatibility only. */
  reason?: string;
  idempotencyKey: string;
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
  let maximumEligibleRefundMinor = refundableRemaining(invoice);
  if (preview && !preview.consumedAt) {
    const current = await calculateRefundEligibilitySnapshot({ tenantId: input.tenantId, invoiceId: invoice.id, reason: preview.reason });
    const usageChanged = JSON.stringify(current.includedUsageMetrics) !== JSON.stringify(preview.includedUsageMetrics.map((metric) => ({ dimension: metric.dimension, usage: metric.usage, limit: metric.limit, ratioBps: metric.ratioBps })));
    if (current.subscriptionRevision !== preview.subscriptionRevision || current.amountPaidMinor !== preview.amountPaidMinor || current.currency !== preview.currency || current.maximumEligibleRefundMinor !== preview.maximumEligibleRefundMinor || usageChanged) {
      throw new AppError(409, BILLING_REFUND_ELIGIBILITY_CHANGED, "Refund eligibility changed", { maximumEligibleRefundMinor: current.maximumEligibleRefundMinor });
    }
    if (current.decisionReason === "USAGE_DATA_UNAVAILABLE") throw new AppError(409, BILLING_REFUND_USAGE_DATA_UNAVAILABLE, "Authoritative usage data is unavailable");
    if (current.decisionReason === "DUPLICATE_PAYMENT_NOT_PROVEN") throw new AppError(409, BILLING_REFUND_DUPLICATE_PAYMENT_NOT_PROVEN, "Duplicate payment was not proven");
    maximumEligibleRefundMinor = current.maximumEligibleRefundMinor;
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
    const replayAmountMinor = input.mode === "FULL"
      ? existingRefund.amountMinor
      : input.amountMinor;
    const replayFingerprint = fingerprintBillingRequest({
      invoiceId: invoice.id,
      mode: input.mode,
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
  const amountMinor = input.mode === "FULL"
    ? maximumEligibleRefundMinor
    : amountFromInput({ mode: input.mode, amountMinor: input.amountMinor }, invoice);
  if (amountMinor <= 0 || amountMinor > refundableRemaining(invoice)) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_INVALID, "Refund amount is invalid");
  }
  if (amountMinor > maximumEligibleRefundMinor || (input.mode === "FULL" && maximumEligibleRefundMinor !== financialRemaining)) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_EXCEEDS_ELIGIBILITY, "Refund amount exceeds current eligibility", { maximumEligibleRefundMinor });
  }

  const normalizedRequest = {
    invoiceId: invoice.id,
    mode: input.mode,
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
        invoiceId: new Types.ObjectId(invoice.id),
        amountMinor,
        reason,
        status: { $in: TENANT_PENDING_REFUND_STATUSES },
      }).session(session);
      if (duplicatePending) {
        throw new AppError(409, BILLING_OPERATION_ALREADY_PENDING, "A refund request is already pending");
      }
      await reserveRefundAmountInSession(invoice.id, input.tenantId, amountMinor, session);
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
        subscriptionImpact: preview?.subscriptionImpact ?? "NONE",
        subscriptionImpactStatus: preview?.subscriptionImpact === "CANCEL_IMMEDIATELY_AFTER_REFUND" ? "PENDING" : "NOT_REQUIRED",
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
  const invoice = refund.invoiceId ? await InvoiceModel.findById(refund.invoiceId).select("+paymentReference").lean().exec() as Record<string, unknown> | null : null;
  if (!invoice) throw new AppError(404, BILLING_INVOICE_NOT_FOUND, "Invoice not found");
  const subscription = refund.subscriptionId
    ? await SubscriptionModel.findById(refund.subscriptionId).select("providerCustomerId providerSubscriptionId provider").lean().exec() as Record<string, unknown> | null
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
      status: String(invoice.status || ""),
    } satisfies InvoiceContext,
    expectedCustomerId: String(subscription.providerCustomerId),
  };
}

async function ensureRefundSubscriptionImpact(refund: RefundDocument, provider: PaymentProvider): Promise<void> {
  if (refund.subscriptionImpact !== "CANCEL_IMMEDIATELY_AFTER_REFUND" || refund.subscriptionImpactStatus === "SUCCEEDED") return;
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
  try {
    const started = await new BillingOperationService().execute({
      tenantId: String(refund.tenantId),
      actor: { tenantId: String(refund.tenantId), actorId: String(refund.confirmedBy ?? refund.requestedBy), actorEmail: "", actorRole: "SUPER_ADMIN" },
      operationType: "CANCEL_IMMEDIATELY", idempotencyKey, normalizedRequest,
      subscriptionId: String(subscription._id), provider: subscription.provider,
      expectedSubscriptionRevision: subscription.revision, cancellationType: "IMMEDIATE",
    }, (operation) => provider.cancelImmediately({
      subscriptionId: subscription.providerSubscriptionId,
      expectedCustomerId: subscription.providerCustomerId,
      operationContext: {
        idempotencyKey,
        requestFingerprint: fingerprintBillingRequest(normalizedRequest),
        tenantReference: String(refund.tenantId), operationReference: String(operation._id), traceId: "refund-impact",
      },
    }));
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

export async function confirmRefundRequest(input: {
  refundId: string;
  provider: PaymentProvider;
  context: OperationAuthorizationContext;
}): Promise<{ refund: RefundDto; replayed: boolean }> {
  const refund = await loadRefundForPlatform(input.refundId);
  const actor = await authorizeRefundConfirmation(input.context, String(refund.requestedBy));
  if (refund.status !== "REQUESTED") throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Refund can no longer be confirmed");
  const { invoice, expectedCustomerId } = await loadRefundExecutionContext(refund);
  const refreshedInvoice = await ensureInvoicePaymentReference(invoice, expectedCustomerId, input.provider);
  if (refund.eligibilityPolicyVersion && refund.eligibilityPolicyVersion !== "legacy") {
    const currentEligibility = await calculateRefundEligibilitySnapshot({
      tenantId: String(refund.tenantId), invoiceId: refreshedInvoice.id, reason: refund.reasonCode,
      reservationExclusionMinor: refund.amountMinor,
    });
    if (currentEligibility.maximumEligibleRefundMinor < refund.amountMinor) {
      await getAuditWriter().write({ action: "BILLING_REFUND_ELIGIBILITY_CHANGED", resourceType: "Refund", resourceId: String(refund._id), tenantId: String(refund.tenantId), changes: { policyVersion: currentEligibility.policyVersion } });
      throw new AppError(409, BILLING_REFUND_ELIGIBILITY_CHANGED, "Refund eligibility changed", { maximumEligibleRefundMinor: currentEligibility.maximumEligibleRefundMinor });
    }
    refund.confirmationEligibilitySnapshotHash = currentEligibility.snapshotHash;
    refund.maximumEligibleRefundMinor = currentEligibility.maximumEligibleRefundMinor;
  }
  const availableForConfirmation = Math.max(
    0,
    refreshedInvoice.amountPaidMinor
      - refreshedInvoice.refundedAmountMinor
      - Math.max(0, refreshedInvoice.reservedRefundAmountMinor - refund.amountMinor),
  );
  if (refund.currency !== refreshedInvoice.currency || refund.amountMinor > availableForConfirmation) {
    throw new AppError(409, BILLING_REFUND_AMOUNT_INVALID, "Refund amount is invalid");
  }
  const operation = await BillingOperationModel.findOne({ _id: refund.operationId, tenantId: refund.tenantId }).select("+requestFingerprint").exec();
  if (!operation) throw new AppError(404, BILLING_REFUND_NOT_FOUND, "Refund operation not found");
  const operationService = new BillingOperationService();
  const session = await mongoose.startSession();
  let pendingOperationId = String(operation._id);
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
            paymentReference: refreshedInvoice.paymentReference,
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
    const result = await input.provider.createRefund({
      chargeId: refreshedInvoice.paymentReference,
      expectedCustomerId,
      amountMinor: refund.amountMinor,
      currency: refund.currency,
      reason: refund.reason,
      operationContext: operationContextFor(String(refund.tenantId), String(refund.operationId), normalizedRequest, input.context.traceId),
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
        if (!claimed) return;
        await applySuccessfulRefundAmount(claimed.invoiceId, claimed.tenantId, claimed.amountMinor, session);
        await new BillingOperationService().confirm(String(claimed.operationId), String(claimed.tenantId), input.sourceEventId, { session });
        transitioned = true;
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
  if (refund.status === "SUCCEEDED") await ensureRefundSubscriptionImpact(refund, input.provider);
  getMetricRecorder().increment("billing.refund.synchronized", { status: refund.status });
  return { refundId: String(refund._id), status: refund.status };
}

export async function refundCapabilitiesForTenant(tenantId: string): Promise<boolean> {
  const count = await InvoiceModel.countDocuments({
    tenantId: new Types.ObjectId(tenantId),
    amountPaidMinor: { $gt: 0 },
    $expr: {
      $gt: [
        { $subtract: ["$amountPaidMinor", { $add: ["$refundedAmountMinor", "$reservedRefundAmountMinor"] }] },
        0,
      ],
    },
  });
  return count > 0;
}

export function refundInvoiceSummary(invoice: Record<string, unknown>) {
  const amountPaidMinor = Number(invoice.amountPaidMinor ?? 0);
  const refundedAmountMinor = Number(invoice.refundedAmountMinor ?? 0);
  const reservedRefundAmountMinor = Number(invoice.reservedRefundAmountMinor ?? 0);
  const remainingRefundableMinor = Math.max(0, amountPaidMinor - refundedAmountMinor - reservedRefundAmountMinor);
  return {
    refundedAmountMinor,
    reservedRefundAmountMinor,
    remainingRefundableMinor,
    canRequestRefund: remainingRefundableMinor > 0 && ["paid", "open", "uncollectible"].includes(String(invoice.status || "")),
  };
}

export const REFUND_REASON_OPTIONS = [...REFUND_REASONS];
