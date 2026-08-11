#!/usr/bin/env node
/**
 * Read-only audit of subscriptions whose tenantId is null/missing or points
 * at a nonexistent tenant (dangling reference).
 *
 * DRY-RUN by default: performs `find`/`aggregate` reads only, NEVER writes.
 * Idempotent and safe to re-run at any time.
 *
 * Classification:
 *   - "null"     tenantId is null, missing, or not a BSON ObjectId
 *                (including strings / malformed values — they can never
 *                reference a tenant document)
 *   - "dangling" tenantId IS a BSON ObjectId but no document with that _id
 *                exists in the `tenants` collection
 *
 * Output per bad row: _id, status, createdAt, updatedAt, paymentState,
 * providerSubscriptionId (masked: first 8 chars + "…"), classification.
 *
 * Usage:
 *   node scripts/audit-null-tenant-subscriptions.mjs
 *   node scripts/audit-null-tenant-subscriptions.mjs --json
 *
 * MONGODB_URI is read from api/.env (via dotenv) or process.env.
 */
import path from "node:path";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

const ARGS = new Set(process.argv.slice(2));
const JSON_MODE = ARGS.has("--json");
const CONNECT_TIMEOUT_MS = 15_000;

dotenv.config({ path: path.join(import.meta.dirname, "..", ".env"), quiet: true });

const MONGODB_URI = process.env.MONGODB_URI;

function maskProviderId(value) {
  if (!value) return "";
  const str = String(value);
  return str.length <= 8 ? str : `${str.slice(0, 8)}…`;
}

function isoOrNull(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function idToString(value) {
  if (value && typeof value.toHexString === "function") return value.toHexString();
  return value == null ? "" : String(value);
}

/**
 * Returns "null" | "dangling" when the row is bad, or null when healthy.
 */
function classifyRow(row) {
  if (!(row.tenantId instanceof ObjectId)) return "null";
  return row.tenantRefCount > 0 ? null : "dangling";
}

function toReportRow(row, classification) {
  return {
    _id: idToString(row._id),
    status: row.status ?? null,
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
    paymentState: row.paymentState ?? null,
    providerSubscriptionId: maskProviderId(row.providerSubscriptionId),
    classification,
  };
}

function summarize(badRows) {
  const byStatus = {};
  let nullCount = 0;
  let danglingCount = 0;
  for (const row of badRows) {
    if (row.classification === "null") nullCount += 1;
    else danglingCount += 1;
    const status = row.status ?? "(missing)";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }
  return { total: badRows.length, null: nullCount, dangling: danglingCount, byStatus };
}

function printHuman(databaseName, badRows, summary) {
  console.log("DRY-RUN read-only audit: subscriptions with null/missing or dangling tenantId");
  console.log(`Database: ${databaseName}`);
  if (badRows.length === 0) {
    console.log("No bad rows found.");
    return;
  }
  badRows.forEach((row, index) => {
    console.log(
      `Row ${index + 1}: _id=${row._id} status=${row.status} ` +
        `createdAt=${row.createdAt} updatedAt=${row.updatedAt} ` +
        `paymentState=${row.paymentState} providerSubscriptionId=${row.providerSubscriptionId} ` +
        `classification=${row.classification}`,
    );
  });
  console.log("");
  console.log(
    `Summary: ${summary.total} bad subscription(s): ${summary.null} null, ${summary.dangling} dangling`,
  );
  const statusCounts = Object.entries(summary.byStatus)
    .map(([status, count]) => `${status}=${count}`)
    .join(", ");
  console.log(`By status: ${statusCounts}`);
}

async function runAudit(client) {
  const db = client.db();
  const subscriptions = db.collection("subscriptions");
  // Single read-only aggregate: join each subscription against its tenant and
  // count matches. Rows with a non-ObjectId tenantId are classified "null";
  // ObjectId tenantId with zero tenant matches are classified "dangling".
  // A missing `tenants` collection simply yields zero matches (no error).
  const pipeline = [
    {
      $lookup: {
        from: "tenants",
        let: { tenantId: "$tenantId" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$tenantId"] } } }],
        as: "tenantRefs",
      },
    },
    {
      $project: {
        tenantId: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        paymentState: 1,
        providerSubscriptionId: 1,
        tenantRefCount: { $size: "$tenantRefs" },
      },
    },
  ];

  const rows = await subscriptions.aggregate(pipeline).toArray();
  const badRows = [];
  for (const row of rows) {
    const classification = classifyRow(row);
    if (classification) badRows.push(toReportRow(row, classification));
  }
  const summary = summarize(badRows);
  return { databaseName: db.databaseName, badRows, summary };
}

async function main() {
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set (expected in api/.env or process.env). Cannot connect.",
    );
  }
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    appName: "documind-audit-null-tenant-subscriptions",
  });
  try {
    await client.connect();
    const report = await runAudit(client);
    if (JSON_MODE) {
      process.stdout.write(
        `${JSON.stringify({ dryRun: true, ...report }, null, 2)}\n`,
      );
    } else {
      printHuman(report.databaseName, report.badRows, report.summary);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (JSON_MODE) {
    process.stdout.write(`${JSON.stringify({ dryRun: true, error: { code: "AUDIT_FAILED", message } }, null, 2)}\n`);
  }
  console.error(`Audit failed (BLOCKED): ${message}`);
  process.exitCode = 1;
});
