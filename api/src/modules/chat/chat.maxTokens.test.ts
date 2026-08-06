import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";

import { connectDB, disconnectDB } from "../../db/connection.js";
import { connectRedis, disconnectRedis, getRedisClient } from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import ConversationModel from "../../db/models/conversation.model.js";
import MessageModel from "../../db/models/message.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { ChatService } from "./chat.service.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";
import type { EvidenceBundle, EvidenceItem } from "../reranker/reranker.types.js";
import type { ModelAdapter, ModelCompletionResponse } from "../agents/agents.types.js";

const TEST_PASSWORD = "StrongPass123!";

interface RecordingCall {
  maxTokens?: number;
  temperature?: number;
  messages: { role: string; content: string }[];
}

function createRecordingAdapter(): {
  adapter: ModelAdapter;
  calls: RecordingCall[];
} {
  const calls: RecordingCall[] = [];
  const adapter: ModelAdapter = {
    providerKey: "recording",
    async complete(params) {
      calls.push({
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        messages: params.messages,
      });
      const response: ModelCompletionResponse = {
        id: "recording-1",
        provider: "recording",
        model: "recording-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                decision: "grounded_answer",
                answer: "Mock answer from recorder.",
                citedChunkIds: ["chunk-1"],
              }),
            },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: 0, completionTokens: 8, totalTokens: 8 },
        latencyMs: 1,
        estimatedCost: 0,
      };
      return response;
    },
  };
  return { adapter, calls };
}

function createStubRetrieval(tenantId: string): HybridRetrievalService {
  const candidate: RetrievalCandidate = {
    chunkId: "chunk-1",
    documentId: new mongoose.Types.ObjectId().toString(),
    documentVersionId: new mongoose.Types.ObjectId().toString(),
    tenantId,
    text: "The company handbook covers onboarding and remote work.",
    score: 0.9,
    pageNumber: 2,
    sectionTitle: "Onboarding",
    retrievalMethod: "hybrid",
  };

  const evidenceItem: EvidenceItem = {
    rank: 1,
    candidate,
    scoreBreakdown: {
      fusionScore: candidate.score,
      rerankScore: 0.9,
      semanticScore: candidate.score,
      exactTermScore: 0,
      sourceAuthorityScore: 0,
      versionPreferenceScore: 0,
      totalScore: 0.9,
    },
    citationAnchor: {
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentVersionId: candidate.documentVersionId,
      pageNumber: candidate.pageNumber,
    },
    textExcerpt: candidate.text,
  };

  const evidenceBundle: EvidenceBundle = {
    items: [evidenceItem],
    totalTokenCount: 20,
    maxTokenCount: 4000,
    inputCandidateCount: 1,
    conflictGroups: [],
    sufficiency: {
      level: "SUFFICIENT",
      reasons: ["Strong authorized test evidence"],
    },
    scoreExplanation: "Deterministic maxTokens test evidence",
    accessPolicyVersion: "test",
    createdAt: new Date().toISOString(),
  };

  return {
    async hybridSearch() {
      return {
        candidates: [candidate],
        totalCandidates: 1,
        filterSummary: {
          tenantFilter: true,
          roleFilter: "COMPANY_ADMIN",
          permissionScopes: [],
          explicitFilters: [],
          versionFilter: false,
        },
        diagnostics: {
          totalLatencyMs: 5,
          vectorCandidateCount: 1,
          keywordCandidateCount: 1,
          traceId: "chat-max-tokens-test",
        },
        evidenceBundle,
      };
    },
    async vectorSearch() {
      throw new Error("not used in maxTokens test");
    },
    async keywordSearch() {
      throw new Error("not used in maxTokens test");
    },
  };
}

async function seedTenantAdmin(maxTokens: number) {
  const tenant = await TenantModel.create({
    name: "Acme Consulting",
    slug: "acme-consulting-max-tokens",
    status: "active",
    plan: "free",
    settings: { aiRuntimePreferences: { maxTokens } },
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Sarah Ahmed",
    email: "sarah@acme.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

before(async () => {
  await connectDB();
  await connectRedis();
});

after(async () => {
  await disconnectRedis();
  await disconnectDB();
});

beforeEach(async () => {
  await Promise.all([
    TenantModel.deleteMany({}),
    UserModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    getRedisClient().flushdb().catch(() => {}),
  ]);
});

test("tenant aiRuntimePreferences.maxTokens is injected into the LLM completion call", async () => {
  const { tenant, user } = await seedTenantAdmin(128);
  const { adapter, calls } = createRecordingAdapter();
  const service = new ChatService(createStubRetrieval(tenant.id), adapter);

  const response = await service.sendMessage(
    { message: "What does the handbook say about onboarding?" },
    {
      tenantId: tenant.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-1",
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxTokens, 128);
  assert.equal(calls[0].temperature, 0.3);
  assert.ok(calls[0].messages.some((m) => m.role === "system"));
  assert.equal(
    calls[0].messages[calls[0].messages.length - 1].content,
    "What does the handbook say about onboarding?",
  );
  assert.equal(response.answer, "Mock answer from recorder.");
});

test("default maxTokens is used when tenant settings are not customized", async () => {
  const { tenant, user } = await seedTenantAdmin(1024);
  const { adapter, calls } = createRecordingAdapter();
  const service = new ChatService(createStubRetrieval(tenant.id), adapter);

  await service.sendMessage(
    { message: "What is the remote work policy?" },
    {
      tenantId: tenant.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: "COMPANY_ADMIN",
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxTokens, 1024);
});
