import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import PackageModel from "../../../db/models/package.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import QuotaOverrideModel from "../../../db/models/quotaOverride.model.js";
import IntentQueryTraceModel from "../../../db/models/intentQueryTrace.model.js";
import { QuotaCounterModel } from "../../entitlement/adapters/mongo-quota-counter.js";
import { hashPassword } from "../../auth/passwordHashing.js";
import { disconnectRedis } from "../../../db/redis.js";
import { logger } from "../../../common/logger/logger.js";

import { IntentQueryService } from "../intentQuery.service.js";
import { FakeConversationContextAdapter } from "../adapters/conversationContext.fakeAdapter.js";
import type {
  ModelAdapter,
  ModelCompletionResponse,
  ModelCompletionUsage,
} from "../../agents/agents.types.js";
import type { OperationAuthorizationContext } from "../../permissions/permissions.operation.js";

// ── In-memory Mongo fixture (replica set, same as intentQuery.service.test.ts) ──

let mongoServer: MongoMemoryReplSet | null = null;
const TEST_PASSWORD = "StrongPass123!";

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "intent-query-tokens-test" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        {
          launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000),
        },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "intent-query-tokens-test" });
  }
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Subscription period anchor — the counter period key derives from
// subscription.periodStart (YYYY-MM), so "2026-01" is deterministic.
const PERIOD_START = new Date("2026-01-01");
const PERIOD_END = new Date("2027-01-01");
const PERIOD_KEY = "2026-01";

let tenantId: string;
let actorId: string;
let employeeActorId: string;
let adminContext: OperationAuthorizationContext;

async function seedTenantWithEntitlements() {
  const tenant = await TenantModel.create({
    name: "Tokens Corp",
    slug: "tokens-corp",
    status: "active",
    plan: "free",
  });

  const pkg = await PackageModel.create({
    name: "Tokens Test Package",
    code: "test-tokens-pkg",
    description: "Test package for token quota enforcement",
    active: true,
    version: 1,
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "USD",
    entitlements: {
      employees: 10,
      admins: 1,
      documents: 100,
      storageMb: 1024,
      fileSizeMb: 10,
      queriesPerMonth: 1000,
      tokensPerMonth: 100000,
      ocrPagesPerMonth: 100,
    },
    trialDays: 0,
    visibility: "public",
    supportedModels: ["gpt-4"],
    analyticsLevel: "basic",
    retentionDays: 30,
    supportLevel: "community",
    stripeProductId: "",
    stripePriceId: "",
    stripeAnnualPriceId: "",
    versions: [
      {
        _id: new mongoose.Types.ObjectId(),
        version: 1,
        name: "Tokens Test Package v1",
        code: "test-tokens-pkg-v1",
        description: "Version 1",
        monthlyPrice: 0,
        annualPrice: 0,
        currency: "USD",
        entitlements: {
          employees: 10,
          admins: 1,
          documents: 100,
          storageMb: 1024,
          fileSizeMb: 10,
          queriesPerMonth: 1000,
          tokensPerMonth: 100000,
          ocrPagesPerMonth: 100,
        },
        trialDays: 0,
        visibility: "public",
        supportedModels: ["gpt-4"],
        analyticsLevel: "basic",
        retentionDays: 30,
        supportLevel: "community",
        stripeProductId: "",
        stripePriceId: "",
        stripeAnnualPriceId: "",
        createdAt: new Date(),
      },
    ],
  });

  await SubscriptionModel.create({
    tenantId: tenant._id,
    packageId: pkg._id,
    packageVersion: 1,
    status: "ACTIVE",
    startedAt: new Date(),
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
    billingInterval: "monthly",
    provider: "test",
    paymentState: "paid",
  });

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Admin User",
    email: "admin@tokens.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });

  const employee = await UserModel.create({
    tenantId: tenant.id,
    name: "Employee User",
    email: "employee@tokens.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });

  return { tenantId: tenant.id, actorId: user.id, employeeActorId: employee.id };
}

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await PackageModel.deleteMany({});
  await SubscriptionModel.deleteMany({});
  await QuotaOverrideModel.deleteMany({});
  await QuotaCounterModel.deleteMany({});
  await IntentQueryTraceModel.deleteMany({});

  const seeded = await seedTenantWithEntitlements();
  tenantId = seeded.tenantId;
  actorId = seeded.actorId;
  employeeActorId = seeded.employeeActorId;
  adminContext = {
    tenantId,
    actorId,
    actorEmail: "admin@tokens.com",
    actorRole: "COMPANY_ADMIN",
    traceId: "tokens-test-trace",
    requestId: "tokens-test-req",
  };
});

