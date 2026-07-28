import { createHash } from "node:crypto";
import { Types } from "mongoose";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import type { ProviderSubscription } from "./ports/payment-provider.port.js";

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
