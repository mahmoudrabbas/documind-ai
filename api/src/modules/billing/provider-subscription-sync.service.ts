import { createHash } from "node:crypto";
import { Types } from "mongoose";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import type { ProviderSubscription } from "./ports/payment-provider.port.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { SubscriptionStatus } from "./billing.types.js";
import { providerStateFingerprint, shouldApplyProviderProjection } from "./provider-projection-policy.js";

export interface ResolvedPackageVersion {
  packageId: string;
  packageVersionId: string;
  packageVersion: number;
  billingInterval: "monthly" | "annual";
}

export interface ProviderSyncResolution extends ResolvedPackageVersion {
  tenantId: string;
}

export function legacyPackageVersionId(packageId: string, version: number): string {
  return createHash("sha256")
    .update(`${packageId}:${version}`)
    .digest("hex")
    .slice(0, 24);
}

function intervalFromMetadata(
  value: string | undefined,
): "monthly" | "annual" | null {
  return value === "monthly" || value === "annual" ? value : null;
}

export async function resolvePackageVersion(
  metadata: Record<string, string>,
  priceId: string,
): Promise<ResolvedPackageVersion> {
  const packageId = metadata.packageId;
  const versionNumber = Number(metadata.packageVersion);
  const requestedVersionId = metadata.packageVersionId;
  const metadataInterval = intervalFromMetadata(metadata.billingInterval);

  if (packageId && Types.ObjectId.isValid(packageId)) {
    const pkg = await PackageModel.findById(packageId).lean().exec();
    if (!pkg) throw new Error(`Stripe metadata packageId ${packageId} was not found`);

    const snapshots = pkg.versions ?? [];
    let matches = snapshots.filter((snapshot) => {
      if (requestedVersionId) {
        const actualId = snapshot._id?.toString();
        const compatibleLegacyId = legacyPackageVersionId(packageId, snapshot.version);
        return actualId === requestedVersionId || compatibleLegacyId === requestedVersionId;
      }
      return Number.isInteger(versionNumber) && snapshot.version === versionNumber;
    });

    // Packages created before snapshots had identities still have one canonical
    // current version represented by the top-level package fields.
    if (
      matches.length === 0 &&
      snapshots.length === 0 &&
      Number.isInteger(versionNumber) &&
      pkg.version === versionNumber
    ) {
      matches = [{
        _id: new Types.ObjectId(legacyPackageVersionId(packageId, versionNumber)),
        version: versionNumber,
        stripePriceId: pkg.stripePriceId,
        stripeAnnualPriceId: pkg.stripeAnnualPriceId,
      } as (typeof snapshots)[number]];
    }

    if (matches.length !== 1) {
      throw new Error(
        `Stripe package version mapping is ${matches.length === 0 ? "missing" : "ambiguous"} for package ${packageId}`,
      );
    }

    const snapshot = matches[0];
    const inferredInterval =
      priceId && snapshot.stripeAnnualPriceId === priceId
        ? "annual"
        : priceId && snapshot.stripePriceId === priceId
          ? "monthly"
          : null;
    const billingInterval = metadataInterval ?? inferredInterval;
    if (!billingInterval) throw new Error("Stripe billing interval could not be resolved");

    return {
      packageId,
      packageVersionId:
        snapshot._id?.toString() ?? legacyPackageVersionId(packageId, snapshot.version),
      packageVersion: snapshot.version,
      billingInterval,
    };
  }

  if (!priceId) throw new Error("Stripe event has no package metadata or price ID");

  const packages = await PackageModel.find({
    $or: [
      { stripePriceId: priceId },
      { stripeAnnualPriceId: priceId },
      { "versions.stripePriceId": priceId },
      { "versions.stripeAnnualPriceId": priceId },
    ],
  })
    .lean()
    .exec();

  const candidates: ResolvedPackageVersion[] = [];
  for (const pkg of packages) {
    const packageIdValue = String(pkg._id);
    for (const snapshot of pkg.versions ?? []) {
      if (snapshot.stripePriceId === priceId || snapshot.stripeAnnualPriceId === priceId) {
        candidates.push({
          packageId: packageIdValue,
          packageVersionId:
            snapshot._id?.toString() ?? legacyPackageVersionId(packageIdValue, snapshot.version),
          packageVersion: snapshot.version,
          billingInterval: snapshot.stripeAnnualPriceId === priceId ? "annual" : "monthly",
        });
      }
    }
    if ((pkg.versions?.length ?? 0) === 0 && (pkg.stripePriceId === priceId || pkg.stripeAnnualPriceId === priceId)) {
      candidates.push({
        packageId: packageIdValue,
        packageVersionId: legacyPackageVersionId(packageIdValue, pkg.version),
        packageVersion: pkg.version,
        billingInterval: pkg.stripeAnnualPriceId === priceId ? "annual" : "monthly",
      });
    }
  }

  if (candidates.length !== 1) {
    throw new Error(
      `Stripe price ${priceId} mapping is ${candidates.length === 0 ? "missing" : "ambiguous"}`,
    );
  }
  return candidates[0];
}

