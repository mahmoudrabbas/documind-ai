import SubscriptionModel from "../../db/models/subscription.model.js";
import PaymentEventModel from "../../db/models/paymentEvent.model.js";
import { logger } from "../../common/logger/logger.js";

export interface ReconciliationResult {
  totalSubscriptions: number;
  mismatched: Array<{
    tenantId: string;
    localStatus: string;
    localPaymentState: string;
    lastProviderEventId: string;
    issues: string[];
  }>;
}

export async function reconcileSubscriptions(): Promise<ReconciliationResult> {
  const subscriptions = await SubscriptionModel.find({}).lean().exec();
  const mismatched: ReconciliationResult["mismatched"] = [];

  for (const sub of subscriptions) {
    const issues: string[] = [];
    const tenantId = String(sub.tenantId);

    if (sub.status === "ACTIVE" && sub.paymentState === "failed") {
      issues.push("Status is ACTIVE but paymentState is failed");
    }

    if (sub.status === "PAST_DUE" && sub.paymentState === "paid") {
      issues.push("Status is PAST_DUE but paymentState is paid");
    }

    if (sub.providerSubscriptionId && sub.status === "ACTIVE") {
      const recentEvent = await PaymentEventModel.findOne({
        tenantId: sub.tenantId,
        status: "processed",
      })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      if (
        recentEvent &&
        recentEvent.eventType === "customer.subscription.deleted"
      ) {
        issues.push(
          "Status is ACTIVE but latest processed event is customer.subscription.deleted",
        );
      }
    }

    if (issues.length > 0) {
      mismatched.push({
        tenantId,
        localStatus: sub.status,
        localPaymentState: sub.paymentState,
        lastProviderEventId: sub.lastProviderEventId,
        issues,
      });
    }
  }

  logger.info(
    { total: subscriptions.length, mismatched: mismatched.length },
    "Subscription reconciliation complete",
  );

  return {
    totalSubscriptions: subscriptions.length,
    mismatched,
  };
}
