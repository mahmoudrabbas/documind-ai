import "dotenv/config";
import { AppError } from "../common/errors/AppError.js";
import { connectDB, disconnectDB } from "../db/connection.js";
import { MongoDocumentPolicyBackfillPersistence } from "./document-policy-backfill.mongo.js";
import { parseDocumentPolicyBackfillOptions } from "./document-policy-backfill.options.js";
import { runDocumentPolicyBackfill } from "./document-policy-backfill.service.js";

export async function runCli(arguments_: readonly string[]): Promise<number> {
  const options = parseDocumentPolicyBackfillOptions(arguments_);
  await connectDB();
  const report = await runDocumentPolicyBackfill(options, new MongoDocumentPolicyBackfillPersistence());
  console.info(JSON.stringify(report));
  return report.counts.failed > 0 ? 1 : report.counts.quarantined + report.counts.source_changed > 0 ? 2 : 0;
}

if (process.argv[1]?.endsWith("migrate-document-access-policy-v1.ts")) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(JSON.stringify({ success: false, code: error instanceof AppError ? error.code : "DOCUMENT_POLICY_MIGRATION_FAILED" }));
    process.exitCode = 1;
  }).finally(() => disconnectDB());
}
