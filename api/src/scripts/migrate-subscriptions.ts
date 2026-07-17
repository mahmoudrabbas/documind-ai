import "dotenv/config";
import { connectDB, disconnectDB } from "../db/connection.js";
import TenantModel from "../db/models/tenant.model.js";
import SubscriptionModel from "../db/models/subscription.model.js";
import PackageModel from "../db/models/package.model.js";
import type { FlattenMaps } from "mongoose";

type LeanTenant = FlattenMaps<{
  _id: import("mongoose").Types.ObjectId;
  slug: string;
  selectedPackageCode?: string | null;
  plan: string;
  name: string;
}>;

type LeanPackage = FlattenMaps<{
  _id: import("mongoose").Types.ObjectId;
  code: string;
  version: number;
}>;

type Mode = "dry-run" | "execute";

function parseArgs(): Mode {
  const args = process.argv.slice(2);
  const hasDryRun = args.includes("--dry-run");
  const hasExecute = args.includes("--execute");

  if (!hasDryRun && !hasExecute) {
    console.error("Specify --dry-run or --execute");
    process.exit(1);
  }

  if (hasDryRun && hasExecute) {
    console.error("Specify only one of --dry-run or --execute");
    process.exit(1);
  }

  return hasDryRun ? "dry-run" : "execute";
}

interface MigrationSummary {
  total: number;
  created: number;
  skipped: number;
  errors: number;
  warnings: string[];
}

async function findOrCreateFreePackage(): Promise<LeanPackage> {
  const existing = await PackageModel.findOne({ code: "free" }).lean();
  if (existing) {
    return existing as LeanPackage;
  }

  const created = await PackageModel.create({
    name: "Free",
    code: "free",
    description: "Get started with basic document management",
    active: true,
    version: 1,
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "USD",
    trialDays: 0,
    visibility: "public",
    entitlements: {
      employees: 3,
      admins: 1,
      documents: 50,
      storageMb: 100,
      fileSizeMb: 10,
      queriesPerMonth: 500,
      tokensPerMonth: 0,
      ocrPagesPerMonth: 0,
    },
    supportedModels: ["basic"],
    analyticsLevel: "basic",
    retentionDays: 90,
    supportLevel: "community",
  });
  console.info("Created default free package on the fly.");
  return { _id: created._id, code: "free", version: created.version };
}

async function main(): Promise<void> {
  const mode = parseArgs();
  const isDryRun = mode === "dry-run";

  console.info(`Mode: ${mode}`);
  console.info("");

  await connectDB();

  const rawTenants = await TenantModel.find({}).lean();
  const tenants = rawTenants as LeanTenant[];
  const summary: MigrationSummary = {
    total: tenants.length,
    created: 0,
    skipped: 0,
    errors: 0,
    warnings: [],
  };

  for (const tenant of tenants) {
    try {
      if (tenant.selectedPackageCode) {
        await migrateTenantWithPackage(tenant, isDryRun, summary);
      } else {
        await migrateTenantWithoutPackage(tenant, isDryRun, summary);
      }
    } catch (err) {
      summary.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error processing tenant "${tenant.slug}": ${msg}`);
    }
  }

  // Summary
  console.info("");
  console.info("=== Migration Summary ===");
  console.info(`  Total tenants processed: ${summary.total}`);
  console.info(`  Subscriptions created:   ${summary.created}`);
  console.info(`  Subscriptions skipped:   ${summary.skipped}`);
  console.info(`  Errors:                  ${summary.errors}`);

  if (summary.warnings.length > 0) {
    console.info("");
    console.info("Warnings:");
    for (const w of summary.warnings) {
      console.info(`  - ${w}`);
    }
  }

  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

async function migrateTenantWithPackage(
  tenant: LeanTenant,
  isDryRun: boolean,
  summary: MigrationSummary,
): Promise<void> {
  const slug = tenant.slug;
  const tenantId = tenant._id;
  const selectedCode = tenant.selectedPackageCode!;

  // Find matching active package by code
  const pkg = await PackageModel.findOne({
    code: selectedCode,
    active: true,
  }).lean();

  if (!pkg) {
    summary.warnings.push(
      `Tenant "${slug}" has selectedPackageCode="${selectedCode}" ` +
        "but no active Package with that code exists.",
    );
    return;
  }

  // Check if subscription already exists (idempotent)
  const existingSub = await SubscriptionModel.findOne({
    tenantId,
  }).lean();

  if (existingSub) {
    summary.skipped += 1;
    console.info(
      `[SKIP] Tenant "${slug}" \u2014 subscription already exists.`,
    );

    // Still clean up the deprecated field even when skipping
    // (the subscription was likely created by a prior migration run)
    if (!isDryRun) {
      await TenantModel.updateOne(
        { _id: tenantId },
        { $unset: { selectedPackageCode: "" } },
      );
    }
    return;
  }

  if (isDryRun) {
    console.info(
      `[DRY-RUN] Would create TRIALING subscription for tenant "${slug}" ` +
        `with package "${pkg.code}" (v${pkg.version}), ` +
        "periodEnd=+30d, and unset selectedPackageCode.",
    );
    summary.created += 1;
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await SubscriptionModel.create({
    tenantId,
    packageId: pkg._id,
    packageVersion: pkg.version,
    status: "TRIALING",
    startedAt: now,
    periodEnd,
  });

  await TenantModel.updateOne(
    { _id: tenantId },
    { $unset: { selectedPackageCode: "" } },
  );

  summary.created += 1;
  console.info(
    `[CREATED] Tenant "${slug}" \u2014 TRIALING subscription with package "${pkg.code}".`,
  );
}

async function migrateTenantWithoutPackage(
  tenant: LeanTenant,
  isDryRun: boolean,
  summary: MigrationSummary,
): Promise<void> {
  const slug = tenant.slug;
  const tenantId = tenant._id;

  // Find or create the default free package
  let pkg: LeanPackage;

  if (!isDryRun) {
    pkg = await findOrCreateFreePackage();
  } else {
    const existing = await PackageModel.findOne({
      code: "free",
      active: true,
    }).lean();

    if (!existing) {
      console.info(
        `[DRY-RUN] Would create default free package and ACTIVE ` +
          `subscription for tenant "${slug}".`,
      );
      summary.created += 1;
      return;
    }
    pkg = existing as LeanPackage;
  }

  // Check if subscription already exists (idempotent)
  const existingSub = await SubscriptionModel.findOne({
    tenantId,
  }).lean();

  if (existingSub) {
    summary.skipped += 1;
    console.info(
      `[SKIP] Tenant "${slug}" \u2014 subscription already exists.`,
    );
    return;
  }

  if (isDryRun) {
    console.info(
      `[DRY-RUN] Would create ACTIVE subscription for tenant "${slug}" ` +
        'with package "free" (v1).',
    );
    summary.created += 1;
    return;
  }

  await SubscriptionModel.create({
    tenantId,
    packageId: pkg._id,
    packageVersion: 1,
    status: "ACTIVE",
    startedAt: new Date(),
  });

  summary.created += 1;
  console.info(
    `[CREATED] Tenant "${slug}" \u2014 ACTIVE subscription with package "free".`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Migration failed",
    );
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
