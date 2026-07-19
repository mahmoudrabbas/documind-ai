import "dotenv/config";
import { connectDB, disconnectDB } from "../db/connection.js";
import PackageModel from "../db/models/package.model.js";

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

interface LegacyLimits {
  users: number;
  documents: number;
  questionsPerMonth: number;
  storageMb: number;
}

function entitlementsFromLimits(l: LegacyLimits) {
  return {
    employees: l.users,
    admins: 1,
    documents: l.documents,
    storageMb: l.storageMb,
    fileSizeMb: 10,
    queriesPerMonth: l.questionsPerMonth,
    tokensPerMonth: 0,
    ocrPagesPerMonth: 0,
  };
}

interface MigrationSummary {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
}

async function main(): Promise<void> {
  const mode = parseArgs();
  const isDryRun = mode === "dry-run";

  console.info(`Mode: ${mode}`);
  console.info("");

  await connectDB();

  const packages = await PackageModel.find({}).lean().exec();
  const summary: MigrationSummary = {
    total: packages.length,
    migrated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const pkg of packages) {
    try {
      const hasRootEntitlements = pkg.entitlements != null;
      const hasLegacyLimits = pkg.limits != null;
      const hasVersionWithoutEntitlements = (pkg.versions ?? []).some(
        (v: any) => !v.entitlements,
      );

      if (hasRootEntitlements && !hasVersionWithoutEntitlements) {
        summary.skipped += 1;
        console.info(
          `[SKIP] Package "${pkg.name}" (${pkg.code}) — already migrated.`,
        );
        continue;
      }

      const rootEntitlements = hasRootEntitlements
        ? pkg.entitlements
        : hasLegacyLimits
          ? entitlementsFromLimits(pkg.limits as unknown as LegacyLimits)
          : null;

      if (!rootEntitlements) {
        console.warn(
          `[WARN] Package "${pkg.name}" (${pkg.code}) — no root entitlements or limits found. Skipping.`,
        );
        summary.skipped += 1;
        continue;
      }

      if (isDryRun) {
        console.info(
          `[DRY-RUN] Would migrate package "${pkg.name}" (${pkg.code}):` +
            ` set root entitlements, convert ${pkg.versions?.length ?? 0} version snapshot(s).`,
        );
        summary.migrated += 1;
        continue;
      }

      const setFields: Record<string, unknown> = {};

      if (!hasRootEntitlements) {
        setFields.entitlements = rootEntitlements;
      }

      // Convert each version snapshot that lacks entitlements
      const updatedVersions = (pkg.versions ?? []).map((v: any) => {
        if (v.entitlements) return v;
        if (v.limits) {
          return { ...v, entitlements: entitlementsFromLimits(v.limits), $unset: { limits: "" } };
        }
        return { ...v, entitlements: rootEntitlements };
      });

      if (hasVersionWithoutEntitlements) {
        await PackageModel.updateOne(
          { _id: pkg._id },
          {
            ...(Object.keys(setFields).length > 0 ? { $set: setFields } : {}),
            $set: { versions: updatedVersions },
          },
        ).exec();
      } else if (Object.keys(setFields).length > 0) {
        await PackageModel.updateOne(
          { _id: pkg._id },
          { $set: setFields },
        ).exec();
      }

      summary.migrated += 1;
      console.info(
        `[MIGRATED] Package "${pkg.name}" (${pkg.code}) — root entitlements: ${hasRootEntitlements ? "kept" : "created"}, versions: ${updatedVersions.length} snapshot(s) normalised.`,
      );
    } catch (err) {
      summary.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error processing package "${pkg.name}": ${msg}`);
    }
  }

  console.info("");
  console.info("=== Migration Summary ===");
  console.info(`  Total packages:  ${summary.total}`);
  console.info(`  Migrated:        ${summary.migrated}`);
  console.info(`  Skipped:         ${summary.skipped}`);
  console.info(`  Errors:          ${summary.errors}`);

  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Migration failed",
    );
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
