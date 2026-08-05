import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import JudgeEvaluationModel from "../../../db/models/judgeEvaluation.model.js";
import QualityMetricModel from "../../../db/models/qualityMetric.model.js";
import {
  aggregateJudgeEvaluations,
  QualityService,
  shouldPersistQualityMetric,
} from "../quality.service.js";
import {
  persistJudgeEvaluation,
  loadExistingEvaluationForJudge,
} from "../judgeEvaluation.repository.js";

let replSet: MongoMemoryReplSet | null = null;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "judge-evaluation" });
  } else {
    replSet = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) }],
    });
    await mongoose.connect(replSet.getUri(), { dbName: "judge-evaluation" });
  }
  await JudgeEvaluationModel.init();
  await QualityMetricModel.init();
});

beforeEach(async () => {
  await Promise.all([
    JudgeEvaluationModel.deleteMany({}),
    QualityMetricModel.deleteMany({}),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

function buildEvaluation(overrides: Record<string, unknown> = {}) {
  return new JudgeEvaluationModel({
    tenantId: new mongoose.Types.ObjectId(),
    messageId: new mongoose.Types.ObjectId(),
    conversationId: new mongoose.Types.ObjectId(),
    judgeStatus: "completed",
    judgeScores: { faithfulness: 0.9, relevancy: 0.8, coherence: 0.7, overall: 0.83 },
    judgeProvider: "stub",
    judgeModel: "stub-model",
    judgeVersion: "judge-v1",
    judgeEvaluatedAt: new Date(),
    judgeErrorCode: null,
    ...overrides,
  });
}

test("valid completed evaluations validate", async () => {
  await assert.doesNotReject(buildEvaluation().validate());
});

test("unique compound index rejects duplicate (tenantId, messageId, judgeVersion)", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  const first = buildEvaluation({ tenantId, messageId });
  const duplicate = buildEvaluation({ tenantId, messageId });
  await first.save();
  await assert.rejects(duplicate.save(), (error: unknown) => (error as { code?: number }).code === 11000);
});

test("a newer judgeVersion permits re-evaluation for the same message", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const messageId = new mongoose.Types.ObjectId();
  await buildEvaluation({ tenantId, messageId, judgeVersion: "judge-v1" }).save();
  await assert.doesNotReject(buildEvaluation({ tenantId, messageId, judgeVersion: "judge-v2" }).save());
});

test("aggregateJudgeEvaluations averages completed only and counts statuses", () => {
  const aggregates = aggregateJudgeEvaluations([
    { judgeStatus: "completed", judgeScores: { faithfulness: 1, relevancy: 1, coherence: 1, overall: 1 } },
    { judgeStatus: "completed", judgeScores: { faithfulness: 0, relevancy: 0, coherence: 0, overall: 0 } },
    { judgeStatus: "degraded", judgeScores: { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 } },
    { judgeStatus: "failed" },
  ]);
  assert.deepEqual(aggregates.judgeScores, { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 });
  assert.equal(aggregates.judgeEvaluatedCount, 2);
  assert.equal(aggregates.judgeDegradedCount, 1);
  assert.equal(aggregates.judgeFailedCount, 1);
});

test("aggregateJudgeEvaluations returns zeros with no evaluations", () => {
  const aggregates = aggregateJudgeEvaluations([]);
  assert.deepEqual(aggregates.judgeScores, { faithfulness: 0, relevancy: 0, coherence: 0, overall: 0 });
  assert.equal(aggregates.judgeEvaluatedCount, 0);
  assert.equal(aggregates.judgeDegradedCount, 0);
  assert.equal(aggregates.judgeFailedCount, 0);
});

test("QualityService includes judge aggregates in the result and persisted metric", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dayStart = new Date(Date.UTC(2026, 7, 5));
  const dayEnd = new Date(Date.UTC(2026, 7, 5, 23, 59, 59, 999));
  const withinDay = new Date(Date.UTC(2026, 7, 5, 12));

  await Promise.all([
    buildEvaluation({
      tenantId,
      judgeStatus: "completed",
      judgeScores: { faithfulness: 1, relevancy: 1, coherence: 1, overall: 1 },
      judgeEvaluatedAt: withinDay,
    }).save(),
    buildEvaluation({
      tenantId,
      judgeStatus: "completed",
      judgeScores: { faithfulness: 0, relevancy: 0, coherence: 0, overall: 0 },
      judgeEvaluatedAt: withinDay,
    }).save(),
    buildEvaluation({
      tenantId,
      judgeStatus: "degraded",
      judgeScores: { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 },
      judgeEvaluatedAt: withinDay,
    }).save(),
    buildEvaluation({
      tenantId,
      judgeStatus: "failed",
      judgeScores: { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 },
      judgeEvaluatedAt: withinDay,
    }).save(),
  ]);

  const service = new QualityService();
  const result = await service.computeQualityMetrics(tenantId.toString(), dayStart, dayEnd, "daily");

  assert.deepEqual(result.judgeScores, { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 });
  assert.equal(result.judgeEvaluatedCount, 2);
  assert.equal(result.judgeDegradedCount, 1);
  assert.equal(result.judgeFailedCount, 1);

  const persisted = await QualityMetricModel.findOne({
    tenantId,
    date: "2026-08-05",
    period: "daily",
  }).lean().exec();
  assert.ok(persisted, "quality metric document should be persisted");
  assert.equal(persisted!.judgeEvaluatedCount, 2);
  assert.equal(persisted!.judgeDegradedCount, 1);
  assert.equal(persisted!.judgeFailedCount, 1);
  assert.equal(persisted!.judgeScores.overall, 0.5);
});

test("shouldPersistQualityMetric persists only true normalized buckets", () => {
  const tenant = "507f1f77bcf86cd799439011";
  const dayStart = new Date(Date.UTC(2026, 7, 5));
  const dayEnd = new Date(Date.UTC(2026, 7, 5, 23, 59, 59, 999));

  assert.equal(shouldPersistQualityMetric(tenant, "daily", dayStart, dayEnd), true);
  assert.equal(
    shouldPersistQualityMetric(tenant, "daily", dayStart, new Date(Date.UTC(2026, 7, 7, 23, 59, 59, 999))),
    false,
    "arbitrary multi-day range is never a bucket",
  );
  assert.equal(shouldPersistQualityMetric(tenant, "daily", dayStart, new Date(Date.UTC(2026, 7, 4))), false);

  const monday = new Date(Date.UTC(2026, 7, 3));
  assert.equal(monday.getUTCDay(), 1, "sanity: 2026-08-03 is a Monday");
  assert.equal(
    shouldPersistQualityMetric(tenant, "weekly", monday, new Date(Date.UTC(2026, 7, 9, 23, 59, 59, 999))),
    true,
  );
  assert.equal(
    shouldPersistQualityMetric(tenant, "weekly", new Date(Date.UTC(2026, 7, 4)), new Date(Date.UTC(2026, 7, 10, 23, 59, 59, 999))),
    false,
    "off-by-one week is not a bucket",
  );

  assert.equal(
    shouldPersistQualityMetric(tenant, "monthly", new Date(Date.UTC(2026, 7, 1)), new Date(Date.UTC(2026, 7, 31, 23, 59, 59, 999))),
    true,
  );
  assert.equal(
    shouldPersistQualityMetric(tenant, "monthly", new Date(Date.UTC(2026, 7, 15)), new Date(Date.UTC(2026, 7, 31, 23, 59, 59, 999))),
    false,
    "mid-month range is not a bucket",
  );

  assert.equal(shouldPersistQualityMetric(null, "daily", dayStart, dayEnd), false);
  assert.equal(shouldPersistQualityMetric(tenant, "daily", dayStart, dayEnd, { provider: "groq" }), false);
  assert.equal(shouldPersistQualityMetric(tenant, "daily", dayStart, dayEnd, { model: "llama-3" }), false);
});

test("an arbitrary multi-day range does not overwrite a persisted daily bucket", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dayStart = new Date(Date.UTC(2026, 7, 5));
  const dayEnd = new Date(Date.UTC(2026, 7, 5, 23, 59, 59, 999));

  await buildEvaluation({
    tenantId,
    judgeScores: { faithfulness: 1, relevancy: 1, coherence: 1, overall: 1 },
    judgeEvaluatedAt: dayStart,
  }).save();

  const service = new QualityService();
  await service.computeQualityMetrics(tenantId.toString(), dayStart, dayEnd, "daily");
  const persisted = await QualityMetricModel.findOne({ tenantId, date: "2026-08-05", period: "daily" }).lean().exec();
  assert.ok(persisted);
  assert.equal(persisted!.judgeEvaluatedCount, 1);

  // A later arbitrary multi-day range must not overwrite the 08-05 bucket.
  await service.computeQualityMetrics(
    tenantId.toString(),
    new Date(Date.UTC(2026, 7, 5)),
    new Date(Date.UTC(2026, 7, 7, 23, 59, 59, 999)),
    "daily",
  );
  const after = await QualityMetricModel.findOne({ tenantId, date: "2026-08-05", period: "daily" }).lean().exec();
  assert.ok(after);
  assert.equal(after!.judgeEvaluatedCount, 1);
  assert.equal(await QualityMetricModel.countDocuments({ tenantId }), 1);
});