async function readTokensCounter(): Promise<number> {
  const doc = await QuotaCounterModel.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    dimension: "tokensPerMonth",
    periodStart: PERIOD_KEY,
  });
  return doc?.value ?? 0;
}

// ── Mock model adapter with configurable token reporting ────────────────────

type UsageMode = "normal" | "omitted" | "nullTotal";

class TokenReportingModelAdapter implements ModelAdapter {
  readonly providerKey = "token-reporting";

  constructor(
    private readonly totalTokens: number,
    private readonly usageMode: UsageMode = "normal",
  ) {}

  async complete(): Promise<ModelCompletionResponse> {
    const question = "What is our remote work policy?";
    const plan = {
      schemaVersion: "1.1.0",
      normalizedQuestion: question,
      originalQuestion: question,
      language: "en",
      detectedIntent: "knowledge_question",
      intentConfidence: 0.95,
      entities: [],
      temporalConstraints: [],
      referencedDocumentIds: [],
      departments: [],
      categories: [],
      exactTerms: [],
      semanticQueries: [{ text: question, language: "en", weight: 1.0 }],
      keywordQueries: [],
      clarificationNeeded: false,
      clarification: null,
      isFollowUp: false,
      conversationContextUsed: false,
      promptVersion: "1.0.0",
      modelVersion: "token-reporting",
      processingMetadata: {
        tokensUsed: this.totalTokens,
        latencyMs: 10,
        estimatedCost: 0,
        fallbackUsed: false,
      },
    };
    const content = JSON.stringify(plan);

    const base: ModelCompletionResponse = {
      id: `token-test-${Date.now()}`,
      provider: "fake",
      model: "fake-chat",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finishReason: "stop",
        },
      ],
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: this.totalTokens,
      },
      latencyMs: 10,
      estimatedCost: 0,
    };

    if (this.usageMode === "omitted") {
      // Runtime shape: the provider omitted `usage` entirely. The
      // ModelCompletionUsage type does not express this, but the service
      // tolerates it via `response.usage?.totalTokens ?? 0`.
      return { ...base, usage: undefined as unknown as ModelCompletionUsage };
    }
    if (this.usageMode === "nullTotal") {
      // Runtime shape: the provider reported null for totalTokens.
      return {
        ...base,
        usage: { ...base.usage, totalTokens: null as unknown as number },
      };
    }
    return base;
  }
}

// ── Suite ────────────────────────────────────────────────────────────────────

