import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentModel from "../../db/models/document.model.js";
import MessageModel from "../../db/models/message.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { disconnectRedis } from "../../db/redis.js";

import { ChatService } from "./chat.service.js";
import type { ModelAdapter, ModelCompletionResponse } from "../agents/agents.types.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { RetrievalCandidate, RetrievalQuery, RetrievalResult } from "../retrieval/retrieval.types.js";
import type { EvidenceBundle, EvidenceItem } from "../reranker/reranker.types.js";
import { setIntentQueryAdaptersForTests } from "../intent-query/intentQuery.factory.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";

let mongoServer: MongoMemoryReplSet | null = null;
const TEST_PASSWORD = "StrongPass123!";

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "chat-answer-writer-regression-test" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "chat-answer-writer-regression-test" });
  }
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

let tenantId: string;
let actorId: string;
let chatContext: Parameters<ChatService["sendMessage"]>[1];

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
        traceId: "chat-answer-writer-regression-test",
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

function candidate(overrides: Partial<RetrievalCandidate>): RetrievalCandidate {
  return {
    chunkId: "chunk-" + Math.random().toString(36).slice(2, 8),
    documentId: new mongoose.Types.ObjectId().toString(),
    documentVersionId: new mongoose.Types.ObjectId().toString(),
    tenantId,
    text: "Evidence chunk text.",
    score: 0.03,
    pageNumber: 1,
    sectionTitle: "Section",
    retrievalMethod: "hybrid",
    ...overrides,
  };
}

function bundle(items: EvidenceItem[]): EvidenceBundle {
  return {
    items,
    totalTokenCount: 0,
    maxTokenCount: 4000,
    inputCandidateCount: items.length,
    conflictGroups: [],
    sufficiency: { level: "SUFFICIENT", reasons: ["test"] },
    scoreExplanation: "test",
    accessPolicyVersion: "1",
    createdAt: new Date().toISOString(),
  };
}

function item(candidate: RetrievalCandidate, totalScore: number): EvidenceItem {
  return {
    rank: 1,
    candidate,
    scoreBreakdown: {
      fusionScore: candidate.score,
      rerankScore: totalScore,
      semanticScore: candidate.score,
      exactTermScore: 0,
      sourceAuthorityScore: 0,
      versionPreferenceScore: 0,
      totalScore,
    },
    citationAnchor: {
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentVersionId: candidate.documentVersionId,
      pageNumber: candidate.pageNumber,
    },
    textExcerpt: candidate.text,
  };
}

// Scripted provider adapter that emits exactly the content a test asks for, so
// the legacy chat path can be exercised with raw model output ranging from
// valid contract JSON to malformed/unknown-key JSON.
class ScriptedAnswerAdapter implements ModelAdapter {
  readonly providerKey = "scripted";
  readonly modelName = "scripted-model";
  calls = 0;
  content = "";

  setContent(content: string) {
    this.content = content;
  }

  async complete(): Promise<ModelCompletionResponse> {
    this.calls += 1;
    return {
      id: `scripted-${Date.now()}`,
      provider: this.providerKey,
      model: this.modelName,
      choices: [
        { index: 0, message: { role: "assistant", content: this.content }, finishReason: "stop" },
      ],
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
      latencyMs: 1,
      estimatedCost: 0,
    };
  }
}

async function seedTenantAdmin() {
  const tenant = await TenantModel.create({
    name: "Answer Writer Regression Corp",
    slug: "answer-writer-regression",
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Regression Admin",
    email: "admin@regression-corp.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

async function seedDoc() {
  return DocumentModel.create({
    tenantId,
    fileName: "civic-ops.pdf",
    originalFileName: "civic-ops.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: `${tenantId}/civic-ops.pdf`,
    checksum: "cs-civic-ops",
    status: "uploaded" as const,
    metadata: { title: "CivicOps Handbook", description: null, tags: [] },
    classification: "internal" as const,
    uploadedBy: actorId,
  });
}

const ENGLISH_REFUSAL = "I don't have sufficient authorized evidence to answer that question.";
const HUMAN_ANSWER = "CivicOps AI is a platform for civic operations.";

let retrieval: FakeRetrievalService;
let generator: ScriptedAnswerAdapter;
let chatService: ChatService;

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await MessageModel.deleteMany({});

  const { tenant, user } = await seedTenantAdmin();
  tenantId = tenant.id;
  actorId = user.id;
  chatContext = {
    tenantId,
    actorId,
    actorEmail: user.email,
    actorRole: user.role,
    traceId: "chat-answer-writer-regression-trace",
    requestId: "chat-answer-writer-regression-req",
  };

  setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });

  const doc = await seedDoc();
  const strongChunk = candidate({
    chunkId: "handbook-chunk-1",
    documentId: doc.id,
    text: "CivicOps AI is a platform for civic operations.",
  });

  retrieval = new FakeRetrievalService();
  retrieval.candidates = [strongChunk];
  retrieval.evidenceBundle = bundle([item(strongChunk, 0.31)]);

  generator = new ScriptedAnswerAdapter();
  chatService = new ChatService(retrieval, generator);
});