test("provider/model filters scope judge aggregates and never persist filtered views", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dayStart = new Date(Date.UTC(2026, 7, 5));
  const dayEnd = new Date(Date.UTC(2026, 7, 5, 23, 59, 59, 999));

  await Promise.all([
    buildEvaluation({
      tenantId,
      judgeProvider: "groq",
      judgeModel: "model-a",
      judgeScores: { faithfulness: 1, relevancy: 1, coherence: 1, overall: 1 },
      judgeEvaluatedAt: dayStart,
    }).save(),
    buildEvaluation({
      tenantId,
      judgeProvider: "groq",
      judgeModel: "model-b",
      judgeScores: { faithfulness: 0, relevancy: 0, coherence: 0, overall: 0 },
      judgeEvaluatedAt: dayStart,
    }).save(),
    buildEvaluation({
      tenantId,
      judgeProvider: "other",
      judgeModel: "model-a",
      judgeScores: { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 },
      judgeEvaluatedAt: dayStart,
    }).save(),
  ]);

  const service = new QualityService();
  const modelA = await service.computeQualityMetrics(tenantId.toString(), dayStart, dayEnd, "daily", { model: "model-a" });
  assert.equal(modelA.judgeEvaluatedCount, 2);
  assert.equal(modelA.judgeScores.faithfulness, 0.75);

  const modelB = await service.computeQualityMetrics(tenantId.toString(), dayStart, dayEnd, "daily", { model: "model-b" });
  assert.equal(modelB.judgeEvaluatedCount, 1);
  assert.equal(modelB.judgeScores.faithfulness, 0);
  assert.equal(modelB.judgeDegradedCount + modelB.judgeFailedCount, 0, "model-a evaluations must not leak into model-b");

  const groq = await service.computeQualityMetrics(tenantId.toString(), dayStart, dayEnd, "daily", { provider: "groq" });
  assert.equal(groq.judgeEvaluatedCount, 2);
  assert.equal(groq.judgeScores.faithfulness, 0.5);

  const unfiltered = await service.computeQualityMetrics(tenantId.toString(), dayStart, dayEnd, "daily");
  assert.equal(unfiltered.judgeEvaluatedCount, 3);

  const persisted = await QualityMetricModel.find({ tenantId }).lean();
  assert.equal(persisted.length, 1, "only the unfiltered true-bucket call may persist");
  assert.equal(persisted[0].judgeEvaluatedCount, 3, "persisted metric must reflect the unfiltered view");
});