test("IntentQueryService — tokensPerMonth quota enforcement", async (t) => {
  await t.test("consumes the actual token count against tokensPerMonth after a successful query", async () => {
    const service = new IntentQueryService(
      new TokenReportingModelAdapter(500),
      new FakeConversationContextAdapter(),
    );

    const plan = await service.analyzeQuery(
      { question: "What is our remote work policy?" },
      adminContext,
    );

    assert.equal(plan.detectedIntent, "knowledge_question");
    assert.equal(await readTokensCounter(), 500);
  });

  await t.test("denies with 429 ENTITLEMENT_EXCEEDED when tokensPerMonth quota is exhausted", async () => {
    // Override the plan limit (100000) down to 100 tokens.
    await QuotaOverrideModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension: "tokensPerMonth",
      limit: 100,
      enabled: true,
    });

    // Seed prior usage for this period so the counter guard ($lte on the
    // existing doc) actually evaluates: 50 used + 150 requested > 100 limit.
    await QuotaCounterModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension: "tokensPerMonth",
      periodStart: PERIOD_KEY,
      value: 50,
    });

    const service = new IntentQueryService(
      new TokenReportingModelAdapter(150),
      new FakeConversationContextAdapter(),
    );

    await assert.rejects(
      service.analyzeQuery(
        { question: "What is our remote work policy?" },
        adminContext,
      ),
      (err: unknown) => {
        const error = err as {
          statusCode?: number;
          code?: string;
          message?: string;
          details?: {
            current?: number;
            limit?: number;
            dimension?: string;
            remaining?: number;
            periodReset?: unknown;
            canUpgrade?: boolean;
          };
        };
        assert.equal(error.statusCode, 429);
        assert.equal(error.code, "ENTITLEMENT_EXCEEDED");
        assert.equal(error.details?.current, 50);
        assert.equal(error.details?.limit, 100);
        assert.equal(error.details?.dimension, "tokensPerMonth");
        assert.equal(error.details?.remaining, 50);
        assert.equal(error.details?.canUpgrade, true);
        assert.equal(typeof error.details?.periodReset, "string");
        return true;
      },
    );

    // The denial must not have incremented the counter.
    assert.equal(await readTokensCounter(), 50);
  });

  await t.test("denial reports canUpgrade=false for a non-admin actor", async () => {
    await QuotaOverrideModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension: "tokensPerMonth",
      limit: 100,
      enabled: true,
    });

    await QuotaCounterModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension: "tokensPerMonth",
      periodStart: PERIOD_KEY,
      value: 50,
    });

    const employeeContext: OperationAuthorizationContext = {
      tenantId,
      actorId: employeeActorId,
      actorEmail: "employee@tokens.com",
      actorRole: "EMPLOYEE",
      traceId: "tokens-test-trace-employee",
      requestId: "tokens-test-req-employee",
    };

    const service = new IntentQueryService(
      new TokenReportingModelAdapter(150),
      new FakeConversationContextAdapter(),
    );

    await assert.rejects(
      service.analyzeQuery(
        { question: "What is our remote work policy?" },
        employeeContext,
      ),
      (err: unknown) => {
        const error = err as { details?: { canUpgrade?: boolean } };
        assert.equal(error.details?.canUpgrade, false);
        return true;
      },
    );
  });

  await t.test("no consumption and no error when the provider omits usage metadata", async (t) => {
    const warnMock = t.mock.method(logger, "warn", () => undefined);

    const service = new IntentQueryService(
      new TokenReportingModelAdapter(0, "omitted"),
      new FakeConversationContextAdapter(),
    );

    const plan = await service.analyzeQuery(
      { question: "What is our remote work policy?" },
      adminContext,
    );

    assert.equal(plan.detectedIntent, "knowledge_question");
    assert.equal(plan.processingMetadata.tokensUsed, 0);
    assert.equal(await readTokensCounter(), 0);
    assert.ok(
      warnMock.mock.calls.some((call) =>
        String(call.arguments[1]).includes("no token usage"),
      ),
      "expected a warning that token usage was missing",
    );
  });

  await t.test("no consumption and no error when the provider reports null totalTokens", async () => {
    const service = new IntentQueryService(
      new TokenReportingModelAdapter(0, "nullTotal"),
      new FakeConversationContextAdapter(),
    );

    const plan = await service.analyzeQuery(
      { question: "What is our remote work policy?" },
      adminContext,
    );

    assert.equal(plan.detectedIntent, "knowledge_question");
    assert.equal(await readTokensCounter(), 0);
  });

  await t.test("deterministic fallback (provider failure) consumes nothing and still succeeds", async () => {
    const failingAdapter: ModelAdapter = {
      providerKey: "failing-provider",
      async complete() {
        throw new Error("Provider Offline");
      },
    };

    const service = new IntentQueryService(
      failingAdapter,
      new FakeConversationContextAdapter(),
    );

    const plan = await service.analyzeQuery(
      { question: "Simple knowledge query?" },
      adminContext,
    );

    assert.equal(plan.processingMetadata.fallbackUsed, true);
    assert.equal(await readTokensCounter(), 0);
  });
});
