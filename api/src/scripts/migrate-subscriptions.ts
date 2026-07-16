import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../db/connection.js";
import TenantModel from "../db/models/tenant.model.js";
import PackageModel from "../db/models/package.model.js";
import SubscriptionModel from "../db/models/subscription.model.js";

interface MigrationSummary {
  totalTenantsWithoutSubscription: number;
  subscriptionsCreated: number;
  skippedNoPackage: number;
  errors: number;
}

interface PackageInfo {
  _id: mongoose.Types.ObjectId;
  code: string;
  version: number;
}

type Mode = "dry-run" | "execute";

function getMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes("--execute")) return "execute";
  return "dry-run";
}

async function main() {
  const mode = getMode();
  console.info(`Subscription migration mode: ${mode}`);
  console.info("");

  await connectDB();

  // Gather all tenants that already have a subscription (idempotent guard).
  const subscribedTenantIds = await SubscriptionModel.distinct("tenantId");
  const tenantsWithoutSub = await TenantModel.find({
    _id: { $nin: subscribedTenantIds },
  }).lean();

  const summary: MigrationSummary = {
    totalTenantsWithoutSubscription: tenantsWithoutSub.length,
    subscriptionsCreated: 0,
    skippedNoPackage: 0,
    errors: 0,
  };

  if (tenantsWithoutSub.length === 0) {
    console.info("All tenants already have a subscription. Nothing to do.");
    return;
  }

  console.info(
    `Found ${tenantsWithoutSub.length} tenant(s) without a subscription.`,
  );
  console.info("");

  // Resolve the default free package once so we don't query per tenant.
  const defaultFreePackage = await PackageModel.findOne({
    code: "free",
    active: true,
  }).lean();
  if (!defaultFreePackage) {
    console.warn(
      "Default free package (code='free', active=true) not found. " +
        "Tenants without a selectedPackageCode will be skipped. " +
        "Run seed-default-package.ts first if needed.",
    );
  }

  for (const tenant of tenantsWithoutSub) {
    try {
      // Determine which package to subscribe to.
      let pkg: PackageInfo | null = null;
      let packageSource: string;

      if (tenant.selectedPackageCode) {
        pkg = await PackageModel.findOne({
          code: tenant.selectedPackageCode,
          active: true,
        }).lean();
        packageSource = `selectedPackageCode="${tenant.selectedPackageCode}"`;
      } else {
        pkg = defaultFreePackage;
        packageSource = "default free package (code='free')";
      }

      if (!pkg) {
        console.warn(
          `[SKIP] Tenant "${tenant.slug}" (${tenant._id}): ${packageSource} not found or inactive`,
        );
        summary.skippedNoPackage++;
        continue;
      }

      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (mode === "execute") {
        await SubscriptionModel.create({
          tenantId: tenant._id,
          packageId: pkg._id,
          packageVersion: pkg.version,
          status: "TRIALING",
          startedAt: now,
          periodEnd,
          trialStart: now,
          trialEnd: periodEnd,
        });

        // Clean up the transient selectedPackageCode now that a subscription exists.
        await TenantModel.updateOne(
          { _id: tenant._id },
          { $unset: { selectedPackageCode: "" } },
        );

        console.info(
          `[CREATE] Tenant "${tenant.slug}" (${tenant._id}): ` +
            `subscription created — package="${pkg.code}" (${packageSource})`,
        );
      } else {
        console.info(
          `[DRY-RUN] Tenant "${tenant.slug}" (${tenant._id}): ` +
            `would create subscription with package="${pkg.code}" (${packageSource}) ` +
            "and $unset selectedPackageCode",
        );
      }

      summary.subscriptionsCreated++;
    } catch (err) {
      console.error(
        `[ERROR] Tenant "${tenant.slug}" (${tenant._id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      summary.errors++;
    }
  }

  // --- Summary ---
  console.info("");
  console.info("=== Migration Summary ===");
  console.info(
    `Tenants without subscription (processed): ${summary.totalTenantsWithoutSubscription}`,
  );
  console.info(
    `${mode === "execute" ? "Subscriptions created" : "Would create"}: ${summary.subscriptionsCreated}`,
  );
  console.info(`Skipped (no matching package):  ${summary.skippedNoPackage}`);
  console.info(`Errors:                        ${summary.errors}`);

  if (mode === "dry-run" && summary.totalTenantsWithoutSubscription > 0) {
    console.info("");
    console.info("Tip: re-run with --execute to apply these changes.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Subscription migration failed",
    );
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