test("persistJudgeEvaluation atomically replaces a non-completed record", async () => {
  const tenantId = new mongoose.Types.ObjectId().toString();
  const messageId = new mongoose.Types.ObjectId().toString();
  const conversationId = new mongoose.Types.ObjectId().toString();

  await persistJudgeEvaluation({
    tenantId, messageId, conversationId,
    judgeStatus: "failed",
    judgeScores: { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 },
    judgeProvider: "groq", judgeModel: "model-a", judgeVersion: "judge-v1",
    judgeEvaluatedAt: new Date(), judgeErrorCode: "LLM_RATE_LIMITED",
  });

  await persistJudgeEvaluation({
    tenantId, messageId, conversationId,
    judgeStatus: "completed",
    judgeScores: { faithfulness: 0.9, relevancy: 0.8, coherence: 0.7, overall: 0.83 },
    judgeProvider: "groq", judgeModel: "model-a", judgeVersion: "judge-v1",
    judgeEvaluatedAt: new Date(), judgeErrorCode: null,
  });

  const docs = await JudgeEvaluationModel.find({ tenantId, messageId, judgeVersion: "judge-v1" }).lean().exec();
  assert.equal(docs.length, 1, "one doc per tenantId+messageId+judgeVersion");
  assert.equal(docs[0]!.judgeStatus, "completed");
  assert.equal(docs[0]!.judgeScores.faithfulness, 0.9);
});

