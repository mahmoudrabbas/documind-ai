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

import { ChatService, filterSufficientEvidence, isSufficientEvidence } from "./chat.service.js";
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
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "chat-evidence-gate-test" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "chat-evidence-gate-test" });
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
        traceId: "chat-evidence-gate-test",
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

function bundle(items: EvidenceItem[], sufficiencyLevel?: import("../reranker/reranker.types.js").SufficiencyLevel): EvidenceBundle {
  return {
    items,
    totalTokenCount: 0,
    maxTokenCount: 4000,
    inputCandidateCount: items.length,
    conflictGroups: [],
    sufficiency: {
      level: sufficiencyLevel ?? "SUFFICIENT",
      reasons: ["test"],
    },
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

class StructuredAdapter implements ModelAdapter {
  readonly providerKey = "structured";
  calls = 0;
  // By default the adapter will return a grounded_answer with one valid and one invented citation
  citedChunkIds: string[] = [];

  constructor(citedChunkIds: string[] = []) {
    this.citedChunkIds = citedChunkIds;
  }

  async complete(): Promise<ModelCompletionResponse> {
    this.calls += 1;
    const payload = {
      decision: "grounded_answer",
      answer: "Summarized: see cited chunks.",
      citedChunkIds: this.citedChunkIds,
    };
    return {
      id: `structured-${Date.now()}`,
      provider: "structured",
      model: "structured-model",
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(payload) }, finishReason: "stop" }],
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
      latencyMs: 1,
      estimatedCost: 0,
    };
  }
}

async function seedTenantAdmin() {
  const tenant = await TenantModel.create({
    name: "Evidence Corp",
    slug: "evidence-corp",
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Evidence Admin",
    email: "admin@evidence-corp.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

async function seedDoc(fileName: string, title: string) {
  const doc = await DocumentModel.create({
    tenantId,
    fileName,
    originalFileName: fileName,
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: `${tenantId}/${fileName}`,
    checksum: `cs-${fileName}`,
    status: "uploaded" as const,
    metadata: { title, description: null, tags: [] },
    classification: "internal" as const,
    uploadedBy: actorId,
  });
  return doc;
}

let retrieval: FakeRetrievalService;
let generator: StructuredAdapter;
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
    traceId: "chat-evidence-gate-trace",
    requestId: "chat-evidence-gate-req",
  };

  setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });

  retrieval = new FakeRetrievalService();
  // For the mixture test, create a structured adapter that returns two cited IDs
  // (one valid, one invented). The adapter will be reused across tests where set
  // in beforeEach.
  generator = new StructuredAdapter(["handbook-chunk-1", "invented-1"]);
  // Expose the last created generator instance for debugging equality checks
  // Suppress linter complaints about any usage in tests where mocking adapters is typical
  /* eslint-disable @typescript-eslint/no-explicit-any */
  chatService = new ChatService(retrieval, generator as any);
});

test("isSufficientEvidence honours the shared weak boundary", () => {
  assert.equal(isSufficientEvidence(0.25), true);
  assert.equal(isSufficientEvidence(0.5), true);
  assert.equal(isSufficientEvidence(0.2499), false);
  assert.equal(isSufficientEvidence(0.1), false);
  assert.equal(isSufficientEvidence(0), false);
  assert.equal(isSufficientEvidence(-1), false);
  assert.equal(isSufficientEvidence(Number.NaN), false);
  assert.equal(isSufficientEvidence(Number.POSITIVE_INFINITY), false);
  assert.equal(isSufficientEvidence(Number.NEGATIVE_INFINITY), false);
});

test("filterSufficientEvidence drops weak bundle items but preserves survivor order", () => {
  const strongA = candidate({ chunkId: "a", score: 0.033 });
  const weak = candidate({ chunkId: "b", score: 0.02 });
  const strongB = candidate({ chunkId: "c", score: 0.033 });
  const candidates = [weak, strongA, weak, strongB];

  const survivors = filterSufficientEvidence(
    candidates,
    bundle([
      item(strongA, 0.31),
      item(strongB, 0.28),
      item(weak, 0.12),
      item(weak, 0.08),
    ]),
  );

  assert.deepEqual(
    survivors.map((c) => c.chunkId),
    ["a", "c"],
  );
});

