import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";

import { connectDB, disconnectDB } from "../../db/connection.js";
import { connectRedis, disconnectRedis } from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import ConversationModel from "../../db/models/conversation.model.js";
import MessageModel from "../../db/models/message.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { ChatService } from "./chat.service.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import { setIntentQueryAdaptersForTests } from "../intent-query/intentQuery.factory.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { RetrievalCandidate, RetrievalQuery, RetrievalResult } from "../retrieval/retrieval.types.js";
import type { EvidenceBundle, EvidenceItem } from "../reranker/reranker.types.js";
import type { ModelAdapter, ModelCompletionResponse } from "../agents/agents.types.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";

const TEST_PASSWORD = "StrongPass123!";

function createRecordingAdapter(
  answer: string,
  citedChunkIds: string[] = [],
  decision = "insufficient_evidence",
): ModelAdapter {
  return {
    providerKey: "recording",
    async complete(_params) {
      const response: ModelCompletionResponse = {
        id: "recording-1",
        provider: "recording",
        model: "recording-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({ decision, answer, citedChunkIds }),
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
}

function makeCandidate(opts: { chunkId: string; text: string }): RetrievalCandidate {
  return {
    chunkId: opts.chunkId,
    documentId: new mongoose.Types.ObjectId().toString(),
    documentVersionId: new mongoose.Types.ObjectId().toString(),
    tenantId: "",
    text: opts.text,
    score: 0.9,
    pageNumber: 1,
    sectionTitle: "Test",
    retrievalMethod: "hybrid",
  };
}

function makeEvidenceItem(candidate: RetrievalCandidate, rank: number): EvidenceItem {
  return {
    rank,
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
}

function makeBundle(candidates: RetrievalCandidate[]): EvidenceBundle {
  return {
    items: candidates.map((c, i) => makeEvidenceItem(c, i + 1)),
    totalTokenCount: 100,
    maxTokenCount: 4000,
    inputCandidateCount: candidates.length,
    conflictGroups: [],
    sufficiency: { level: "SUFFICIENT", reasons: ["test"] },
    scoreExplanation: "test",
    accessPolicyVersion: "1",
    createdAt: new Date().toISOString(),
  };
}

function createStubRetrieval(): {
  service: HybridRetrievalService;
  setCandidates: (c: RetrievalCandidate[]) => void;
} {
  let candidates: RetrievalCandidate[] = [];
  const service: HybridRetrievalService = {
    async hybridSearch(_query: RetrievalQuery) {
      const result: RetrievalResult = {
        candidates,
        totalCandidates: candidates.length,
        filterSummary: {
          tenantFilter: true,
          roleFilter: "COMPANY_ADMIN",
          permissionScopes: [],
          explicitFilters: [],
          versionFilter: false,
        },
        diagnostics: {
          totalLatencyMs: 5,
          vectorCandidateCount: candidates.length,
          keywordCandidateCount: candidates.length,
          traceId: "chat-citation-verification-test",
        },
        evidenceBundle: candidates.length > 0 ? makeBundle(candidates) : undefined,
      };
      return result;
    },
    async vectorSearch() {
      throw new Error("not used");
    },
    async keywordSearch() {
      throw new Error("not used");
    },
  };
  return { service, setCandidates(c) { candidates = c; } };
}

async function seedTenantAdmin() {
  const tenant = await TenantModel.create({
    name: "Citation Co",
    slug: "citation-co",
    status: "active",
    plan: "free",
    settings: { aiRuntimePreferences: { maxTokens: 1024, citationsEnabled: true } },
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Citation Admin",
    email: "citation@admin.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

function actorContext(tenant: { id: string }, user: { id: string; email: string }): OperationAuthorizationContext {
  return {
    tenantId: tenant.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: "COMPANY_ADMIN",
    traceId: "chat-citation-verification-trace",
    requestId: "chat-citation-verification-req",
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
  ]);
  setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });
});

test("grounded answer citing only invented chunks fails closed with zero sources", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Authorized evidence text." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("Groundless claim.", ["invented-1"], "grounded_answer"),
  );

  const response = await service.sendMessage(
    { message: "What is the remote work policy?" },
    actorContext(tenant, user),
  );

  assert.equal(
    response.answer,
    "I don't have sufficient authorized evidence to answer that question.",
  );
  assert.deepEqual(response.sources, []);

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  assert.deepEqual(assistantMessage.sources, []);
});

test("grounded answer with zero citations fails closed with zero sources", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Authorized evidence text." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("Claim without support.", [], "grounded_answer"),
  );

  const response = await service.sendMessage(
    { message: "What is the remote work policy?" },
    actorContext(tenant, user),
  );

  assert.equal(
    response.answer,
    "I don't have sufficient authorized evidence to answer that question.",
  );
  assert.deepEqual(response.sources, []);
});