test("persistJudgeEvaluation never overwrites an existing completed record", async () => {
  const tenantId = new mongoose.Types.ObjectId().toString();
  const messageId = new mongoose.Types.ObjectId().toString();
  const conversationId = new mongoose.Types.ObjectId().toString();

  await persistJudgeEvaluation({
    tenantId, messageId, conversationId,
    judgeStatus: "completed",
    judgeScores: { faithfulness: 0.9, relevancy: 0.8, coherence: 0.7, overall: 0.83 },
    judgeProvider: "groq", judgeModel: "model-a", judgeVersion: "judge-v1",
    judgeEvaluatedAt: new Date(), judgeErrorCode: null,
  });

  const existing = await loadExistingEvaluationForJudge(tenantId, messageId, "judge-v1");
  assert.equal(existing!.judgeStatus, "completed");

  // A later non-completed retry must not clobber the completed record.
  await assert.rejects(
    persistJudgeEvaluation({
      tenantId, messageId, conversationId,
      judgeStatus: "degraded",
      judgeScores: { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 },
      judgeProvider: "groq", judgeModel: "model-a", judgeVersion: "judge-v1",
      judgeEvaluatedAt: new Date(), judgeErrorCode: "JUDGE_SCORE_MALFORMED",
    }),
    (error: unknown) => (error as { code?: number }).code === 11000,
  );

  const docs = await JudgeEvaluationModel.find({ tenantId, messageId, judgeVersion: "judge-v1" }).lean().exec();
  assert.equal(docs.length, 1);
  assert.equal(docs[0]!.judgeStatus, "completed");
});

test("concurrent persistJudgeEvaluation upserts never leave duplicate documents", async () => {
  const tenantId = new mongoose.Types.ObjectId().toString();
  const messageId = new mongoose.Types.ObjectId().toString();
  const conversationId = new mongoose.Types.ObjectId().toString();

  const outcomes = await Promise.allSettled([
    persistJudgeEvaluation({
      tenantId, messageId, conversationId, judgeStatus: "completed",
      judgeScores: { faithfulness: 0.9, relevancy: 0.8, coherence: 0.7, overall: 0.83 },
      judgeProvider: "groq", judgeModel: "model-a", judgeVersion: "judge-v1",
      judgeEvaluatedAt: new Date(), judgeErrorCode: null,
    }),
    persistJudgeEvaluation({
      tenantId, messageId, conversationId, judgeStatus: "failed",
      judgeScores: { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 },
      judgeProvider: "groq", judgeModel: "model-a", judgeVersion: "judge-v1",
      judgeEvaluatedAt: new Date(), judgeErrorCode: "LLM_RATE_LIMITED",
    }),
  ]);

  const docs = await JudgeEvaluationModel.find({ tenantId, messageId, judgeVersion: "judge-v1" }).lean().exec();
  assert.equal(docs.length, 1, "unique index + upsert must never produce duplicates");
  assert.ok(outcomes.some((outcome) => outcome.status === "fulfilled"), "at least one upsert wins");
});

test("a completed evaluation in another tenant does not leak into tenant aggregates", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const otherTenant = new mongoose.Types.ObjectId();
  const now = new Date();
  await buildEvaluation({
    tenantId: otherTenant,
    judgeScores: { faithfulness: 1, relevancy: 1, coherence: 1, overall: 1 },
    judgeEvaluatedAt: now,
  }).save();

  const service = new QualityService();
  const result = await service.computeQualityMetrics(
    tenantId.toString(),
    new Date(now.getTime() - 60_000),
    new Date(now.getTime() + 60_000),
    "daily",
  );
  assert.equal(result.judgeEvaluatedCount, 0);
});