test("filterSufficientEvidence fails closed without a bundle", () => {
  const candidates = [
    candidate({ chunkId: "kept", score: 0.033 }),
    candidate({ chunkId: "zero", score: 0 }),
    candidate({ chunkId: "nan", score: Number.NaN }),
  ];

  const survivors = filterSufficientEvidence(candidates, null);

  assert.deepEqual(survivors, []);
});

test("filterSufficientEvidence fails closed with an empty bundle", () => {
  const candidates = [
    candidate({ chunkId: "kept", score: 0.033 }),
  ];

  const survivors = filterSufficientEvidence(candidates, bundle([]));

  assert.deepEqual(survivors, []);
});

test("weak-only evidence returns a localized refusal and never calls generation", async () => {
  const doc = await seedDoc("civic-ops.pdf", "Civic Operations Handbook");
  const weakChunk = candidate({
    chunkId: "civic-chunk-1",
    documentId: doc.id,
    text: "The civic operations handbook covers street maintenance schedules.",
    score: 0.02,
  });
  retrieval.candidates = [weakChunk];
  retrieval.evidenceBundle = bundle([
    item(weakChunk, 0.11),
  ]);

  const response = await chatService.sendMessage(
    { message: "ما هي سياسة الإجازات؟" },
    chatContext,
  );

  assert.equal(response.answer, "لا توجد أدلة كافية مصرّح بها للإجابة على هذا السؤال.");
  assert.deepEqual(response.sources, []);
  assert.equal(retrieval.calls.length, 1);
  assert.equal((generator as StructuredAdapter)!.calls, 0, "weak evidence must never reach generation");

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  assert.equal(assistantMessage.content, "لا توجد أدلة كافية مصرّح بها للإجابة على هذا السؤال.");
  assert.deepEqual(assistantMessage.sources, []);
});

test("weak-only evidence returns the English refusal for English queries", async () => {
  const doc = await seedDoc("civic-ops.pdf", "Civic Operations Handbook");
  const weakChunk = candidate({
    chunkId: "civic-chunk-2",
    documentId: doc.id,
    text: "The civic operations handbook covers street maintenance schedules.",
    score: 0.02,
  });
  retrieval.candidates = [weakChunk];
  retrieval.evidenceBundle = bundle([
    item(weakChunk, 0.11),
  ]);

  const response = await chatService.sendMessage(
    { message: "What is the remote work policy?" },
    chatContext,
  );

  assert.equal(
    response.answer,
    "I don't have sufficient authorized evidence to answer that question.",
  );
  assert.deepEqual(response.sources, []);
  assert.equal(generator.calls, 0);
});

test("mixture: only strong evidence reaches generation context and citations", async () => {
  const weakDoc = await seedDoc("civic-ops.pdf", "Civic Operations Handbook");
  const strongDoc = await seedDoc("handbook.pdf", "Employee Handbook");
  const weakChunk = candidate({
    chunkId: "civic-chunk-3",
    documentId: weakDoc.id,
    text: "Civic ops street maintenance schedules.",
    score: 0.02,
  });
  const strongChunk = candidate({
    chunkId: "handbook-chunk-1",
    documentId: strongDoc.id,
    text: "Remote work is allowed twice a week.",
    score: 0.033,
  });
  retrieval.candidates = [weakChunk, strongChunk];
  retrieval.evidenceBundle = bundle([
    item(strongChunk, 0.31),
    item(weakChunk, 0.1),
  ]);

  const response = await chatService.sendMessage(
    { message: "How often can I work remotely?" },
    chatContext,
  );

  // generation should have produced sources for the strong survivor
  assert.ok(response.sources, "sources must be present");
  assert.equal(response.sources.length, 1);
  
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].chunkId, "handbook-chunk-1");
  assert.equal(response.sources[0].documentTitle, "Employee Handbook");
  assert.equal(response.sources[0].text, "Remote work is allowed twice a week.");

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  assert.equal(assistantMessage.sources.length, 1);
  assert.equal(assistantMessage.sources[0].chunkId, "handbook-chunk-1");
});

test("zero candidates returns the refusal without calling generation", async () => {
  retrieval.candidates = [];
  retrieval.evidenceBundle = bundle([]);

  const response = await chatService.sendMessage(
    { message: "What is the remote work policy?" },
    chatContext,
  );

  assert.equal(
    response.answer,
    "I don't have sufficient authorized evidence to answer that question.",
  );
  assert.deepEqual(response.sources, []);
  assert.equal(generator.calls, 0);
});

