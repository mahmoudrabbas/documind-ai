import { Types } from "mongoose";
import PaymentEventModel from "../../db/models/paymentEvent.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { transitionSubscription } from "../billing/subscription.service.js";
import type { PaymentProviderEvent } from "../billing/ports/payment-provider.port.js";
import type { SubscriptionStatus } from "../billing/billing.types.js";

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
  "customer.subscription.updated": {
    toStatus: "ACTIVE",
    paymentState: "paid",
    fromStatuses: ["INCOMPLETE", "PAST_DUE", "ACTIVE", "CANCEL_AT_PERIOD_END"],
  },
  "customer.subscription.deleted": {
    toStatus: "EXPIRED",
    paymentState: "failed",
    fromStatuses: ["ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"],
  },
};

export async function handlePaymentEvent(
  event: PaymentProviderEvent,
  rawBody: string,
  signature: string,
): Promise<void> {
  const existing = await PaymentEventModel.findOne({
    eventId: event.id,
  }).exec();
  if (existing) {
    logger.info({ eventId: event.id }, "Duplicate webhook event — skipping");
    return;
  }

  const eventRecord = await PaymentEventModel.create({
    eventId: event.id,
    eventType: event.type,
    provider: event.provider,
    status: "received",
    signature,
    rawBody,
    payload: event.raw,
    processingErrors: [],
  });

  try {
    eventRecord.status = "verified";

    const mapping = EVENT_STATUS_MAP[event.type];

    if (mapping) {
      const tenantId = extractTenantFromEvent(event);
      if (!tenantId) {
        eventRecord.processingErrors.push(
          "No tenantId found in event metadata",
        );
        eventRecord.status = "failed";
        await eventRecord.save();
        return;
      }

      const sub = await SubscriptionModel.findOne({
        tenantId,
      }).exec();

      if (sub) {
        const currentStatus = sub.status as SubscriptionStatus;

        if (mapping.fromStatuses.includes(currentStatus)) {
          await transitionSubscription(
            String(tenantId),
            mapping.toStatus,
            {
              triggeredBy: "provider_event",
              providerEventId: event.id,
            },
          );
        }

        await SubscriptionModel.updateOne(
          { tenantId },
          {
            $set: {
              paymentState: mapping.paymentState,
              lastProviderEventId: event.id,
              providerSubscriptionId:
                extractSubscriptionId(event) ??
                sub.providerSubscriptionId,
            },
          },
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
      } else {
        eventRecord.processingErrors.push(
          "No subscription found for tenant",
        );
      }
    }

    eventRecord.status = "processed";
    eventRecord.processedAt = new Date();
    await eventRecord.save();
  } catch (error) {
    logger.error({ err: error, eventId: event.id }, "Failed to process payment event");
    eventRecord.status = "failed";
    eventRecord.processingErrors.push(
      error instanceof Error ? error.message : "Unknown error",
    );
    await eventRecord.save();
  }
}

export async function listPaymentEvents(filter: {
  page: number;
  pageSize: number;
  status?: string;
  eventType?: string;
}) {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;
  if (filter.eventType) query.eventType = filter.eventType;

  const [events, totalRecords] = await Promise.all([
    PaymentEventModel.find(query)
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

export async function reprocessEvent(eventId: string): Promise<void> {
  const event = await PaymentEventModel.findOne({ eventId }).exec();
  if (!event) {
    throw new Error(`Payment event ${eventId} not found`);
  }

  event.status = "received";
  event.processingErrors = [];
  event.processedAt = null;
  await event.save();

  const provider = await getProviderForReprocess();
  const parsed = provider.parseWebhookEvent(event.payload as Record<string, unknown>);
  await handlePaymentEvent(parsed, event.rawBody, event.signature);
}

async function getProviderForReprocess() {
  const { getPaymentProvider } = await import(
    "../checkout/payment-provider-loader.js"
  );
  return getPaymentProvider();
}

function extractTenantFromEvent(
  event: PaymentProviderEvent,
): Types.ObjectId | null {
  const rawData = event.raw.data as Record<string, unknown> | undefined;
  const rawObject = rawData?.object as Record<string, unknown> | undefined;
  const metadata = rawObject?.metadata as Record<string, string> | undefined;
  if (metadata?.tenantId) return new Types.ObjectId(metadata.tenantId);
  return null;
}

function extractSubscriptionId(
  event: PaymentProviderEvent,
): string | undefined {
  const rawData = event.raw.data as Record<string, unknown> | undefined;
  const obj = rawData?.object as Record<string, unknown> | undefined;
  return obj?.subscription as string | undefined;
}

function extractCheckoutSessionId(
  event: PaymentProviderEvent,
): string | undefined {
  const rawData = event.raw.data as Record<string, unknown> | undefined;
  const obj = rawData?.object as Record<string, unknown> | undefined;
  return obj?.id as string | undefined;
}
