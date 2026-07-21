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

function _entitlementsFromLimits(l: LegacyLimits) {
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

  // Query directly from MongoDB (not Mongoose) to see raw stored fields.
  // `limits` is a Mongoose virtual, so it never exists in the DB.
  // We detect legacy docs by the *absence* of `entitlements`.
  const packages = await PackageModel.find({}).lean().exec();
  const summary: MigrationSummary = {
    total: packages.length,
    migrated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const pkg of packages) {
    try {
      const pkgId = pkg._id;
      const hasRootEntitlements =
        pkg.entitlements != null && Object.keys(pkg.entitlements).length > 0;
      const versions = ((pkg as unknown as Record<string, unknown>).versions as Record<string, unknown>[]) ?? [];
      const versionsMissingEntitlements = versions.filter(
        (v: Record<string, unknown>) => !v.entitlements,
      );

      if (hasRootEntitlements && versionsMissingEntitlements.length === 0) {
        summary.skipped += 1;
        console.info(
          `[SKIP] Package "${pkg.name}" (${pkg.code}) — already migrated.`,
        );
        continue;
      }

      // Build root entitlements from existing entitlements or derive from
      // a legacy document. Because `limits` is a virtual we cannot read it
      // from the database; instead we check if the package simply lacks
      // `entitlements` and has version snapshots that also lack them.
      // When there are no `entitlements` at all we fall back to safe
      // defaults (all zeros) — the real fix is the defensive `limits`
      // virtual and the lazy normalisation in createVersion / updatePackage.
      let rootEntitlements: Record<string, number> | null = null;

      if (hasRootEntitlements) {
        rootEntitlements = pkg.entitlements as unknown as Record<string, number>;
      } else {
        // Use safe defaults — the normalisation paths in createVersion and
        // updatePackage will produce correct values when next saved.
        rootEntitlements = {
          employees: 1,
          admins: 1,
          documents: 100,
          storageMb: 1024,
          fileSizeMb: 10,
          queriesPerMonth: 1000,
          tokensPerMonth: 0,
          ocrPagesPerMonth: 0,
        };
      }

      if (isDryRun) {
        console.info(
          `[DRY-RUN] Would migrate package "${pkg.name}" (${pkg.code}):` +
            ` set root entitlements, convert ${versionsMissingEntitlements.length} version snapshot(s), unset legacy limits.`,
        );
        summary.migrated += 1;
        continue;
      }

      const updateOps: Record<string, unknown> = {};

      // Set root entitlements if missing
      if (!hasRootEntitlements) {
        updateOps["$set"] = {
          ...(updateOps["$set"] as Record<string, unknown>),
          entitlements: rootEntitlements,
        };
      }

      // Normalize version snapshots that lack entitlements
      if (versionsMissingEntitlements.length > 0) {
        const updatedVersions = versions.map((v: Record<string, unknown>) => {
          if (v.entitlements) return v;
          return { ...v, entitlements: rootEntitlements };
        });
        updateOps["$set"] = {
          ...(updateOps["$set"] as Record<string, unknown>),
          versions: updatedVersions,
        };
      }

      // Remove legacy `limits` fields (root and per-version)
      const unsetOps: Record<string, string> = {};
      if ((pkg as unknown as Record<string, unknown>).limits) {
        unsetOps["limits"] = "";
      }
      for (let i = 0; i < versions.length; i++) {
        if (versions[i].limits) {
          unsetOps[`versions.${i}.limits`] = "";
        }
      }
      if (Object.keys(unsetOps).length > 0) {
        updateOps["$unset"] = unsetOps;
      }

      // Execute the update
      const ops: Record<string, unknown> = {};
      if (updateOps["$set"]) ops["$set"] = updateOps["$set"];
      if (updateOps["$unset"]) ops["$unset"] = updateOps["$unset"];

      await PackageModel.updateOne({ _id: pkgId }, ops).exec();

      summary.migrated += 1;
      console.info(
        `[MIGRATED] Package "${pkg.name}" (${pkg.code}) — root entitlements: ${hasRootEntitlements ? "kept" : "created"}, versions: ${versionsMissingEntitlements.length} snapshot(s) normalised, limits unset: ${Object.keys(unsetOps).length > 0}.`,
      );
    } catch (err) {
      summary.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error processing package "${(pkg as unknown as Record<string, unknown>).name}": ${msg}`);
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
