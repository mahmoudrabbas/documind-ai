import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Readable } from "node:stream";

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
import type { VisionAdapter } from "../../providers/llm/visionAdapter.js";
import type { StorageProvider } from "../../providers/storage/types.js";
import { AppError } from "../../common/errors/AppError.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import * as chatRepo from "./chat.repository.js";

const TEST_PASSWORD = "StrongPass123!";

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(256),
]);

interface RecordingCall {
  messages: { role: string; content: string }[];
}

function createRecordingAdapter(answer: string): {
  adapter: ModelAdapter;
  calls: RecordingCall[];
} {
  const calls: RecordingCall[] = [];
  const adapter: ModelAdapter = {
    providerKey: "recording",
    async complete(params) {
      calls.push({ messages: params.messages });
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
                answer,
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

function createReasoningVisionAdapter(): VisionAdapter {
  return {
    providerKey: "fake-vision",
    model: "fake-vision-model",
    async analyzeImage() {
      return "<analysis>internal vision reasoning</analysis>Vision answer.";
    },
    async describeDocument() {
      return "Document description.";
    },
  };
}

function createStubStorage(): StorageProvider {
  return {
    async saveFile() {
      return "storage-key-1";
    },
    async saveFileFromStream() {
      return "storage-key-1";
    },
    async deleteFile() {},
    async getFileStream() {
      return new Readable();
    },
    async getFileBuffer() {
      return Buffer.alloc(0);
    },
    getContentType() {
      return "image/jpeg";
    },
  };
}

function createCountingStorage(): StorageProvider & { saveFileCalls: number } {
  const storage = createStubStorage();
  return {
    ...storage,
    saveFileCalls: 0,
    async saveFile(...args: Parameters<StorageProvider["saveFile"]>) {
      (this as { saveFileCalls: number }).saveFileCalls += 1;
      return storage.saveFile(...args);
    },
  };
}

function createSequencedVisionAdapter(
  responses: string[],
): VisionAdapter & { analyzeCalls: number } {
  let callIndex = 0;
  return {
    providerKey: "fake-vision",
    model: "fake-vision-model",
    analyzeCalls: 0,
    async analyzeImage() {
      (this as { analyzeCalls: number }).analyzeCalls += 1;
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex += 1;
      return response;
    },
    async describeDocument() {
      return "Document description.";
    },
  };
}

function createStubRetrieval(
  tenantId = "",
): HybridRetrievalService {
  const candidate: RetrievalCandidate = {
    chunkId: "chunk-1",
    documentId: new mongoose.Types.ObjectId().toString(),
    documentVersionId: new mongoose.Types.ObjectId().toString(),
    tenantId,
    text: "The company handbook covers onboarding and travel.",
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
      reasons: ["Strong authorized sanitization test evidence"],
    },
    scoreExplanation: "Deterministic sanitization test evidence",
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
          traceId: "chat-sanitization-test",
        },
        evidenceBundle,
      };
    },
    async vectorSearch() {
      throw new Error("not used in sanitization test");
    },
    async keywordSearch() {
      throw new Error("not used in sanitization test");
    },
  };
}

