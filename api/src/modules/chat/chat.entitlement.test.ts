import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import QuotaOverrideModel from "../../db/models/quotaOverride.model.js";
import MessageModel from "../../db/models/message.model.js";
import ConversationModel from "../../db/models/conversation.model.js";
import { QuotaCounterModel } from "../entitlement/adapters/mongo-quota-counter.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { disconnectRedis } from "../../db/redis.js";

import { ChatService } from "./chat.service.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import { setIntentQueryAdaptersForTests } from "../intent-query/intentQuery.factory.js";
import { AppError } from "../../common/errors/AppError.js";
import { ENTITLEMENT_EXCEEDED, FORBIDDEN } from "../../common/errors/errorCodes.js";
import type { ModelAdapter } from "../agents/agents.types.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { RetrievalCandidate, RetrievalQuery, RetrievalResult } from "../retrieval/retrieval.types.js";
import type { EvidenceBundle } from "../reranker/reranker.types.js";
import type { ConversationContextPort } from "../intent-query/ports/conversationContext.port.js";

let mongoServer: MongoMemoryReplSet | null = null;
const TEST_PASSWORD = "StrongPass123!";

// Subscription period anchor — the counter period key derives from
// subscription.periodStart (YYYY-MM), so "2026-01" is deterministic.
const PERIOD_START = new Date("2026-01-01");
const PERIOD_END = new Date("2027-01-01");

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "chat-entitlement-test" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "chat-entitlement-test" });
  }
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

let tenantId: string;
let actorId: string;
let chatContext: OperationAuthorizationContext;

class FakeRetrievalService implements HybridRetrievalService {
  calls: RetrievalQuery[] = [];
  candidates: RetrievalCandidate[] = [];
  evidenceBundle: EvidenceBundle | null = null;

  async hybridSearch(query: RetrievalQuery, _context: unknown): Promise<RetrievalResult> {
    this.calls.push(query);
    return {
      candidates: this.candidates,
      totalCandidates: this.candidates.length,
      filterSummary: {
        tenantFilter: true,
        roleFilter: "none",
        permissionScopes: [],
        explicitFilters: [],
        versionFilter: false,
      },
      diagnostics: {
        totalLatencyMs: 1,
        vectorLatencyMs: 1,
        keywordLatencyMs: 1,
        fusionLatencyMs: 1,
        vectorCandidateCount: this.candidates.length,
        keywordCandidateCount: this.candidates.length,
        traceId: "chat-entitlement-test",
      },
      evidenceBundle: this.evidenceBundle ?? undefined,
    };
  }
  async vectorSearch(query: RetrievalQuery, _context: unknown): Promise<RetrievalResult> {
    return this.hybridSearch(query, _context);
  }
  async keywordSearch(query: RetrievalQuery, _context: unknown): Promise<RetrievalResult> {
    return this.hybridSearch(query, _context);
  }
}

// Returns a valid QueryPlan JSON with the given token usage so the real
// IntentQueryService reaches its tokensPerMonth accounting step.
function planAdapterWithUsage(totalTokens: number): ModelAdapter {
  return {
    providerKey: "plan-adapter",
    async complete() {
      const plan = {
        schemaVersion: "1.0.0",
        normalizedQuestion: "q",
        originalQuestion: "q",
        language: "en",
        detectedIntent: "knowledge_question",
        intentConfidence: 0.95,
        entities: [],
        temporalConstraints: [],
        referencedDocumentIds: [],
        referencedDocumentTitles: [],
        departments: [],
        categories: [],
        exactTerms: [],
        semanticQueries: [{ text: "q", language: "en", weight: 1 }],
        keywordQueries: [],
        clarificationNeeded: false,
        clarification: null,
        isFollowUp: false,
        conversationContextUsed: false,
        promptVersion: "1.0.0",
        modelVersion: "plan-adapter",
        processingMetadata: {
          tokensUsed: totalTokens,
          latencyMs: 1,
          estimatedCost: 0,
          fallbackUsed: false,
        },
      };
      return {
        id: "p1",
        provider: "plan-adapter",
        model: "plan-adapter",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(plan) }, finishReason: "stop" }],
        usage: { promptTokens: 5, completionTokens: 5, totalTokens },
        latencyMs: 1,
        estimatedCost: 0,
      } as Awaited<ReturnType<ModelAdapter["complete"]>>;
    },
  };
}

// A genuine (non-AppError) infrastructure failure from the model provider.
function genericFailureAdapter(): ModelAdapter {
  return {
    providerKey: "failing-adapter",
    async complete() {
      throw new Error("mock generic infra failure");
    },
  };
}

