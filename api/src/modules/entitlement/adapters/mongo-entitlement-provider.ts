import mongoose from "mongoose";
import type { EntitlementProviderPort } from "../ports/entitlement-provider.port.js";
import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";
import { entitlementSnapshotFrom } from "../../billing/ports/entitlement-snapshot.port.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import PackageModel from "../../../db/models/package.model.js";

export class MongoEntitlementProvider implements EntitlementProviderPort {
  async getSnapshot(tenantId: string): Promise<EntitlementSnapshot | null> {
    // Find subscription for tenant
    const subscription = await SubscriptionModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
    });

    if (!subscription) {
      return null; // No subscription = fail closed
    }

    // Find package
    const pkg = await PackageModel.findById(subscription.packageId);

    if (!pkg) {
      return null; // No package = fail closed
    }

    // Find the matching version's entitlements
    const version = pkg.versions?.find(
      (v) => v.version === subscription.packageVersion,
    );

    if (!version?.entitlements) {
      return null; // No entitlements = fail closed
    }

    // Build snapshot using the canonical builder
    return entitlementSnapshotFrom(version.entitlements, {
      supportedModels: version.supportedModels,
      analyticsLevel: version.analyticsLevel,
      retentionDays: version.retentionDays,
      supportLevel: version.supportLevel,
    });
  }

  async getPeriodRange(
    tenantId: string,
  ): Promise<{ periodStart: Date; periodEnd: Date | null }> {
    const subscription = await SubscriptionModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
    });

    if (!subscription) {
      return {
        periodStart: new Date(),
        periodEnd: null,
      };
    }

    return {
      periodStart: subscription.periodStart ?? new Date(),
      periodEnd: subscription.periodEnd ?? null,
    };
  }
}
