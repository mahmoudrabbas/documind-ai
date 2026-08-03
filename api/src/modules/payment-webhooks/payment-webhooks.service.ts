import { Types } from "mongoose";
import PaymentEventModel, {
  type PaymentEventDocument,
} from "../../db/models/paymentEvent.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { transitionSubscription, LEGAL_TRANSITIONS } from "../billing/subscription.service.js";
import type {
  PaymentProvider,
  PaymentProviderEvent,
  ProviderSubscription,
  ProviderSubscriptionState,
} from "../billing/ports/payment-provider.port.js";
import {
  resolvePackageVersion,
  synchronizeProviderSubscription,
  type ResolvedPackageVersion,
} from "../billing/provider-subscription-sync.service.js";
import type { SubscriptionStatus } from "../billing/billing.types.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  BILLING_PROVIDER_UNAVAILABLE,
  BILLING_REFUND_NOT_FOUND,
  NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import { reconcileBillingOperation } from "../billing/billing-operation-reconciliation.service.js";
import {
  BILLING_SUBSCRIPTION_NOT_READY,
  INVOICE_WEBHOOK_EVENTS,
  RetryableInvoiceSynchronizationError,
  synchronizeInvoiceFromReference,
} from "../billing/invoice-synchronization.service.js";
import { synchronizeRefundFromProvider } from "../billing/refund.service.js";

const AUTHORITATIVE_SUBSCRIPTION_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.paid",
  "invoice_payment.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const REFUND_WEBHOOK_EVENTS = new Set([
  "refund.created",
  "refund.updated",
  "charge.refunded",
  "charge.refund.updated",
]);

class ProviderStateReadUnavailableError extends Error {
  readonly code = BILLING_PROVIDER_UNAVAILABLE;
}

class RetryableInvoiceStateError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class RetryableRefundStateError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function writeAudit(
  action: string,
  resourceId: string,
  changes: Record<string, unknown>,
  tenantId: string,
): void {
  const writer = getAuditWriter();
  writer
    .write({
      action: action as never,
      resourceType: "Subscription" as never,
      resourceId,
      changes,
      tenantId,
    })
    .catch((err: unknown) => {
      console.error("Audit write failed (non-blocking):", err);
    });
}

// ── Static event → status mapping (excluding customer.subscription.updated) ──
//
// Single source of truth: entitlements fail closed on subscription.status
// (SERVICEABLE_STATUSES) and subscription.paymentState (refunded → fail closed),
// both evaluated in MongoEntitlementProvider.getSnapshot(). The paymentState
// values derived here are for reporting/audit only and may differ from the
// entitlement gate — do NOT unify this derivation with the entitlement policy.

const EVENT_STATUS_MAP: Record<
  string,
  {
    toStatus: SubscriptionStatus;
    paymentState: "paid" | "failed";
    fromStatuses: SubscriptionStatus[];
  }
> = {
  "checkout.session.completed": {
    toStatus: "INCOMPLETE",
    paymentState: "paid",
    fromStatuses: ["INCOMPLETE", "TRIALING"],
  },
  "invoice.paid": {
    toStatus: "ACTIVE",
    paymentState: "paid",
    fromStatuses: ["TRIALING", "INCOMPLETE", "PAST_DUE", "ACTIVE"],
  },
  "invoice_payment.paid": {
    toStatus: "ACTIVE",
    paymentState: "paid",
    fromStatuses: ["TRIALING", "INCOMPLETE", "PAST_DUE", "ACTIVE"],
  },
  "invoice.payment_failed": {
    toStatus: "PAST_DUE",
    paymentState: "failed",
    fromStatuses: ["ACTIVE", "INCOMPLETE"],
  },
  "customer.subscription.deleted": {
    toStatus: "CANCELED",
    paymentState: "paid",
    fromStatuses: ["ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"],
  },
};

// ── Stripe subscription status → internal status mapping ─────────────────────

const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "ACTIVE",
  past_due: "PAST_DUE",
  unpaid: "UNPAID",
  incomplete: "INCOMPLETE",
  incomplete_expired: "EXPIRED",
  canceled: "CANCELED",
  paused: "PAUSED",
};

function mapStripeStatusToInternal(
  stripeStatus: string,
): SubscriptionStatus | null {
  return STRIPE_STATUS_MAP[stripeStatus] ?? null;
}

// ── Core event handler ───────────────────────────────────────────────────────