async function seedTenantAdmin() {
  const tenant = await TenantModel.create({
    name: "Acme Consulting",
    slug: "acme-consulting-sanitization",
    status: "active",
    plan: "free",
    settings: { aiRuntimePreferences: { maxTokens: 1024 } },
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

function actorContext(
  tenant: { id: string },
  user: { id: string; email: string },
): OperationAuthorizationContext {
  return {
    tenantId: tenant.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: "COMPANY_ADMIN",
  };
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

test("sendVisionMessage strips reasoning from the returned and persisted vision answer", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const { adapter } = createRecordingAdapter("unused");
  const service = new ChatService(
    createStubRetrieval(),
    adapter,
    createReasoningVisionAdapter(),
    createStubStorage(),
  );

  const response = await service.sendVisionMessage(
    { question: "What is in this image?" },
    { buffer: JPEG, originalname: "photo.jpg", mimetype: "image/jpeg" },
    actorContext(tenant, user),
  );

  assert.equal(response.answer, "Vision answer.");
  assert.ok(!response.answer.includes("<analysis>"));

  const messages = await chatRepo.getConversationHistory(
    tenant.id,
    response.conversationId,
    20,
  );
  const assistant = messages.find((m) => m.role === "assistant");
  assert.ok(assistant);
  assert.equal(assistant.content, "Vision answer.");
  assert.ok(!assistant.content.includes("<analysis>"));
});

test("sendVisionMessage fails with a controlled error when the vision answer is only reasoning", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const { adapter } = createRecordingAdapter("unused");
  const visionAdapter = createSequencedVisionAdapter([
    "<think>internal chain of thought only</think>",
  ]);
  const service = new ChatService(
    createStubRetrieval(),
    adapter,
    visionAdapter,
    createStubStorage(),
  );

  await assert.rejects(
    () =>
      service.sendVisionMessage(
        { question: "What is in this image?" },
        { buffer: JPEG, originalname: "photo.jpg", mimetype: "image/jpeg" },
        actorContext(tenant, user),
      ),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "VISION_UNAVAILABLE" &&
      error.statusCode === 502,
  );

  // The bounded retry ran exactly once (two attempts total) and no assistant
  // reply was persisted.
  assert.equal(visionAdapter.analyzeCalls, 2);
  const messages = await MessageModel.find({});
  assert.equal(messages.filter((m) => m.role === "assistant").length, 0);
});

test("sendVisionMessage retries once and returns the Arabic answer from the retry", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const { adapter } = createRecordingAdapter("unused");
  const visionAdapter = createSequencedVisionAdapter([
    "<think>أفكر في الخطوات بالتفصيل</think>",
    "الجواب النهائي هو ١٠٠.",
  ]);
  const storage = createCountingStorage();
  const service = new ChatService(
    createStubRetrieval(),
    adapter,
    visionAdapter,
    storage,
  );

  const response = await service.sendVisionMessage(
    { question: "ما هو الجواب؟" },
    { buffer: JPEG, originalname: "photo.jpg", mimetype: "image/jpeg" },
    actorContext(tenant, user),
  );

  assert.equal(visionAdapter.analyzeCalls, 2);
  assert.equal(response.answer, "الجواب النهائي هو ١٠٠.");
  assert.ok(!response.answer.includes("<think>"));

  // The retry must not re-upload the image or duplicate messages.
  assert.equal(storage.saveFileCalls, 1);
  const messages = await chatRepo.getConversationHistory(
    tenant.id,
    response.conversationId,
    20,
  );
  assert.equal(messages.filter((m) => m.role === "user").length, 1);
  const assistants = messages.filter((m) => m.role === "assistant");
  assert.equal(assistants.length, 1);
  assert.equal(assistants[0].content, "الجواب النهائي هو ١٠٠.");
  assert.ok(!assistants[0].content.includes("<think>"));
});

test("sendVisionMessage retries once when the first answer leaves an unclosed reasoning block", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const { adapter } = createRecordingAdapter("unused");
  const visionAdapter = createSequencedVisionAdapter([
    "Incomplete.<think>reasoning that never closes",
    "The total is 42.",
  ]);
  const service = new ChatService(
    createStubRetrieval(),
    adapter,
    visionAdapter,
    createStubStorage(),
  );

  const response = await service.sendVisionMessage(
    { question: "What is the total?" },
    { buffer: JPEG, originalname: "photo.jpg", mimetype: "image/jpeg" },
    actorContext(tenant, user),
  );

  assert.equal(visionAdapter.analyzeCalls, 2);
  assert.equal(response.answer, "The total is 42.");
  assert.ok(!response.answer.includes("<think>"));
});

test("getConversationMessages sanitizes legacy assistant reasoning at the read boundary", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const service = new ChatService(createStubRetrieval(), createRecordingAdapter("x").adapter);

  const conv = await chatRepo.createConversation(
    tenant.id,
    user.id,
    "Legacy conversation",
  );
  await chatRepo.addMessage(tenant.id, conv._id.toString(), "user", "Hello", 0);
  await chatRepo.addMessage(
    tenant.id,
    conv._id.toString(),
    "assistant",
    "<think>legacy reasoning</think>Legacy answer.",
    1,
  );

  const { messages } = await service.getConversationMessages(
    conv._id.toString(),
    actorContext(tenant, user),
  );

  const assistant = messages.find((m) => m.role === "assistant");
  assert.ok(assistant);
  assert.equal(assistant.content, "Legacy answer.");
  assert.ok(!assistant.content.includes("<think>"));
});

test("listConversations preview sanitizes legacy assistant reasoning", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const service = new ChatService(createStubRetrieval(), createRecordingAdapter("x").adapter);

  const conv = await chatRepo.createConversation(
    tenant.id,
    user.id,
    "Legacy conversation",
  );
  await chatRepo.addMessage(
    tenant.id,
    conv._id.toString(),
    "assistant",
    "<think>legacy reasoning</think>Legacy preview.",
    0,
  );
  await chatRepo.addMessage(tenant.id, conv._id.toString(), "user", "Hello", 1);

  const { conversations } = await service.listConversations(
    { page: 1, pageSize: 20 },
    actorContext(tenant, user),
  );

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].lastMessage, "Legacy preview.");
  assert.ok(!conversations[0].lastMessage.includes("<think>"));
});