// A control-plane authorization denial from the conversation context adapter.
const unauthorizedContextAdapter: ConversationContextPort = {
  async getContext() {
    throw new AppError(403, FORBIDDEN, "Access denied to this conversation context");
  },
};

let retrieval: FakeRetrievalService;
let chatService: ChatService;

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await PackageModel.deleteMany({});
  await SubscriptionModel.deleteMany({});
  await QuotaOverrideModel.deleteMany({});
  await QuotaCounterModel.deleteMany({});
  await MessageModel.deleteMany({});
  await ConversationModel.deleteMany({});

  const tenant = await TenantModel.create({
    name: "Chat Entitlement Corp",
    slug: "chat-entitlement-corp",
    status: "active",
    plan: "free",
  });
  tenantId = tenant.id;

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Chat Admin",
    email: "admin@chat-entitlement.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  actorId = user.id;

  chatContext = {
    tenantId,
    actorId,
    actorEmail: user.email,
    actorRole: user.role,
    traceId: "chat-entitlement-trace",
    requestId: "chat-entitlement-req",
  };

  setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });
  retrieval = new FakeRetrievalService();
  chatService = new ChatService(retrieval, new FakeModelAdapter());
});

// Seeds an active subscription so the entitlement counter has a real limit,
// then caps tokensPerMonth at 100 with 50 already consumed.
async function seedExhaustedTokenQuota(): Promise<void> {
  const tenant = await TenantModel.findOne({ _id: new Types.ObjectId(tenantId) });
  assert.ok(tenant);

  const pkg = await PackageModel.create({
    name: "Chat Entitlement Package",
    code: "chat-entitlement-pkg",
    description: "Test package",
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
        name: "Chat Entitlement Package v1",
        code: "chat-entitlement-pkg-v1",
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

  await QuotaOverrideModel.create({
    tenantId: tenant._id,
    dimension: "tokensPerMonth",
    limit: 100,
    enabled: true,
  });

  await QuotaCounterModel.create({
    tenantId: tenant._id,
    dimension: "tokensPerMonth",
    periodStart: "2026-01",
    value: 50,
  });
}

test("ChatService — ENTITLEMENT_EXCEEDED fails closed without retrieval or assistant persistence", async (t) => {
  await t.test("quota denial propagates and skips retrieval entirely", async () => {
    await seedExhaustedTokenQuota();
    setIntentQueryAdaptersForTests({ modelAdapter: planAdapterWithUsage(150) });

    await assert.rejects(
      chatService.sendMessage(
        { message: "What is our remote work policy?" },
        chatContext,
      ),
      (err: unknown) => {
        const error = err as AppError;
        assert.ok(error instanceof AppError);
        assert.equal(error.code, ENTITLEMENT_EXCEEDED);
        assert.equal(error.statusCode, 429);
        return true;
      },
    );

    assert.equal(retrieval.calls.length, 0, "retrieval must not run after a quota denial");
  });

  await t.test("quota denial persists no assistant message", async () => {
    await seedExhaustedTokenQuota();
    setIntentQueryAdaptersForTests({ modelAdapter: planAdapterWithUsage(150) });

    await assert.rejects(
      chatService.sendMessage(
        { message: "What is our remote work policy?" },
        chatContext,
      ),
      (err: unknown) => {
        assert.ok((err as AppError) instanceof AppError);
        assert.equal((err as AppError).code, ENTITLEMENT_EXCEEDED);
        return true;
      },
    );

    assert.equal(
      await MessageModel.countDocuments({ role: "assistant" }),
      0,
      "no assistant answer may be persisted after a quota denial",
    );
  });
});

test("ChatService — authorization control errors from intent analysis fail closed", async () => {
  setIntentQueryAdaptersForTests({
    modelAdapter: new FakeModelAdapter(),
    conversationContextAdapter: unauthorizedContextAdapter,
  });

  await assert.rejects(
    chatService.sendMessage(
      { message: "What is our remote work policy?" },
      chatContext,
    ),
    (err: unknown) => {
      const error = err as AppError;
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, FORBIDDEN);
      return true;
    },
  );

  assert.equal(retrieval.calls.length, 0, "retrieval must not run after a control-plane denial");
});

test("ChatService — generic infrastructure failure still degrades to raw-message routing", async () => {
  setIntentQueryAdaptersForTests({ modelAdapter: genericFailureAdapter() });

  const response = await chatService.sendMessage(
    { message: "What is our remote work policy?" },
    chatContext,
  );

  assert.equal(retrieval.calls.length, 1, "a generic intent failure must still route to retrieval");
  assert.deepEqual(response.sources, []);
});
