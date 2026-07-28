import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../db/connection.js";
import { BillingIndexMigrationConflict, migrateIssue29BillingIndexes, type MigrationDatabase } from "./migrate-issue29-billing-indexes.service.js";

function parseMode(args: string[]): boolean {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) return false;
  if (args.length === 1 && args[0] === "--apply") return true;
  throw new Error("Use either --dry-run or --apply");
}
async function main(): Promise<void> {
  const apply = parseMode(process.argv.slice(2));
  await connectDB();
  if (!mongoose.connection.db) throw new Error("MongoDB connection is unavailable");
  const report = await migrateIssue29BillingIndexes(mongoose.connection.db as unknown as MigrationDatabase, apply);
  console.info(JSON.stringify(report));
}
main().catch((error: unknown) => {
  console.error(JSON.stringify(error instanceof BillingIndexMigrationConflict ? { success: false, code: error.message, conflicts: error.report.conflicts } : { success: false, code: "ISSUE29_BILLING_INDEX_MIGRATION_FAILED" }));
  process.exitCode = 1;
}).finally(() => disconnectDB());