export async function resolveProviderSubscription(
  providerSubscription: ProviderSubscription,
  tenantHint?: string,
): Promise<ProviderSyncResolution> {
  const tenantCandidates = new Set<string>();
  if (tenantHint && Types.ObjectId.isValid(tenantHint)) tenantCandidates.add(tenantHint);
  if (Types.ObjectId.isValid(providerSubscription.metadata.tenantId)) {
    tenantCandidates.add(providerSubscription.metadata.tenantId);
  }

  const linked = await SubscriptionModel.find({
    $or: [
      { providerSubscriptionId: providerSubscription.id },
      { providerCustomerId: providerSubscription.customerId },
    ],
  })
    .select("tenantId")
    .lean()
    .exec();
  linked.forEach((subscription) => tenantCandidates.add(String(subscription.tenantId)));
  if (tenantCandidates.size !== 1) {
    throw new Error(
      `Stripe subscription ${providerSubscription.id} tenant mapping is ${tenantCandidates.size === 0 ? "missing" : "ambiguous"}`,
    );
  }

  return {
    tenantId: [...tenantCandidates][0],
    ...(await resolvePackageVersion(
      providerSubscription.metadata,
      providerSubscription.priceId,
    )),
  };
}

export function providerPaymentState(status: string): "pending" | "paid" | "failed" {
  if (status === "active" || status === "trialing") return "paid";
  if (status === "incomplete") return "pending";
  return "failed";
}

export function providerSubscriptionStatus(status: string) {
  const statuses = {
    active: "ACTIVE",
    trialing: "ACTIVE",
    past_due: "PAST_DUE",
    unpaid: "UNPAID",
    incomplete: "INCOMPLETE",
    incomplete_expired: "EXPIRED",
    canceled: "CANCELED",
    paused: "PAUSED",
  } as const;
  return statuses[status as keyof typeof statuses] ?? null;
}

export interface ProviderSubscriptionSyncInput {
  providerSubscription: ProviderSubscription;
  tenantId: string;
  provider: string;
  sourceId: string;
  sourceType: "webhook" | "checkout_session_sync";
  sourceTimestamp?: Date;
  providerStateObservedAt?: Date;
}

function sameDate(left: unknown, right: Date | null): boolean {
  const leftTime = left instanceof Date
    ? left.getTime()
    : typeof left === "string"
      ? new Date(left).getTime()
      : null;
  return leftTime === right?.getTime() || (leftTime === null && right === null);
}