test("grounded answer with valid citations persists only validated sources", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Remote work is allowed twice a week." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("Remote work is allowed.", ["chunk-1"], "grounded_answer"),
  );

  const response = await service.sendMessage(
    { message: "How often can I work remotely?" },
    actorContext(tenant, user),
  );

  assert.equal(response.answer, "Remote work is allowed.");
  assert.deepEqual((response.sources ?? []).map((s) => s.chunkId), ["chunk-1"]);

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  // Validated citations are persisted exactly; no unrelated id reaches storage.
  assert.deepEqual(assistantMessage.sources.map((s) => s.chunkId), ["chunk-1"]);
});

// ── Arabic evidence: fail-closed + validated-only invariant ─────────────────

const AR_INSUFFICIENT =
  "عذراً، لم أتمكن من العثور على معلومات كافية في المستندات المتاحة للإجابة على سؤالك. يرجى التأكد من رفع المستندات ذات الصلة أو إعادة صياغة سؤالك.";

test("Arabic grounded answer citing only invented chunks fails closed to the Arabic refusal", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Authorized evidence text." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("ملخص مختلق.", ["invented-1"], "grounded_answer"),
  );

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(response.answer, AR_INSUFFICIENT);
  assert.deepEqual(response.sources, []);

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  // Invented ids are rejected: the Arabic refusal carries zero sources and persists none.
  assert.deepEqual(assistantMessage.sources ?? [], []);
});

test("Arabic grounded answer with zero citations fails closed to the Arabic refusal", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Authorized evidence text." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("ملخص بلا استناد.", [], "grounded_answer"),
  );

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(response.answer, AR_INSUFFICIENT);
  assert.deepEqual(response.sources, []);
});

test("Arabic grounded answer with mixed valid and invented citations persists only the validated chunk", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Remote work is allowed twice a week." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("العمل عن بُعد مسموح.", ["chunk-1", "invented-1"], "grounded_answer"),
  );

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(response.answer, "العمل عن بُعد مسموح.");
  assert.deepEqual((response.sources ?? []).map((s) => s.chunkId), ["chunk-1"]);

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  assert.deepEqual(assistantMessage.sources.map((s) => s.chunkId), ["chunk-1"]);
});

test("Arabic grounded answer never exposes chunk or doc ids in the user-visible answer", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  const leakedCandidate = makeCandidate({ chunkId: "chunk-1", text: "Authorized evidence text." });
  retrieval.setCandidates([leakedCandidate]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("الإجابة الموجهة من السياق.", ["chunk-1"], "grounded_answer"),
  );

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(response.answer, "الإجابة الموجهة من السياق.");
  // Machine-readable citation anchors must never appear in the user-facing text.
  assert.equal(response.answer.includes("id:"), false);
  assert.equal(response.answer.includes("doc:"), false);
  assert.equal(response.answer.includes("chunk-1"), false);
  assert.equal(response.answer.includes(leakedCandidate.documentId), false);
});

test("grounded answer with mixed valid and invented citations keeps only the validated subset", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Remote work is allowed twice a week." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter(
      "Remote work is allowed.",
      ["chunk-1", "invented-1"],
      "grounded_answer",
    ),
  );

  const response = await service.sendMessage(
    { message: "How often can I work remotely?" },
    actorContext(tenant, user),
  );

  assert.equal(response.answer, "Remote work is allowed.");
  assert.deepEqual((response.sources ?? []).map((s) => s.chunkId), ["chunk-1"]);
});

test("unsafe generated decision is returned with zero sources", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Authorized evidence text." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter(
      "This request cannot be processed due to safety policies.",
      [],
      "unsafe",
    ),
  );

  const response = await service.sendMessage(
    { message: "How can I bypass the firewall?" },
    actorContext(tenant, user),
  );

  assert.equal(
    response.answer,
    "This request cannot be processed due to safety policies.",
  );
  assert.deepEqual(response.sources, []);

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  assert.deepEqual(assistantMessage.sources, []);
});