test("several weak candidates return the refusal without calling generation", async () => {
  const doc = await seedDoc("civic-ops.pdf", "Civic Operations Handbook");
  const weakChunks = [
    candidate({
      chunkId: "civic-chunk-a",
      documentId: doc.id,
      text: "Civic ops street maintenance schedules.",
      score: 0.02,
    }),
    candidate({
      chunkId: "civic-chunk-b",
      documentId: doc.id,
      text: "Civic ops permits process.",
      score: 0.01,
    }),
    candidate({
      chunkId: "civic-chunk-c",
      documentId: doc.id,
      text: "Civic ops inspection rules.",
      score: 0.03,
    }),
  ];
  retrieval.candidates = weakChunks;
  retrieval.evidenceBundle = bundle([
    item(weakChunks[0], 0.11),
    item(weakChunks[1], 0.08),
    item(weakChunks[2], 0.14),
  ]);

  const response = await chatService.sendMessage(
    { message: "What is the remote work policy?" },
    chatContext,
  );

  assert.equal(
    response.answer,
    "I don't have sufficient authorized evidence to answer that question.",
  );
  assert.deepEqual(response.sources, []);
  assert.equal((generator as StructuredAdapter)!.calls, 0, "several weak candidates must never reach generation");
});

test("NaN score in bundle is safely rejected", () => {
  const strong = candidate({ chunkId: "strong", score: 0.033 });
  const nanCandidate = candidate({ chunkId: "nan", score: Number.NaN });

  const survivors = filterSufficientEvidence(
    [strong, nanCandidate],
    bundle([
      item(strong, 0.31),
      item(nanCandidate, Number.NaN),
    ]),
  );

  assert.deepEqual(
    survivors.map((c) => c.chunkId),
    ["strong"],
  );
});

test("filterSufficientEvidence refuses NO_EVIDENCE bundle", () => {
  const strong = candidate({ chunkId: "strong", score: 0.033 });
  const survivors = filterSufficientEvidence(
    [strong],
    bundle([item(strong, 0.31)], "NO_EVIDENCE"),
  );
  assert.deepEqual(survivors, []);
});

test("filterSufficientEvidence refuses WEAK bundle even with strong individual items", () => {
  const strong = candidate({ chunkId: "strong", score: 0.033 });
  const survivors = filterSufficientEvidence(
    [strong],
    bundle([item(strong, 0.31)], "WEAK"),
  );
  assert.deepEqual(survivors, []);
});

test("filterSufficientEvidence refuses CONFLICTING bundle", () => {
  const strong = candidate({ chunkId: "strong", score: 0.033 });
  const survivors = filterSufficientEvidence(
    [strong],
    bundle([item(strong, 0.31)], "CONFLICTING"),
  );
  assert.deepEqual(survivors, []);
});

test("filterSufficientEvidence allows SUFFICIENT bundle with strong items only", () => {
  const strong = candidate({ chunkId: "strong", score: 0.033 });
  const weak = candidate({ chunkId: "weak", score: 0.02 });
  const survivors = filterSufficientEvidence(
    [weak, strong],
    bundle([item(strong, 0.31), item(weak, 0.1)], "SUFFICIENT"),
  );
  assert.deepEqual(
    survivors.map((c) => c.chunkId),
    ["strong"],
  );
});

test("gold-question weak civic-ops evidence is refused with sources empty", async () => {
  const doc = await seedDoc("civic-ops.pdf", "Civic Operations Handbook");
  const weakChunk = candidate({
    chunkId: "civic-chunk-gold",
    documentId: doc.id,
    text: "The civic operations handbook covers street maintenance schedules.",
    score: 0.02,
  });
  retrieval.candidates = [weakChunk];
  retrieval.evidenceBundle = bundle([item(weakChunk, 0.11)], "WEAK");

  const response = await chatService.sendMessage(
    { message: "ما هو سعر الذهب اليوم؟" },
    chatContext,
  );

  assert.equal(
    response.answer,
    "هذا السؤال خارج نطاق وثائق الشركة. يمكنني مساعدتك في الأسئلة المتعلقة بسياسات الشركة ووثائقها.",
  );
  assert.deepEqual(response.sources, []);
  assert.equal((generator as StructuredAdapter)!.calls, 0, "weak gold-question evidence must never reach generation");

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  assert.equal(assistantMessage.content, "هذا السؤال خارج نطاق وثائق الشركة. يمكنني مساعدتك في الأسئلة المتعلقة بسياسات الشركة ووثائقها.");
  assert.deepEqual(assistantMessage.sources, []);
});
