import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../db/connection.js";
import { migrateSubscriptionHistoryIndex } from "./migrate-subscription-history-index.js";

const apply = process.argv.slice(2).length === 1 && process.argv[2] === "--apply";
if (process.argv.slice(2).length > 1 || (process.argv[2] && !apply && process.argv[2] !== "--dry-run")) throw new Error("Use either --dry-run or --apply");
await connectDB();
try {
  if (!mongoose.connection.db) throw new Error("MongoDB connection is unavailable");
  console.info(JSON.stringify(await migrateSubscriptionHistoryIndex(mongoose.connection.db as never, apply)));
} finally {
  await disconnectDB();
}
