import "dotenv/config";
import mongoose from "mongoose";
import {
  LEGACY_PLATFORM_TENANT_SLUGS,
  PLATFORM_TENANT_SLUG,
} from "../common/auth/platformTenant.js";
import { connectDB, disconnectDB } from "../db/connection.js";

type Mode = "dry-run" | "apply";

type MigrationReport = {
  success: true;
  mode: Mode;
  platformSlug: string;
  canonicalTenantId: string | null;
  legacyPlatformTenants: Array<{
    id: string;
    slug: unknown;
    name: unknown;
    isSystemTenant: unknown;
  }>;
  unsafeGlobalEmailIndexes: string[];
  changesApplied: string[];
  manualRemediationRequired: string[];
  superAdminsOutsidePlatform?: number;
  nonSuperAdminsInsidePlatform?: number;
};

function parseMode(arguments_: string[]): Mode {
  if (arguments_.length === 0) return "dry-run";
  if (arguments_.length === 1 && arguments_[0] === "--dry-run") return "dry-run";
  if (arguments_.length === 1 && arguments_[0] === "--apply") return "apply";
  throw new Error("Usage: tsx src/scripts/migrate-platform-tenant-invariants.ts [--dry-run|--apply]");
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  await connectDB();
  if (!mongoose.connection.db) throw new Error("MongoDB connection is unavailable");

  const tenants = mongoose.connection.db.collection("tenants");
  const users = mongoose.connection.db.collection("users");
  const indexes = await users.indexes();

  const canonicalTenant = await tenants.findOne({ slug: PLATFORM_TENANT_SLUG });
  const legacyPlatformTenants = await tenants
    .find({ slug: { $in: [...LEGACY_PLATFORM_TENANT_SLUGS] } })
    .project({ _id: 1, slug: 1, name: 1, isSystemTenant: 1 })
    .toArray();

  const report: MigrationReport = {
    success: true,
    mode,
    platformSlug: PLATFORM_TENANT_SLUG,
    canonicalTenantId: canonicalTenant?._id?.toString() ?? null,
    legacyPlatformTenants: legacyPlatformTenants.map((tenant) => ({
      id: tenant._id.toString(),
      slug: tenant.slug,
      name: tenant.name,
      isSystemTenant: tenant.isSystemTenant ?? false,
    })),
    unsafeGlobalEmailIndexes: indexes
      .filter((index) => index.unique && JSON.stringify(index.key) === JSON.stringify({ email: 1 }))
      .map((index) => index.name ?? "unnamed_email_index"),
    changesApplied: [],
    manualRemediationRequired: [],
  };

  const changesApplied = report.changesApplied;
  const manual = report.manualRemediationRequired;

  let platformTenantId = canonicalTenant?._id ?? null;
  if (!canonicalTenant && legacyPlatformTenants.length === 1) {
    const legacyTenant = legacyPlatformTenants[0];
    if (!legacyTenant) {
      throw new Error("Legacy platform tenant could not be resolved");
    }
    const resolvedLegacyTenantId = legacyTenant._id;
    platformTenantId = resolvedLegacyTenantId;
    if (mode === "apply") {
      await tenants.updateOne(
        { _id: resolvedLegacyTenantId },
        {
          $set: {
            slug: PLATFORM_TENANT_SLUG,
            name: legacyTenant.name ?? "DocuMind Platform",
            status: "active",
            plan: "free",
            isSystemTenant: true,
          },
        },
      );
      changesApplied.push(`renamed legacy platform tenant ${legacyTenant._id.toString()} to ${PLATFORM_TENANT_SLUG}`);
    } else {
      changesApplied.push(`would rename legacy platform tenant ${legacyTenant._id.toString()} to ${PLATFORM_TENANT_SLUG}`);
    }
  } else if (!canonicalTenant) {
    manual.push("No canonical platform tenant exists and legacy platform tenant selection is ambiguous.");
  } else if (mode === "apply") {
    await tenants.updateOne(
      { _id: canonicalTenant._id },
      { $set: { isSystemTenant: true, status: "active" } },
    );
    changesApplied.push(`ensured canonical platform tenant ${canonicalTenant._id.toString()} is active/system`);
  } else {
    changesApplied.push(`would ensure canonical platform tenant ${canonicalTenant._id.toString()} is active/system`);
  }

  if (!platformTenantId) {
    manual.push("Reserved platform tenant could not be resolved; user-role invariant counts were skipped.");
  } else {
    const resolvedPlatformTenantId = platformTenantId;
    const [superAdminsOutsidePlatform, nonSuperAdminsInsidePlatform] = await Promise.all([
      users.countDocuments({ role: "SUPER_ADMIN", tenantId: { $ne: resolvedPlatformTenantId } }),
      users.countDocuments({ role: { $in: ["COMPANY_ADMIN", "EMPLOYEE"] }, tenantId: resolvedPlatformTenantId }),
    ]);
    report.superAdminsOutsidePlatform = superAdminsOutsidePlatform;
    report.nonSuperAdminsInsidePlatform = nonSuperAdminsInsidePlatform;
    if (superAdminsOutsidePlatform > 0) {
      manual.push("SUPER_ADMIN users exist outside documind.ai and must be reviewed before sessions are trusted.");
    }
    if (nonSuperAdminsInsidePlatform > 0) {
      manual.push("COMPANY_ADMIN/EMPLOYEE users exist inside documind.ai and must be moved or disabled after review.");
    }
  }

  if (report.unsafeGlobalEmailIndexes.length > 0) {
    manual.push("Unique global email indexes conflict with tenant-scoped identity and must be dropped manually after backup.");
  }

  console.info(JSON.stringify(report, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      success: false,
      code: "PLATFORM_TENANT_INVARIANT_MIGRATION_FAILED",
      message: error instanceof Error ? error.message : "Unknown migration error",
    }));
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