function hasProviderStateChanged(
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
): boolean {
  return (
    String(current.packageId) !== String(desired.packageId) ||
    String(current.packageVersionId ?? "") !== String(desired.packageVersionId) ||
    current.packageVersion !== desired.packageVersion ||
    current.status !== desired.status ||
    current.providerCustomerId !== desired.providerCustomerId ||
    current.providerSubscriptionId !== desired.providerSubscriptionId ||
    current.providerPriceId !== desired.providerPriceId ||
    current.provider !== desired.provider ||
    current.billingInterval !== desired.billingInterval ||
    current.paymentState !== desired.paymentState ||
    current.cancelAtPeriodEnd !== desired.cancelAtPeriodEnd ||
    !sameDate(current.currentPeriodStart, desired.currentPeriodStart as Date | null) ||
    !sameDate(current.currentPeriodEnd, desired.currentPeriodEnd as Date | null)
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Apply the provider's current subscription snapshot. Both webhooks and the
 * authenticated Checkout return recovery path converge here.
 */
export async function synchronizeProviderSubscription(
  input: ProviderSubscriptionSyncInput,
): Promise<{ changed: boolean; subscription: Record<string, unknown> }> {
  const resolution = await resolveProviderSubscription(
    input.providerSubscription,
    input.tenantId,
  );
  if (resolution.tenantId !== input.tenantId) {
    throw new Error("Provider subscription tenant ownership mismatch");
  }

  const status = providerSubscriptionStatus(input.providerSubscription.status);
  if (!status) {
    throw new Error("Unsupported provider subscription status");
  }

  const desired: Record<string, unknown> = {
    packageId: new Types.ObjectId(resolution.packageId),
    packageVersionId: new Types.ObjectId(resolution.packageVersionId),
    packageVersion: resolution.packageVersion,
    providerCustomerId: input.providerSubscription.customerId,
    providerSubscriptionId: input.providerSubscription.id,
    providerPriceId: input.providerSubscription.priceId,
    provider: input.provider,
    billingInterval: resolution.billingInterval,
    status: (input.providerSubscription.cancelAtPeriodEnd && status === "ACTIVE" ? "CANCEL_AT_PERIOD_END" : status) as SubscriptionStatus,
    paymentState: providerPaymentState(input.providerSubscription.status),
    periodStart: input.providerSubscription.currentPeriodStart,
    periodEnd: input.providerSubscription.currentPeriodEnd,
    currentPeriodStart: input.providerSubscription.currentPeriodStart,
    currentPeriodEnd: input.providerSubscription.currentPeriodEnd,
    cancelAtPeriodEnd: input.providerSubscription.cancelAtPeriodEnd,
    lastProviderEventId: input.sourceId,
    lastProviderEventTimestamp: input.sourceTimestamp ?? new Date(),
    providerStateObservedAt: input.providerStateObservedAt ?? new Date(),
  };

  let changed = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(input.tenantId),
    }).lean().exec() as unknown as Record<string, unknown> | null;

    if (!current) {
      try {
        const created = await SubscriptionModel.updateOne(
          { tenantId: new Types.ObjectId(input.tenantId) },
          {
            $setOnInsert: { tenantId: new Types.ObjectId(input.tenantId), startedAt: new Date() },
            $set: desired,
          },
          { upsert: true },
        );
        changed = created.upsertedCount === 1 || created.modifiedCount === 1;
        break;
      } catch (error) {
        // A webhook and Checkout return can both observe no row before the
        // tenant-unique upsert. The winner owns the transition; the loser
        // retries against the newly persisted snapshot.
        if (isDuplicateKeyError(error)) continue;
        throw error;
      }
    }

    if (!shouldApplyProviderProjection({
      currentlyAppliedObservedAt: current.providerStateObservedAt instanceof Date ? current.providerStateObservedAt : null,
      incomingObservedAt: desired.providerStateObservedAt as Date,
      currentFingerprint: providerStateFingerprint(current), incomingFingerprint: providerStateFingerprint(desired),
      readCurrentProviderState: true,
    })) break;
    if (!hasProviderStateChanged(current, desired)) break;
    const result = await SubscriptionModel.updateOne(
      {
        _id: new Types.ObjectId(String(current._id)),
        revision: Number(current.revision),
      },
      { $set: desired },
    );
    if (result.modifiedCount === 1) {
      changed = true;
      break;
    }
  }

  const synchronized = await SubscriptionModel.findOne({
    tenantId: new Types.ObjectId(input.tenantId),
  }).lean().exec() as unknown as Record<string, unknown> | null;
  if (!synchronized) throw new Error("Synchronized subscription was not found");

  if (changed) {
    await getAuditWriter().write({
      action: "SUBSCRIPTION_UPDATED",
      resourceType: "Subscription",
      resourceId: String(synchronized._id),
      tenantId: input.tenantId,
      changes: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status,
        packageId: resolution.packageId,
        packageVersionId: resolution.packageVersionId,
      },
    });
  }

  return { changed, subscription: synchronized };
}
