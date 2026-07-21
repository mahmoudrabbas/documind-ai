import { Types } from "mongoose";
import PaymentEventModel, {
  type PaymentEventDocument,
} from "../../db/models/paymentEvent.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { transitionSubscription, LEGAL_TRANSITIONS } from "../billing/subscription.service.js";
import type { PaymentProviderEvent } from "../billing/ports/payment-provider.port.js";
import type { SubscriptionStatus } from "../billing/billing.types.js";
import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND } from "../../common/errors/errorCodes.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";

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
    fromStatuses: ["INCOMPLETE", "PAST_DUE", "ACTIVE"],
  },
  "invoice.payment_failed": {
    toStatus: "PAST_DUE",
    paymentState: "failed",
    fromStatuses: ["ACTIVE", "INCOMPLETE"],
  },
  "customer.subscription.deleted": {
    toStatus: "EXPIRED",
    paymentState: "failed",
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
): Promise<void> {
  const duplicate = existingEvent
    ? null
    : await PaymentEventModel.findOne({ eventId: event.id }).exec();
  if (duplicate) {
    logger.info({ eventId: event.id }, "Duplicate webhook event — skipping");
    return;
  }

  const eventRecord =
    existingEvent ??
    (await PaymentEventModel.create({
      eventId: event.id,
      eventType: event.type,
      provider: event.provider,
      status: "received",
      signature,
      rawBody,
      payload: event.raw,
      processingErrors: [],
    }));

  try {
    eventRecord.status = "verified";

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

    const isSubscriptionUpdate = event.type === "customer.subscription.updated";

    if (isSubscriptionUpdate) {
      await handleSubscriptionUpdated(event, eventRecord);
    } else {
      const mapping = EVENT_STATUS_MAP[event.type];
      if (mapping) {
        await handleStaticMappingEvent(event, mapping, eventRecord);
      }
    }

    if (eventRecord.processingErrors.length === 0) {
      eventRecord.status = "processed";
      eventRecord.processedAt = new Date();
      await eventRecord.save();
    }
  } catch (error) {
    logger.error({ err: error, eventId: event.id }, "Failed to process payment event");
    eventRecord.status = "failed";
    eventRecord.processingErrors.push(
      error instanceof Error ? error.message : "Unknown error",
    );
    await eventRecord.save();
  }
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
): Promise<void> {
  const resolved = await resolveSubscriptionFromEvent(event);

  if (!resolved) {
    eventRecord.processingErrors.push(
      "No subscription found for event (tenantId not resolvable)",
    );
    eventRecord.status = "failed";
    await eventRecord.save();
    return;
  }

  const { subscription: sub, tenantId } = resolved;
  const currentStatus = sub.status as SubscriptionStatus;

  const transitionOptions: Record<string, unknown> = {
    triggeredBy: "provider_event",
    providerEventId: event.id,
  };

  const packageId = extractPackageIdFromEvent(event);
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
    paymentState: mapping.paymentState,
    lastProviderEventId: event.id,
    providerSubscriptionId:
      extractStripeSubscriptionIdFromEvent(event) ??
      sub.providerSubscriptionId,
  };

  if (packageId) {
    subscriptionUpdate.packageId = new Types.ObjectId(packageId);
  }

  await SubscriptionModel.updateOne(
    { tenantId },
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
      paymentState: mapping.paymentState,
      providerEventId: event.id,
    },
    String(tenantId),
  );
}

// ── customer.subscription.updated handler ─────────────────────────────────────