export async function handlePaymentEvent(
  event: PaymentProviderEvent,
  rawBody: string,
  signature: string,
  existingEvent?: PaymentEventDocument,
  provider?: PaymentProvider,
): Promise<void> {
  let eventRecord = existingEvent;
  if (eventRecord?.status === "failed") {
    eventRecord.status = "received";
    eventRecord.processingErrors = [];
    eventRecord.processedAt = null;
  }
  if (!eventRecord) {
    const duplicate = await PaymentEventModel.findOne({ provider: event.provider, eventId: event.id }).exec();
    if (duplicate?.status !== "failed") {
      if (duplicate) logger.info({ eventId: event.id }, "Duplicate webhook event — skipping");
      if (duplicate) return;
    }
    if (duplicate) {
      eventRecord = duplicate;
      eventRecord.status = "received";
      eventRecord.processingErrors = [];
      eventRecord.processedAt = null;
    }
  }
  if (!eventRecord) {
    try {
      eventRecord = await PaymentEventModel.create({
        eventId: event.id,
        eventType: event.type,
        provider: event.provider,
        status: "received",
        signature,
        rawBody,
        payload: event.raw,
        processingErrors: [],
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === 11000
      ) {
        logger.info({ eventId: event.id }, "Concurrent duplicate webhook event — skipping");
        return;
      }
      throw error;
    }
  }

  try {
    eventRecord.status = "verified";

    if (REFUND_WEBHOOK_EVENTS.has(event.type) && provider) {
      const refunds = extractRefundReferencesFromEvent(event);
      if (refunds.length === 0) {
        throw new ProviderStateReadUnavailableError("Current provider refund reference is unavailable");
      }
      for (const refund of refunds) {
        try {
          await synchronizeRefundFromProvider({
            provider,
            providerRefundId: refund.providerRefundId,
            operationReference: refund.operationReference,
            sourceEventId: event.id,
            tenantIdHint: extractTenantFromEvent(event)?.toString(),
          });
        } catch (error) {
          throw retryableRefundError(error);
        }
      }
      eventRecord.status = "processed";
      eventRecord.processedAt = new Date();
      await eventRecord.save();
      return;
    }

    const providerSubscription = await retrieveProviderSubscription(event, provider);
    const packageMapping = await resolveEventPackageMapping(event, providerSubscription);

    if (INVOICE_WEBHOOK_EVENTS.has(event.type) && provider) {
      const invoiceId = extractInvoiceIdFromEvent(event);
      const customerId = extractCustomerIdFromEvent(event);
      if (!invoiceId || !customerId) throw new ProviderStateReadUnavailableError("Current provider invoice reference is unavailable");
      try {
        await synchronizeInvoiceFromReference({
          provider,
          providerName: event.provider,
          providerInvoiceId: invoiceId,
          providerCustomerId: customerId,
          providerSubscriptionId: extractStripeSubscriptionIdFromEvent(event),
          sourceEventId: event.id,
        });
      } catch (error) {
        throw retryableInvoiceError(error);
      }
      if (!AUTHORITATIVE_SUBSCRIPTION_EVENTS.has(event.type)) {
        eventRecord.status = "processed";
        eventRecord.processedAt = new Date();
        await eventRecord.save();
        return;
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailure(
        event,
        eventRecord,
        extractPaymentIntentFailureReason(event),
      );
      return;
    }

    if (event.type === "charge.failed") {
      await handlePaymentFailure(
        event,
        eventRecord,
        extractChargeFailureReason(event),
      );
      return;
    }

    if (event.type === "checkout.session.expired") {
      await handleCheckoutSessionExpired(event, eventRecord);
      return;
    }

    const isCheckoutFailed =
      event.type === "checkout.session.completed" &&
      extractPaymentStatus(event) === "unpaid";
    if (isCheckoutFailed) {
      await handleCheckoutSessionCompleted(event, eventRecord);
      return;
    }

    const convergentSyncEvent = AUTHORITATIVE_SUBSCRIPTION_EVENTS.has(event.type);
    if (convergentSyncEvent && providerSubscription) {
      const tenantHint = extractTenantFromEvent(event)?.toString() ??
        providerSubscription.metadata.tenantId;
      if (!tenantHint) throw new Error("Provider event tenant mapping is missing");
      const synchronized = await synchronizeProviderSubscription({
        providerSubscription,
        tenantId: tenantHint,
        provider: event.provider,
        sourceId: event.id,
        sourceType: "webhook",
        sourceTimestamp: event.timestamp,
        providerStateObservedAt: providerSubscription.observedAt,
      });
      await reconcileBillingOperation({
        tenantId: tenantHint,
        operationReference: providerSubscription.metadata.operationReference,
        providerObjectReference: providerSubscription.id,
        providerEventId: event.id,
        outcome: "CONFIRMED",
        authoritativeSubscription: synchronized.subscription,
      });
      eventRecord.tenantId = new Types.ObjectId(tenantHint);
      const checkoutSessionId = extractCheckoutSessionId(event);
      if (event.type === "checkout.session.completed" && checkoutSessionId) {
        await CheckoutSessionModel.updateOne(
          { providerSessionId: checkoutSessionId, tenantId: new Types.ObjectId(tenantHint) },
          { $set: { status: "completed", completedAt: new Date() } },
        );
      }
      eventRecord.status = "processed";
      eventRecord.processedAt = new Date();
      await eventRecord.save();
      return;
    }

    const isSubscriptionUpdate =
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created";

    if (isSubscriptionUpdate) {
      await handleSubscriptionUpdated(event, eventRecord, providerSubscription, packageMapping);
    } else {
      const mapping = EVENT_STATUS_MAP[event.type];
      if (mapping) {
        await handleStaticMappingEvent(
          event,
          mapping,
          eventRecord,
          providerSubscription,
          packageMapping,
        );
      }
    }

    if (eventRecord.processingErrors.length === 0) {
      eventRecord.status = "processed";
      eventRecord.processedAt = new Date();
      await eventRecord.save();
    }
  } catch (error) {
    const safeFailureCode = error instanceof ProviderStateReadUnavailableError
      ? error.code
      : error instanceof RetryableInvoiceStateError
      ? error.code
      : error instanceof RetryableRefundStateError
      ? error.code
      : error instanceof AppError
        ? error.code
        : error instanceof Error
          ? error.message
          : "PAYMENT_EVENT_PROCESSING_FAILED";
    if (
      error instanceof ProviderStateReadUnavailableError
      || error instanceof RetryableInvoiceStateError
      || error instanceof RetryableRefundStateError
    ) {
      logger.error({ errorCode: safeFailureCode, eventId: event.id }, "Failed to retrieve current provider state");
      const tenantId = extractTenantFromEvent(event)?.toString();
      if (tenantId) {
        await reconcileBillingOperation({
          tenantId,
          operationReference: extractMetadataFromEvent(event).operationReference,
          providerObjectReference: extractStripeSubscriptionIdFromEvent(event),
          providerEventId: event.id,
          outcome: "RETRY_PENDING",
          failureCode: safeFailureCode,
        }).catch(() => undefined);
      }
    } else {
      logger.error({ err: error, eventId: event.id }, "Failed to process payment event");
    }
    eventRecord.status = "failed";
    eventRecord.processedAt = null;
    eventRecord.processingErrors.push(safeFailureCode);
    await eventRecord.save();
  }
}

function retryableInvoiceError(error: unknown): Error {
  if (error instanceof RetryableInvoiceSynchronizationError) {
    return new RetryableInvoiceStateError(error.code);
  }
  if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === BILLING_SUBSCRIPTION_NOT_READY) {
    return new RetryableInvoiceStateError(BILLING_SUBSCRIPTION_NOT_READY);
  }
  return error instanceof Error ? error : new Error(BILLING_SUBSCRIPTION_NOT_READY);
}

function retryableRefundError(error: unknown): Error {
  if (error instanceof AppError && error.code === BILLING_REFUND_NOT_FOUND) {
    return new RetryableRefundStateError(BILLING_REFUND_NOT_FOUND);
  }
  if (error instanceof AppError && error.code === BILLING_PROVIDER_UNAVAILABLE) {
    return new RetryableRefundStateError(BILLING_PROVIDER_UNAVAILABLE);
  }
  return error instanceof Error ? error : new Error(BILLING_PROVIDER_UNAVAILABLE);
}

// ── Static mapping handler (checkout, invoice, subscription.deleted) ─────────

async function handleStaticMappingEvent(
  event: PaymentProviderEvent,
  mapping: {
    toStatus: SubscriptionStatus;
    paymentState: "paid" | "failed";
    fromStatuses: SubscriptionStatus[];
  },
  eventRecord: PaymentEventDocument,
  providerSubscription?: ProviderSubscription | null,
  packageMapping?: ResolvedPackageVersion | null,
): Promise<void> {
  const resolved = await resolveSubscriptionFromEvent(event, providerSubscription);

  if (!resolved) {
    eventRecord.processingErrors.push(
      "No subscription found for event (tenantId not resolvable)",
    );
    eventRecord.status = "failed";
    await eventRecord.save();
    return;
  }

  const { subscription: sub, tenantId } = resolved;
  eventRecord.tenantId = tenantId;
  const currentStatus = sub.status as SubscriptionStatus;

  const transitionOptions: Record<string, unknown> = {
    subscriptionId: String(sub._id),
    triggeredBy: "provider_event",
    providerEventId: event.id,
  };

  const packageId = packageMapping?.packageId ?? extractPackageIdFromEvent(event);
  if (packageId) {
    transitionOptions.packageId = packageId;
  }

  const isSameStatus = currentStatus === mapping.toStatus;

  if (isSameStatus) {
    logger.info(
      { tenantId, currentStatus, eventType: event.type },
      "Static mapping event — subscription already at target status, skipping transition",
    );
  } else if (mapping.fromStatuses.includes(currentStatus)) {
    await transitionSubscription(
      String(tenantId),
      mapping.toStatus,
      transitionOptions,
    );
  }

  const subscriptionUpdate: Record<string, unknown> = {
    paymentState: event.type === "customer.subscription.deleted" && sub.paymentState === "refunded"
      ? "refunded"
      : mapping.paymentState,
    lastProviderEventId: event.id,
    providerSubscriptionId:
      extractStripeSubscriptionIdFromEvent(event) ??
      sub.providerSubscriptionId,
    providerCustomerId:
      providerSubscription?.customerId ?? extractCustomerIdFromEvent(event) ?? sub.providerCustomerId,
    provider: event.provider,
  };
  const providerPeriodStart = providerSubscription?.currentPeriodStart;
  const providerPeriodEnd = providerSubscription?.currentPeriodEnd;
  if (providerPeriodStart) {
    subscriptionUpdate.periodStart = providerPeriodStart;
    subscriptionUpdate.currentPeriodStart = providerPeriodStart;
  }
  if (providerPeriodEnd) {
    subscriptionUpdate.periodEnd = providerPeriodEnd;
    subscriptionUpdate.currentPeriodEnd = providerPeriodEnd;
  }
  if (providerSubscription) {
    subscriptionUpdate.cancelAtPeriodEnd = providerSubscription.cancelAtPeriodEnd;
  }

  if (packageMapping) {
    subscriptionUpdate.packageId = new Types.ObjectId(packageId);
    subscriptionUpdate.packageVersionId = new Types.ObjectId(packageMapping.packageVersionId);
    subscriptionUpdate.packageVersion = packageMapping.packageVersion;
    subscriptionUpdate.billingInterval = packageMapping.billingInterval;
    subscriptionUpdate.providerPriceId = providerSubscription?.priceId ?? extractPriceIdFromEvent(event) ?? "";
  } else if (packageId && String(sub.packageId) !== packageId) {
    throw new Error("Stripe event packageId has no unambiguous package version mapping");
  }

  await SubscriptionModel.updateOne(
    { _id: sub._id, tenantId },
    { $set: subscriptionUpdate },
  );

  const sessionId = extractCheckoutSessionId(event);
  if (sessionId) {
    await CheckoutSessionModel.updateOne(
      { providerSessionId: sessionId },
      {
        $set: {
          status: "completed",
          completedAt: new Date(),
        },
      },
    );
  }

  writeAudit(
    "SUBSCRIPTION_UPDATED",
    String(sub._id),
    {
      eventType: event.type,
      newStatus: mapping.toStatus,
      paymentState: event.type === "customer.subscription.deleted" && sub.paymentState === "refunded" ? "refunded" : mapping.paymentState,
      providerEventId: event.id,
    },
    String(tenantId),
  );
}

// ── customer.subscription.updated handler ─────────────────────────────────────

async function handleSubscriptionUpdated(
  event: PaymentProviderEvent,
  eventRecord: PaymentEventDocument,
  providerSubscription?: ProviderSubscription | null,
  packageMapping?: ResolvedPackageVersion | null,
): Promise<void> {
  const resolved = await resolveSubscriptionFromEvent(event, providerSubscription);

  if (!resolved) {
    eventRecord.processingErrors.push(
      "No subscription found for customer.subscription.updated event",
    );
    eventRecord.status = "failed";
    await eventRecord.save();
    return;
  }

  const { subscription: sub, tenantId } = resolved;
  eventRecord.tenantId = tenantId;
  const currentStatus = sub.status as SubscriptionStatus;

  const stripeStatus = extractStripeSubscriptionStatus(event);
  const cancelAtPeriodEnd = extractCancelAtPeriodEnd(event);

  const mappedStatus = mapStripeStatusToInternal(stripeStatus);

  if (!mappedStatus) {
    throw new Error(`Unknown Stripe subscription status: ${stripeStatus || "missing"}`);
  }

  const isSameStatus = currentStatus === mappedStatus;

  if (!isSameStatus) {
    const legalTargets = LEGAL_TRANSITIONS[currentStatus];

    if (!legalTargets.includes(mappedStatus)) {
      throw new Error(
        `Stripe subscription transition ${currentStatus} → ${mappedStatus} is not legal`,
      );
    }

    const transitionOptions: Record<string, unknown> = {
      subscriptionId: String(sub._id),
      triggeredBy: "provider_event",
      providerEventId: event.id,
    };

    const packageId = packageMapping?.packageId ?? extractPackageIdFromEvent(event);
    if (packageId) {
      transitionOptions.packageId = packageId;
    }

    await transitionSubscription(
      String(tenantId),
      mappedStatus,
      transitionOptions,
    );
  } else {
    logger.info(
      { tenantId, currentStatus, eventType: event.type },
      "Subscription update — status unchanged, persisting metadata only",
    );
  }

  const periodStart = providerSubscription?.currentPeriodStart ?? extractCurrentPeriodStart(event);
  const periodEnd = providerSubscription?.currentPeriodEnd ?? extractCurrentPeriodEnd(event);
  const cancelAt = extractCancelAt(event);

  // Single source of truth: entitlements fail closed on subscription.status
  // (SERVICEABLE_STATUSES) and subscription.paymentState (refunded → fail closed),
  // both evaluated in MongoEntitlementProvider.getSnapshot(). The paymentState
  // derivation below is for reporting/audit only and may differ from the
  // entitlement gate — do NOT unify it with the entitlement policy.
  const subscriptionUpdate: Record<string, unknown> = {
    cancelAtPeriodEnd,
    paymentState: sub.paymentState === "refunded"
      ? "refunded"
      : mappedStatus === "EXPIRED" || mappedStatus === "PAST_DUE" || mappedStatus === "UNPAID"
        ? "failed"
        : "paid",
    lastProviderEventId: event.id,
    providerSubscriptionId:
      extractStripeSubscriptionIdFromEvent(event) ??
      sub.providerSubscriptionId,
    providerCustomerId:
      providerSubscription?.customerId ?? extractCustomerIdFromEvent(event) ?? sub.providerCustomerId,
    provider: event.provider,
  };

  if (periodEnd !== null) {
    subscriptionUpdate.periodEnd = periodEnd;
    subscriptionUpdate.currentPeriodEnd = periodEnd;
  }
  if (periodStart !== null) {
    subscriptionUpdate.periodStart = periodStart;
    subscriptionUpdate.currentPeriodStart = periodStart;
  }

  if (cancelAt !== null) {
    subscriptionUpdate.cancelledAt = cancelAt;
  } else if (!cancelAtPeriodEnd) {
    subscriptionUpdate.cancelledAt = null;
  }

  const packageId = packageMapping?.packageId ?? extractPackageIdFromEvent(event);
  if (packageMapping) {
    subscriptionUpdate.packageId = new Types.ObjectId(packageMapping.packageId);
    subscriptionUpdate.packageVersionId = new Types.ObjectId(packageMapping.packageVersionId);
    subscriptionUpdate.packageVersion = packageMapping.packageVersion;
    subscriptionUpdate.billingInterval = packageMapping.billingInterval;
    subscriptionUpdate.providerPriceId = providerSubscription?.priceId ?? extractPriceIdFromEvent(event) ?? "";
  } else if (packageId && String(sub.packageId) !== packageId) {
    throw new Error("Stripe subscription packageId has no unambiguous package version mapping");
  }

  subscriptionUpdate.lastProviderEventTimestamp = event.timestamp;

  await SubscriptionModel.updateOne(
    { _id: sub._id, tenantId },
    { $set: subscriptionUpdate },
  );

  writeAudit(
    "SUBSCRIPTION_UPDATED",
    String(sub._id),
    {
      eventType: event.type,
      stripeStatus,
      cancelAtPeriodEnd,
      cancelAt,
      newStatus: mappedStatus,
      providerEventId: event.id,
    },
    String(tenantId),
  );
}

// ── checkout.session.completed handler (initial checkout failure) ────────────

async function handleCheckoutSessionCompleted(
  event: PaymentProviderEvent,
  eventRecord: PaymentEventDocument,
): Promise<void> {
  const paymentStatus = extractPaymentStatus(event);
  if (paymentStatus !== "unpaid") return;

  const sessionId = extractCheckoutSessionId(event);
  if (!sessionId) return;

  const failureReason = extractFailureReason(event);

  const metadataUpdate: Record<string, string> = {
    "metadata.payment_status": "unpaid",
    "metadata.providerEventId": event.id,
  };
  if (failureReason) metadataUpdate["metadata.failureReason"] = failureReason;

  await CheckoutSessionModel.updateOne(
    { providerSessionId: sessionId },
    {
      $set: {
        status: "failed",
        ...metadataUpdate,
      },
    },
  );

  eventRecord.status = "processed";
  eventRecord.processedAt = new Date();
  await eventRecord.save();

  writeAudit(
    "CHECKOUT_SESSION_UPDATED",
    sessionId,
    {
      eventType: event.type,
      paymentStatus: "unpaid",
      failureReason,
      providerEventId: event.id,
    },
    extractTenantFromEvent(event)?.toString() ?? "",
  );
}

// ── checkout.session.expired handler ────────────────────────────────────────

async function handleCheckoutSessionExpired(
  event: PaymentProviderEvent,
  eventRecord: PaymentEventDocument,
): Promise<void> {
  const sessionId = extractCheckoutSessionId(event);
  if (!sessionId) return;

  await CheckoutSessionModel.updateOne(
    { providerSessionId: sessionId },
    {
      $set: {
        status: "expired",
        "metadata.providerEventId": event.id,
      },
    },
  );

  eventRecord.status = "processed";
  eventRecord.processedAt = new Date();
  await eventRecord.save();

  writeAudit(
    "CHECKOUT_SESSION_UPDATED",
    sessionId,
    {
      eventType: event.type,
      providerEventId: event.id,
    },
    extractTenantFromEvent(event)?.toString() ?? "",
  );
}

// ── Payment failure handler (payment_intent.payment_failed, charge.failed) ──

async function handlePaymentFailure(
  event: PaymentProviderEvent,
  eventRecord: PaymentEventDocument,
  failureReason: string | undefined,
): Promise<void> {
  // Stripe propagates CheckoutSession.id → PaymentIntent.payment_details.order_reference.
  // This is a deterministic 1:1 correlation via providerSessionId (unique index).
  // Other fields (customer, metadata.tenantId) are ambiguous when multiple pending
  // sessions exist for the same tenant or customer.
  let session = null;

  // Tier 1: Deterministic — order_reference → providerSessionId
  const orderRef = extractOrderReferenceFromEvent(event);
  if (orderRef) {
    session = await CheckoutSessionModel.findOne({
      providerSessionId: orderRef,
      status: "pending",
    })
      .lean()
      .exec();
    // If not found here, the session may have already been completed/expired
    // by a checkout.session.completed event. Fall through to safe fallbacks.
  }

  // Tier 2: tenantId — only if exactly one pending session exists
  if (!session) {
    const tenantId = extractTenantFromEvent(event);
    if (tenantId) {
      const sessions = await CheckoutSessionModel.find({
        tenantId,
        status: "pending",
      })
        .lean()
        .exec();
      if (sessions.length === 1) {
        session = sessions[0];
      }
    }
  }

  // Tier 3: customer — only if exactly one pending session exists
  if (!session) {
    const customerId = extractCustomerIdFromEvent(event);
    if (customerId) {
      const sessions = await CheckoutSessionModel.find({
        providerCustomerId: customerId,
        status: "pending",
      })
        .lean()
        .exec();
      if (sessions.length === 1) {
        session = sessions[0];
      }
    }
  }

  if (!session) {
    eventRecord.processingErrors.push(
      "No pending CheckoutSession found for payment failure event (order_reference, tenantId, and customer all failed to correlate unambiguously)",
    );
    eventRecord.status = "failed";
    await eventRecord.save();
    return;
  }

  const tenantId = session.tenantId;

  const metadataUpdate: Record<string, string> = {
    "metadata.providerEventId": event.id,
  };
  if (failureReason) metadataUpdate["metadata.failureReason"] = failureReason;

  await CheckoutSessionModel.updateOne(
    { _id: session._id, status: "pending" },
    {
      $set: {
        status: "failed",
        ...metadataUpdate,
      },
    },
  );

  eventRecord.status = "processed";
  eventRecord.processedAt = new Date();
  await eventRecord.save();

  writeAudit(
    "CHECKOUT_SESSION_UPDATED",
    String(session._id),
    {
      eventType: event.type,
      failureReason,
      providerEventId: event.id,
    },
    tenantId.toString(),
  );
}

// ── Subscription resolution ──────────────────────────────────────────────────

interface ResolvedSubscription {
  subscription: {
    _id: Types.ObjectId;
    status: string;
    packageId: Types.ObjectId;
    providerSubscriptionId: string;
    providerCustomerId: string;
    paymentState: "pending" | "paid" | "failed" | "refunded";
  };
  tenantId: Types.ObjectId;
}

async function resolveSubscriptionFromEvent(
  event: PaymentProviderEvent,
  providerSubscription?: ProviderSubscription | null,
): Promise<ResolvedSubscription | null> {
  const providerTenantId = providerSubscription?.metadata.tenantId;
  const tenantId = extractTenantFromEvent(event) ??
    (providerTenantId && Types.ObjectId.isValid(providerTenantId)
      ? new Types.ObjectId(providerTenantId)
      : null);
  const stripeSubId = providerSubscription?.id ?? extractStripeSubscriptionIdFromEvent(event);
  if (tenantId) {
    const sub = await SubscriptionModel.findOne({
      tenantId,
      ...(stripeSubId
        ? { providerSubscriptionId: stripeSubId }
        : {
            providerSubscriptionId: { $nin: ["", null] },
            status: { $in: ["ACTIVE", "TRIALING", "CANCEL_AT_PERIOD_END", "PAST_DUE"] },
          }),
    }).sort({ createdAt: -1 }).exec();
    if (sub) return { subscription: sub, tenantId };
  }

  const customerId = providerSubscription?.customerId ?? extractCustomerIdFromEvent(event);
  if (customerId) {
    const sub = await SubscriptionModel.findOne({
      providerCustomerId: customerId,
    }).exec();
    if (sub) return { subscription: sub, tenantId: sub.tenantId };
  }

  if (stripeSubId) {
    const sub = await SubscriptionModel.findOne({
      providerSubscriptionId: stripeSubId,
    }).exec();
    if (sub) return { subscription: sub, tenantId: sub.tenantId };
  }

  return null;
}

async function retrieveProviderSubscription(
  event: PaymentProviderEvent,
  provider?: PaymentProvider,
): Promise<ProviderSubscriptionState | null> {
  if (!provider || !AUTHORITATIVE_SUBSCRIPTION_EVENTS.has(event.type)) return null;
  const subscriptionId = extractStripeSubscriptionIdFromEvent(event);
  const expectedCustomerId = extractCustomerIdFromEvent(event);
  if (!subscriptionId || !expectedCustomerId) throw new ProviderStateReadUnavailableError("Current provider subscription reference is unavailable");
  try {
    return await provider.retrieveCurrentSubscriptionState({ subscriptionId, expectedCustomerId });
  } catch {
    throw new ProviderStateReadUnavailableError("Current provider subscription state is unavailable");
  }
}

async function resolveEventPackageMapping(
  event: PaymentProviderEvent,
  providerSubscription: ProviderSubscription | null,
): Promise<ResolvedPackageVersion | null> {
  const eventMetadata = extractMetadataFromEvent(event);
  const metadata = {
    ...eventMetadata,
    ...(providerSubscription?.metadata ?? {}),
  };
  const priceId = providerSubscription?.priceId ?? extractPriceIdFromEvent(event) ?? "";
  const hasVersionMetadata = Boolean(
    metadata.packageId && (metadata.packageVersionId || metadata.packageVersion),
  );
  if (!hasVersionMetadata && !priceId) return null;
  return resolvePackageVersion(metadata, priceId);
}

// ── Event data extraction helpers ────────────────────────────────────────────

function extractRawObject(
  event: PaymentProviderEvent,
): Record<string, unknown> | undefined {
  const rawData = event.raw.data as Record<string, unknown> | undefined;
  return rawData?.object as Record<string, unknown> | undefined;
}

function extractTenantFromEvent(
  event: PaymentProviderEvent,
): Types.ObjectId | null {
  const obj = extractRawObject(event);
  const metadata = obj?.metadata as Record<string, string> | undefined;
  if (metadata?.tenantId) return new Types.ObjectId(metadata.tenantId);
  if (typeof obj?.client_reference_id === "string" && Types.ObjectId.isValid(obj.client_reference_id)) {
    return new Types.ObjectId(obj.client_reference_id);
  }
  return null;
}

function extractMetadataFromEvent(event: PaymentProviderEvent): Record<string, string> {
  const obj = extractRawObject(event);
  return (obj?.metadata as Record<string, string> | undefined) ?? {};
}

function extractCustomerIdFromEvent(
  event: PaymentProviderEvent,
): string | undefined {
  const obj = extractRawObject(event);
  return obj?.customer as string | undefined;
}

function extractOrderReferenceFromEvent(
  event: PaymentProviderEvent,
): string | null {
  const obj = extractRawObject(event);
  const details = obj?.payment_details as
    | Record<string, unknown>
    | undefined;
  if (details?.order_reference) return details.order_reference as string;
  return null;
}

function extractStripeSubscriptionIdFromEvent(
  event: PaymentProviderEvent,
): string | undefined {
  const obj = extractRawObject(event);
  if (typeof obj?.subscription === "string") return obj.subscription;
  const parent = obj?.parent as { subscription_details?: { subscription?: string | { id?: string } } } | undefined;
  const parentSubscription = parent?.subscription_details?.subscription;
  if (typeof parentSubscription === "string") return parentSubscription;
  if (parentSubscription?.id) return parentSubscription.id;
  if (event.type.startsWith("customer.subscription.") && typeof obj?.id === "string") {
    return obj.id;
  }
  return undefined;
}

function extractInvoiceIdFromEvent(event: PaymentProviderEvent): string | undefined {
  const obj = extractRawObject(event);
  return typeof obj?.id === "string" ? obj.id : undefined;
}

function extractRefundReferencesFromEvent(event: PaymentProviderEvent): Array<{
  providerRefundId: string;
  operationReference?: string;
}> {
  const obj = extractRawObject(event);
  if (!obj) return [];
  if (typeof obj.id === "string" && obj.id.startsWith("re_")) {
    return [{
      providerRefundId: obj.id,
      operationReference: extractRefundOperationReference(obj),
    }];
  }
  const refunds = obj.refunds as { data?: Array<Record<string, unknown>> } | undefined;
  if (!Array.isArray(refunds?.data)) return [];
  return refunds.data
    .map((item) => ({
      providerRefundId: typeof item.id === "string" ? item.id : "",
      operationReference: extractRefundOperationReference(item),
    }))
    .filter((item) => item.providerRefundId);
}

function extractRefundOperationReference(raw: Record<string, unknown>): string | undefined {
  const metadata = raw.metadata as Record<string, unknown> | undefined;
  return typeof metadata?.operationReference === "string"
    ? metadata.operationReference
    : undefined;
}

function extractPriceIdFromEvent(event: PaymentProviderEvent): string | undefined {
  const obj = extractRawObject(event);
  const items = obj?.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  const itemPrice = items?.data?.[0]?.price?.id;
  if (itemPrice) return itemPrice;
  const lines = obj?.lines as { data?: Array<{ price?: { id?: string }; pricing?: { price_details?: { price?: string } } }> } | undefined;
  return lines?.data?.[0]?.price?.id ?? lines?.data?.[0]?.pricing?.price_details?.price;
}

function extractStripeSubscriptionStatus(
  event: PaymentProviderEvent,
): string {
  const obj = extractRawObject(event);
  return (obj?.status as string) ?? "";
}

function extractCancelAtPeriodEnd(
  event: PaymentProviderEvent,
): boolean {
  const obj = extractRawObject(event);
  return (obj?.cancel_at_period_end as boolean) ?? false;
}

function extractCancelAt(
  event: PaymentProviderEvent,
): Date | null {
  const obj = extractRawObject(event);
  const ts = obj?.cancel_at as number | undefined;
  if (typeof ts === "number" && ts > 0) return new Date(ts * 1000);
  return null;
}

function extractCurrentPeriodEnd(
  event: PaymentProviderEvent,
): Date | null {
  const obj = extractRawObject(event);
  const ts = obj?.current_period_end as number | undefined;
  if (typeof ts === "number" && ts > 0) return new Date(ts * 1000);
  return null;
}

function extractCurrentPeriodStart(
  event: PaymentProviderEvent,
): Date | null {
  const obj = extractRawObject(event);
  const ts = obj?.current_period_start as number | undefined;
  if (typeof ts === "number" && ts > 0) return new Date(ts * 1000);
  return null;
}

function extractCheckoutSessionId(
  event: PaymentProviderEvent,
): string | undefined {
  const obj = extractRawObject(event);
  return obj?.id as string | undefined;
}

function extractPackageIdFromEvent(
  event: PaymentProviderEvent,
): string | undefined {
  const obj = extractRawObject(event);
  const metadata = obj?.metadata as Record<string, string> | undefined;
  return metadata?.packageId;
}

function extractPaymentStatus(
  event: PaymentProviderEvent,
): string | undefined {
  const obj = extractRawObject(event);
  return obj?.payment_status as string | undefined;
}

function extractFailureReason(
  event: PaymentProviderEvent,
): string | undefined {
  const obj = extractRawObject(event);
  const lastError = obj?.last_payment_error as
    | Record<string, unknown>
    | undefined;
  if (lastError?.message) return lastError.message as string;
  return undefined;
}

function extractPaymentIntentFailureReason(
  event: PaymentProviderEvent,
): string | undefined {
  const obj = extractRawObject(event);
  const lastError = obj?.last_payment_error as
    | Record<string, unknown>
    | undefined;
  if (lastError?.message) return lastError.message as string;
  const declineCode = obj?.last_payment_error as
    | Record<string, unknown>
    | undefined;
  if (declineCode?.decline_code) return declineCode.decline_code as string;
  return undefined;
}

function extractChargeFailureReason(
  event: PaymentProviderEvent,
): string | undefined {
  const obj = extractRawObject(event);
  if (obj?.failure_message) return obj.failure_message as string;
  if (obj?.failure_code) return obj.failure_code as string;
  return undefined;
}

// ── Admin: list & reprocess ──────────────────────────────────────────────────

export async function listPaymentEvents(filter: {
  page: number;
  pageSize: number;
  status?: string;
  eventType?: string;
}, context: OperationAuthorizationContext) {
  await authorizePlatformOperation(context, Permission.BILLING_READ);
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;
  if (filter.eventType) query.eventType = filter.eventType;

  const [events, totalRecords] = await Promise.all([
    PaymentEventModel.find(query)
      .select("-signature -rawBody -payload")
      .sort({ createdAt: -1 })
      .skip((filter.page - 1) * filter.pageSize)
      .limit(filter.pageSize)
      .lean()
      .exec(),
    PaymentEventModel.countDocuments(query),
  ]);

  return {
    events,
    pagination: {
      page: filter.page,
      pageSize: filter.pageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / filter.pageSize),
    },
  };
}

export async function reprocessEvent(
  eventId: string,
  context: OperationAuthorizationContext,
): Promise<void> {
  const actor = await authorizePlatformOperation(
    context,
    Permission.BILLING_MANAGE,
  );
  const event = await PaymentEventModel.findOne({ provider: "stripe", eventId }).exec();
  if (!event) {
    throw new AppError(404, NOT_FOUND, "Payment event not found");
  }

  event.status = "received";
  event.processingErrors = [];
  event.processedAt = null;
  await event.save();

  const provider = await getProviderForReprocess();
  const parsed = provider.parseWebhookEvent(event.payload as Record<string, unknown>);
  await handlePaymentEvent(parsed, event.rawBody, event.signature, event, provider);
  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "PAYMENT_EVENT_REPROCESSED",
    resourceType: "PaymentEvent",
    resourceId: eventId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
    changes: { eventType: event.eventType },
    metadata: { traceId: actor.traceId, requestId: actor.requestId },
  });
}

async function getProviderForReprocess() {
  const { getPaymentProvider } = await import(
    "../checkout/payment-provider-loader.js"
  );
  return getPaymentProvider();
}
