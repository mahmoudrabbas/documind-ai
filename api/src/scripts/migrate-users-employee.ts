import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../db/connection.js";
import type { RawMigrationCollection } from "./migrate-roles-phase1.service.js";
import { migrateLegacyUsersToEmployee, UserMigrationError } from "./migrate-users-employee.service.js";

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
    if (argument === "--tenant-id" || argument === "--after-id") {
      const value = arguments_[index + 1];
      index += 1;
      if (!value) throw new Error(`${argument} requires a value`);
      if (!mongoose.isObjectIdOrHexString(value)) throw new Error(`${argument} must be a 24-character ObjectId`);
      if (argument === "--tenant-id") tenantId = value;
      else afterId = value;
      continue;
    }
    throw new Error(`Unknown migration argument: ${argument}`);
  }
  return { apply, tenantId, afterId };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await connectDB();
  if (!mongoose.connection.db) throw new Error("MongoDB connection is unavailable");
  const collection = (name: string) =>
    mongoose.connection.db?.collection(name) as unknown as RawMigrationCollection;
  const report = await migrateLegacyUsersToEmployee(
    collection("users"), collection("roles"), collection("refresh_tokens"), options,
  );
  console.info(JSON.stringify(report));
}

main().catch((error: unknown) => {
  const failure = error instanceof UserMigrationError
    ? { success: false, code: error.code, resumeAfterId: error.resumeAfterId }
    : { success: false, code: "USER_MIGRATION_FAILED", resumeAfterId: null };
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
}).finally(() => disconnectDB());
