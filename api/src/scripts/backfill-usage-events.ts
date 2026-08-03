import dotenv from "dotenv";
import { connectDB, disconnectDB } from "../db/connection.js";
import UsageLogModel from "../db/models/usageLog.model.js";
import AgentRunModel from "../db/models/agentRun.model.js";
import OcrUsageRecordModel from "../db/models/ocrUsageRecord.model.js";
import { MongoUsageEventWriter } from "../modules/analytics/adapters/mongo-usage-event-writer.js";

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");

  console.log(`[Backfill] Running usage event backfill in ${dryRun ? "DRY-RUN" : "APPLY"} mode...`);

  await connectDB();
  const writer = new MongoUsageEventWriter();

  // 1. Backfill UsageLog documents
  const usageLogs = await UsageLogModel.find({}).lean().exec();
  console.log(`[Backfill] Found ${usageLogs.length} legacy UsageLog documents.`);

  let createdLogsCount = 0;
  for (const log of usageLogs) {
    const idempotencyKey = `legacy_usagelog_${log._id.toString()}`;
    if (!dryRun) {
      await writer.record({
        tenantId: log.tenantId.toString(),
        eventType: "question_asked",
        requestId: log.requestId ?? null,
        idempotencyKey,
        units: 1,
        success: true,
        costType: "estimated",
      });
    }
    createdLogsCount++;
  }

  // 2. Backfill AgentRun documents
  const agentRuns = await AgentRunModel.find({}).lean().exec();
  console.log(`[Backfill] Found ${agentRuns.length} AgentRun documents.`);

  let createdRunsCount = 0;
  for (const run of agentRuns) {
    const idempotencyKey = `legacy_agentrun_${run._id.toString()}`;
    if (!dryRun) {
      await writer.record({
        tenantId: run.tenantId.toString(),
        actorId: run.actorId ? run.actorId.toString() : null,
        eventType: "agent_run",
        provider: run.modelProvider,
        model: run.modelName,
        totalTokens: run.totalTokensUsed ?? 0,
        latencyMs: run.latencyMs ?? 0,
        costType: "estimated",
        requestId: run.requestId,
        traceId: run.traceId,
        idempotencyKey,
        success: run.status === "completed",
      });
    }
    createdRunsCount++;
  }

  // 3. Backfill OcrUsageRecord documents
  const ocrRecords = await OcrUsageRecordModel.find({}).lean().exec();
  console.log(`[Backfill] Found ${ocrRecords.length} OcrUsageRecord documents.`);

  let createdOcrCount = 0;
  for (const ocr of ocrRecords) {
    const idempotencyKey = `legacy_ocr_${ocr._id.toString()}`;
    if (!dryRun) {
      await writer.record({
        tenantId: ocr.tenantId.toString(),
        eventType: "ocr_page",
        provider: ocr.provider || "tesseract",
        model: (ocr as unknown as Record<string, unknown>).model as string || "default",
        units: ocr.pagesProcessed || 1,
        latencyMs: ocr.durationMs || 0,
        costType: "calculated",
        idempotencyKey,
        success: true,
      });
    }
    createdOcrCount++;
  }

  console.log(`[Backfill] Summary:
    - UsageLogs processed: ${createdLogsCount}
    - AgentRuns processed: ${createdRunsCount}
    - OcrRecords processed: ${createdOcrCount}
    - Mode: ${dryRun ? "DRY-RUN (No DB modifications)" : "APPLIED"}`);

  await disconnectDB();
}

main().catch((err) => {
  console.error("[Backfill] Failed:", err);
  process.exit(1);
});