async function handleSubscriptionUpdated(
  event: PaymentProviderEvent,
  eventRecord: PaymentEventDocument,
): Promise<void> {
  const resolved = await resolveSubscriptionFromEvent(event);

  if (!resolved) {
    eventRecord.processingErrors.push(
      "No subscription found for customer.subscription.updated event",
    );
    eventRecord.status = "failed";
    await eventRecord.save();
    return;
  }

  const { subscription: sub, tenantId } = resolved;
  const currentStatus = sub.status as SubscriptionStatus;

  const stripeStatus = extractStripeSubscriptionStatus(event);
  const cancelAtPeriodEnd = extractCancelAtPeriodEnd(event);

  const mappedStatus = mapStripeStatusToInternal(stripeStatus);

  if (!mappedStatus) {
    logger.warn(
      { eventId: event.id, stripeStatus },
      "Unknown Stripe subscription status — skipping transition",
    );
    return;
  }

  const isSameStatus = currentStatus === mappedStatus;

  if (!isSameStatus) {
    const legalTargets = LEGAL_TRANSITIONS[currentStatus];

    if (!legalTargets.includes(mappedStatus)) {
      logger.info(
        {
          eventId: event.id,
          currentStatus,
          mappedStatus,
          stripeStatus,
          cancelAtPeriodEnd,
        },
        "Subscription update skipped — transition not legal from current status",
      );
      return;
    }

    const transitionOptions: Record<string, unknown> = {
      triggeredBy: "provider_event",
      providerEventId: event.id,
    };

    const packageId = extractPackageIdFromEvent(event);
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

  const periodEnd = extractCurrentPeriodEnd(event);
  const cancelAt = extractCancelAt(event);

  const subscriptionUpdate: Record<string, unknown> = {
    cancelAtPeriodEnd,
    paymentState: mappedStatus === "EXPIRED" || mappedStatus === "CANCELED" || mappedStatus === "PAST_DUE" || mappedStatus === "UNPAID"
      ? "failed"
      : "paid",
    lastProviderEventId: event.id,
    providerSubscriptionId:
      extractStripeSubscriptionIdFromEvent(event) ??
      sub.providerSubscriptionId,
  };

  if (periodEnd !== null) {
    subscriptionUpdate.periodEnd = periodEnd;
  }

  if (cancelAt !== null) {
    subscriptionUpdate.cancelledAt = cancelAt;
  } else if (!cancelAtPeriodEnd) {
    subscriptionUpdate.cancelledAt = null;
  }

  const packageId = extractPackageIdFromEvent(event);
  if (packageId) {
    subscriptionUpdate.packageId = new Types.ObjectId(packageId);
  }

  subscriptionUpdate.lastProviderEventTimestamp = event.timestamp;

  await SubscriptionModel.updateOne(
    { tenantId },
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
  subscription: { _id: Types.ObjectId; status: string; providerSubscriptionId: string; providerCustomerId: string };
  tenantId: Types.ObjectId;
}

async function resolveSubscriptionFromEvent(
  event: PaymentProviderEvent,
): Promise<ResolvedSubscription | null> {
  const tenantId = extractTenantFromEvent(event);
  if (tenantId) {
    const sub = await SubscriptionModel.findOne({ tenantId }).exec();
    if (sub) return { subscription: sub, tenantId };
  }

  const customerId = extractCustomerIdFromEvent(event);
  if (customerId) {
    const sub = await SubscriptionModel.findOne({
      providerCustomerId: customerId,
    }).exec();
    if (sub) return { subscription: sub, tenantId: sub.tenantId };
  }

  const stripeSubId = extractStripeSubscriptionIdFromEvent(event);
  if (stripeSubId) {
    const sub = await SubscriptionModel.findOne({
      providerSubscriptionId: stripeSubId,
    }).exec();
    if (sub) return { subscription: sub, tenantId: sub.tenantId };
  }

  return null;
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
  return null;
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
  return obj?.subscription as string | undefined;
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
  const event = await PaymentEventModel.findOne({ eventId }).exec();
  if (!event) {
    throw new AppError(404, NOT_FOUND, "Payment event not found");
  }

  event.status = "received";
  event.processingErrors = [];
  event.processedAt = null;
  await event.save();

  const provider = await getProviderForReprocess();
  const parsed = provider.parseWebhookEvent(event.payload as Record<string, unknown>);
  await handlePaymentEvent(parsed, event.rawBody, event.signature, event);
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
