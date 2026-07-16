import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../db/connection.js";
import {
  migrateRolesPhase1,
  RoleMigrationError,
  type RawMigrationCollection,
} from "./migrate-roles-phase1.service.js";

function parseArguments(arguments_: string[]) {
  let apply = false;
  let modeWasSet = false;
  let tenantId: string | undefined;
  let afterId: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply" || argument === "--dry-run") {
      if (modeWasSet) throw new Error("Specify only one migration mode");
      apply = argument === "--apply";
      modeWasSet = true;
      continue;
    }
    if (argument === "--tenant-id") {
      tenantId = arguments_[index + 1];
      index += 1;
      if (!tenantId) throw new Error("--tenant-id requires a value");
      continue;
    }
    if (argument === "--after-id") {
      afterId = arguments_[index + 1];
      index += 1;
      if (!afterId) throw new Error("--after-id requires a value");
      continue;
    }
    throw new Error(`Unknown migration argument: ${argument}`);
  }
  if (tenantId && !mongoose.isObjectIdOrHexString(tenantId)) {
    throw new Error("--tenant-id must be a 24-character ObjectId");
  }
  if (afterId && !mongoose.isObjectIdOrHexString(afterId)) {
    throw new Error("--after-id must be a 24-character ObjectId");
  }
  return { apply, tenantId, afterId };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await connectDB();
  if (!mongoose.connection.db) throw new Error("MongoDB connection is unavailable");
  const roles = mongoose.connection.db.collection("roles") as unknown as RawMigrationCollection;
  const users = mongoose.connection.db.collection("users") as unknown as RawMigrationCollection;
  const report = await migrateRolesPhase1(roles, users, options);
  console.info(JSON.stringify(report));
}

main()
  .catch((error: unknown) => {
    const failure = error instanceof RoleMigrationError
      ? { success: false, code: error.code, resumeAfterId: error.resumeAfterId }
      : { success: false, code: "ROLE_MIGRATION_FAILED", resumeAfterId: null };
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