async function lastAssistantMessage() {
  return MessageModel.findOne({ role: "assistant" }).sort({ createdAt: -1 }).lean().exec();
}

test("valid structured grounded JSON returns and persists only the human answer", async () => {
  generator.setContent(
    JSON.stringify({
      decision: "grounded_answer",
      answer: HUMAN_ANSWER,
      citedChunkIds: ["handbook-chunk-1"],
    }),
  );

  const response = await chatService.sendMessage(
    { message: "What is the CivicOps platform?" },
    chatContext,
  );

  assert.equal(response.answer, HUMAN_ANSWER);
  assert.equal(generator.calls, 1);

  const message = await lastAssistantMessage();
  assert.ok(message);
  assert.equal(message.content, HUMAN_ANSWER);
  assert.equal(message.content.includes(`"decision":`), false, "internal JSON must not be persisted");
  assert.equal(message.content.includes("citedChunkIds"), false, "internal JSON must not be persisted");
  assert.ok(Array.isArray(message.sources));
  assert.equal(message.sources.length, 1);
  assert.equal(message.sources[0].chunkId, "handbook-chunk-1");
  assert.equal(message.sources[0].documentTitle, "CivicOps Handbook");
});

test("malformed JSON-looking output is never returned or persisted", async () => {
  const rawMalformed = '{"decision": "grounded_answer", "answer": "' + HUMAN_ANSWER;
  generator.setContent(rawMalformed);

  const response = await chatService.sendMessage(
    { message: "What is the CivicOps platform?" },
    chatContext,
  );

  assert.equal(response.answer, ENGLISH_REFUSAL);
  assert.equal(response.answer.includes(rawMalformed), false);
  assert.deepEqual(response.sources, []);

  const message = await lastAssistantMessage();
  assert.ok(message);
  assert.equal(message.content, ENGLISH_REFUSAL);
  assert.equal(message.content.includes(rawMalformed), false, "raw malformed JSON must not be persisted");
  assert.equal(message.content.includes(`"decision":`), false);
  assert.equal(message.content.includes("citedChunkIds"), false);
});

test("structured output with unknown keys is never returned or persisted", async () => {
  const rawUnknownKey =
    '{"decision":"grounded_answer","answer":"' +
    HUMAN_ANSWER +
    '","citedChunkIds":["handbook-chunk-1"],"confidential":"secret"}';
  generator.setContent(rawUnknownKey);

  const response = await chatService.sendMessage(
    { message: "What is the CivicOps platform?" },
    chatContext,
  );

  assert.equal(response.answer, ENGLISH_REFUSAL);
  assert.equal(response.answer.includes(HUMAN_ANSWER), false);
  assert.deepEqual(response.sources, []);

  const message = await lastAssistantMessage();
  assert.ok(message);
  assert.equal(message.content, ENGLISH_REFUSAL);
  assert.equal(message.content.includes(rawUnknownKey), false, "raw unknown-key JSON must not be persisted");
  assert.equal(message.content.includes(`"decision":`), false);
  assert.equal(message.content.includes("citedChunkIds"), false);
  assert.equal(message.content.includes("confidential"), false);
});

test("valid insufficient_evidence JSON keeps normal chat behavior", async () => {
  generator.setContent(
    JSON.stringify({
      decision: "insufficient_evidence",
      answer: "I could not find enough information in the provided documents.",
      citedChunkIds: [],
    }),
  );

  const response = await chatService.sendMessage(
    { message: "What is the CivicOps platform?" },
    chatContext,
  );

  assert.equal(
    response.answer,
    "I could not find enough information in the provided documents.",
  );
  assert.deepEqual(response.sources, []);

  const message = await lastAssistantMessage();
  assert.ok(message);
  assert.equal(
    message.content,
    "I could not find enough information in the provided documents.",
  );
  assert.equal(message.content.includes(`"decision":`), false);
});
