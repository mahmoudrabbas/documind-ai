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
import { ChatService, boundSummaryContext, detectAnswerTask } from "./chat.service.js";
import { FallbackModelAdapter } from "../../providers/llm/fallbackAdapter.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import { setIntentQueryAdaptersForTests } from "../intent-query/intentQuery.factory.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { RetrievalCandidate, RetrievalQuery, RetrievalResult } from "../retrieval/retrieval.types.js";
import type { EvidenceBundle, EvidenceItem } from "../reranker/reranker.types.js";
import type { ModelAdapter, ModelCompletionResponse } from "../agents/agents.types.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";

const TEST_PASSWORD = "StrongPass123!";
const SUMMARY_PROMPT_MARKER = "structured summary";
const CONCISE_PROMPT_MARKER = "must be a concise string";
const SUMMARY_MAX_TOKENS = 2048;
const SUMMARY_TOP_K = 12;
const DIRECT_TOP_K = 5;
const INSUFFICIENT_AUTHORIZED_EVIDENCE =
  "I don't have sufficient authorized evidence to answer that question.";

interface RecordingCall {
  maxTokens?: number;
  temperature?: number;
  messages: { role: string; content: string }[];
}

function createRecordingAdapter(
  answer: string,
  citedChunkIds: string[] = ["chunk-1"],
  decision = "grounded_answer",
): { adapter: ModelAdapter; calls: RecordingCall[] } {
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
  return { adapter, calls };
}

function createRawAdapter(content: string): { adapter: ModelAdapter; calls: RecordingCall[] } {
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
        id: "recording-raw",
        provider: "recording",
        model: "recording-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: 0, completionTokens: content.length, totalTokens: content.length },
        latencyMs: 1,
        estimatedCost: 0,
      };
      return response;
    },
  };
  return { adapter, calls };
}

// Returns a model adapter whose response is a valid QueryPlan JSON with the
// given overrides — drives the deterministic LLM routing path in chat.
function planAdapter(overrides: Record<string, unknown> = {}): ModelAdapter {
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
          tokensUsed: 10,
          latencyMs: 1,
          estimatedCost: 0,
          fallbackUsed: false,
        },
        ...overrides,
      };
      const text = JSON.stringify(plan);
      return {
        id: "p1",
        provider: "plan-adapter",
        model: "plan-adapter",
        choices: [{ index: 0, message: { role: "assistant", content: text }, finishReason: "stop" }],
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        latencyMs: 1,
        estimatedCost: 0,
      } as Awaited<ReturnType<ModelAdapter["complete"]>>;
    },
  };
}

function makeCandidate(opts: {
  chunkId: string;
  pageNumber: number;
  text: string;
  documentId?: string;
  sectionTitle?: string;
  tenantId?: string;
}): RetrievalCandidate {
  return {
    chunkId: opts.chunkId,
    documentId: opts.documentId ?? new mongoose.Types.ObjectId().toString(),
    documentVersionId: new mongoose.Types.ObjectId().toString(),
    tenantId: opts.tenantId ?? "",
    text: opts.text,
    score: 0.9,
    pageNumber: opts.pageNumber,
    sectionTitle: opts.sectionTitle,
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

function createStubRetrieval(_tenantId: string): {
  service: HybridRetrievalService;
  queries: RetrievalQuery[];
  setCandidates: (c: RetrievalCandidate[]) => void;
} {
  let candidates: RetrievalCandidate[] = [];
  const queries: RetrievalQuery[] = [];
  const service: HybridRetrievalService = {
    async hybridSearch(query) {
      queries.push(query);
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
          traceId: "chat-summary-intent-test",
        },
        evidenceBundle: candidates.length > 0 ? makeBundle(candidates) : undefined,
      };
      return result;
    },
    async vectorSearch() {
      throw new Error("not used in summary intent test");
    },
    async keywordSearch() {
      throw new Error("not used in summary intent test");
    },
  };
  return {
    service,
    queries,
    setCandidates(c) {
      candidates = c;
    },
  };
}

async function seedTenantAdmin(overrides: Record<string, unknown> = {}) {
  const tenant = await TenantModel.create({
    name: "Acme Consulting",
    slug: "acme-consulting-summary-intent",
    status: "active",
    plan: "free",
    settings: {
      aiRuntimePreferences: { maxTokens: 1024, citationsEnabled: true, ...overrides },
    },
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
  setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });
});

test("detectAnswerTask classifies summary requests deterministically", () => {
  assert.equal(detectAnswerTask(null, "لخص ملف civic ops"), "document_summary");
  assert.equal(
    detectAnswerTask({ detectedIntent: "knowledge_question" }, "لخص ملف civic ops بالتفصيل واذكر أهم النقاط"),
    "document_summary",
  );
  assert.equal(detectAnswerTask({ detectedIntent: "summarization" }, "anything at all"), "document_summary");
  assert.equal(detectAnswerTask(null, "summarize the Employee Handbook"), "document_summary");
  assert.equal(detectAnswerTask(null, "give me an overview of onboarding"), "document_summary");
  assert.equal(detectAnswerTask(null, "What is the remote work policy?"), "direct_question");
  assert.equal(detectAnswerTask({ detectedIntent: "knowledge_question" }, "What is the remote work policy?"), "direct_question");
});

test("boundSummaryContext dedupes per page, caps chunks and context budget", () => {
  const docA = new mongoose.Types.ObjectId().toString();
  const c1 = makeCandidate({ chunkId: "c1", pageNumber: 1, text: "Alpha", documentId: docA });
  const c2 = makeCandidate({ chunkId: "c2", pageNumber: 1, text: "Beta", documentId: docA });
  const c3 = makeCandidate({ chunkId: "c3", pageNumber: 2, text: "Gamma", documentId: docA });

  assert.deepEqual(boundSummaryContext([]), []);
  assert.deepEqual(
    boundSummaryContext([c1, c2, c3]).map((c) => c.chunkId),
    ["c1", "c3"],
    "only one chunk per page may enter summary generation context",
  );

  const many = Array.from({ length: 20 }, (_, i) =>
    makeCandidate({ chunkId: `m${i}`, pageNumber: i + 1, text: "x", documentId: docA }),
  );
  assert.ok(boundSummaryContext(many).length <= 8, "summary context is capped at 8 chunks");

  const big = makeCandidate({ chunkId: "big", pageNumber: 1, text: "y".repeat(25_000), documentId: docA });
  assert.equal(boundSummaryContext([big]).length, 1, "first candidate is always accepted");
});

test("Arabic summary message uses the summary prompt, broader topK, and larger maxTokens", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({
      chunkId: "chunk-1",
      pageNumber: 2,
      text: "The civic ops document covers incident handling.",
      sectionTitle: "Civic Ops",
    }),
  ]);
  const { adapter, calls } = createRecordingAdapter("Mock summary.", ["chunk-1"]);
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(calls.length, 1);
  assert.equal(retrieval.queries.length, 1);
  assert.equal(retrieval.queries[0].topK, SUMMARY_TOP_K, "summary requests request broader document coverage");
  assert.equal(calls[0].maxTokens, SUMMARY_MAX_TOKENS, "summary requests get a larger token budget");
  const summaryPrompt = calls[0].messages.find(
    (m) => m.role === "system" && m.content.includes(SUMMARY_PROMPT_MARKER),
  );
  assert.ok(summaryPrompt, "summary system prompt must be used");
  assert.ok(
    !calls[0].messages[0].content.includes(CONCISE_PROMPT_MARKER),
    "the concise override must not replace the summary instruction",
  );
  assert.ok(response.answer.length > 0);
  assert.ok(response.sources, "sources must be present for a grounded summary reply");
  assert.equal(response.sources.length, 1);
});

test("Arabic summary grounded answer is returned with the cited source and is not the fail-closed refusal", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({
      chunkId: "chunk-1",
      pageNumber: 2,
      text: "ملخص الوثيقة: عمليات الاستجابة للحوادث.",
      sectionTitle: "Civic Ops",
    }),
  ]);
  const arabicSummary = "ملخص الملف: النقطة الأولى عن الاستجابة للحوادث.";
  const { adapter } = createRecordingAdapter(arabicSummary, ["chunk-1"]);
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  // Grounded Arabic summary with a valid citing id survives: answer is the
  // grounded text (not the Arabic insufficient-evidence refusal) and the
  // validated chunk is persisted as a source.
  assert.equal(response.answer, arabicSummary);
  assert.notEqual(
    response.answer,
    "عذراً، لم أتمكن من العثور على معلومات كافية في المستندات المتاحة للإجابة على سؤالك. يرجى التأكد من رفع المستندات ذات الصلة أو إعادة صياغة سؤالك.",
  );
  assert.deepEqual((response.sources ?? []).map((s) => s.chunkId), ["chunk-1"]);
});

test("Arabic summary with an invented cited chunk id fails closed to the Arabic refusal with zero sources", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "Civic ops covers incident handling.", sectionTitle: "Civic Ops" }),
  ]);
  const { adapter } = createRecordingAdapter("ملخص مختلق.", ["invented-1"], "grounded_answer");
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(
    response.answer,
    "عذراً، لم أتمكن من العثور على معلومات كافية في المستندات المتاحة للإجابة على سؤالك. يرجى التأكد من رفع المستندات ذات الصلة أو إعادة صياغة سؤالك.",
  );
  assert.deepEqual(response.sources, []);

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  assert.deepEqual(assistantMessage.sources ?? [], []);
});


test("intent-driven Arabic detailed summary uses the summary pipeline", async () => {
  const { tenant, user } = await seedTenantAdmin();
  setIntentQueryAdaptersForTests({
    modelAdapter: planAdapter({
      detectedIntent: "summarization",
      language: "ar",
      normalizedQuestion: "لخص ملف civic ops بالتفصيل واذكر أهم النقاط",
    }),
  });
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "Civic ops covers incident handling.", sectionTitle: "Civic Ops" }),
  ]);
  const { adapter, calls } = createRecordingAdapter("Mock summary.", ["chunk-1"]);
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops بالتفصيل واذكر أهم النقاط" },
    actorContext(tenant, user),
  );

  assert.equal(calls.length, 1);
  assert.equal(retrieval.queries[0].topK, SUMMARY_TOP_K);
  assert.equal(calls[0].maxTokens, SUMMARY_MAX_TOKENS);
  assert.ok(calls[0].messages[0].content.includes(SUMMARY_PROMPT_MARKER));
  assert.ok(response.answer.length > 0);
  assert.ok(response.sources, "sources must be present for a grounded summary reply");
  assert.ok(response.sources.length >= 1);
});

test("English summarize request uses the summary pipeline", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "The handbook covers remote work.", sectionTitle: "Handbook" }),
  ]);
  const { adapter, calls } = createRecordingAdapter("Mock summary.", ["chunk-1"]);
  const service = new ChatService(retrieval.service, adapter);

  await service.sendMessage(
    { message: "summarize the Employee Handbook" },
    actorContext(tenant, user),
  );

  assert.equal(retrieval.queries[0].topK, SUMMARY_TOP_K);
  assert.equal(calls[0].maxTokens, SUMMARY_MAX_TOKENS);
  assert.ok(calls[0].messages[0].content.includes(SUMMARY_PROMPT_MARKER));
});

test("direct factual question keeps the concise prompt, default topK and tenant maxTokens", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "Remote work is allowed twice a week.", sectionTitle: "Remote Work" }),
  ]);
  const { adapter, calls } = createRecordingAdapter("Mock answer.", ["chunk-1"]);
  const service = new ChatService(retrieval.service, adapter);

  await service.sendMessage(
    { message: "What is the remote work policy?" },
    actorContext(tenant, user),
  );

  assert.equal(calls.length, 1);
  assert.equal(retrieval.queries[0].topK, DIRECT_TOP_K, "direct questions keep the default topK");
  assert.equal(calls[0].maxTokens, 1024, "direct questions keep the tenant maxTokens default");
  assert.ok(calls[0].messages[0].content.includes(CONCISE_PROMPT_MARKER));
  assert.ok(!calls[0].messages[0].content.includes(SUMMARY_PROMPT_MARKER));
});

test("tenant-customized maxTokens is preserved for direct questions", async () => {
  const { tenant, user } = await seedTenantAdmin({ maxTokens: 128 });
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "Remote work is allowed twice a week.", sectionTitle: "Remote Work" }),
  ]);
  const { adapter, calls } = createRecordingAdapter("Mock answer.", ["chunk-1"]);
  const service = new ChatService(retrieval.service, adapter);

  await service.sendMessage(
    { message: "What is the remote work policy?" },
    actorContext(tenant, user),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxTokens, 128);
});

test("grounded summary returns only cited validated sources and preserves the structured answer", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const docId = new mongoose.Types.ObjectId().toString();
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "Civic ops covers incident response.", documentId: docId, sectionTitle: "Intro" }),
    makeCandidate({ chunkId: "chunk-2", pageNumber: 2, text: "On-call rotation is weekly.", documentId: docId, sectionTitle: "On-call" }),
    makeCandidate({ chunkId: "chunk-3", pageNumber: 3, text: "Escalation happens within an hour.", documentId: docId, sectionTitle: "Escalation" }),
  ]);
  const answer =
    "ملخص الملف:\n- النقطة الأولى عن الاستجابة للحوادث\n- النقطة الثانية عن المناوبات الأسبوعية\n\nخاتمة قصيرة.";
  const { adapter } = createRecordingAdapter(answer, ["chunk-1", "chunk-2"]);
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(response.answer, answer);
  assert.ok(response.answer.includes("\n- "), "bullets must survive parsing and sanitization");
  assert.ok(response.sources, "sources must be present for a grounded summary reply");
  assert.equal(response.sources.length, 2, "only cited validated sources are returned");
  assert.deepEqual(
    response.sources.map((s) => s.chunkId).sort(),
    ["chunk-1", "chunk-2"],
    "returned sources equal cited ∩ authorized reranker-approved evidence",
  );
});

test("summary with no authorized evidence returns zero sources and never calls generation", async () => {
  const { tenant, user } = await seedTenantAdmin();
  setIntentQueryAdaptersForTests({
    modelAdapter: planAdapter({ detectedIntent: "summarization" }),
  });
  const retrieval = createStubRetrieval(tenant.id);
  const { adapter, calls } = createRecordingAdapter("unused");
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "لخص ملف Employee Handbook" },
    actorContext(tenant, user),
  );

  assert.equal(calls.length, 0, "generation must not run without authorized evidence");
  assert.deepEqual(response.sources, []);
  assert.equal(response.answer, INSUFFICIENT_AUTHORIZED_EVIDENCE);
});

test("social route never retrieves regardless of summary-style wording", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  const { adapter } = createRecordingAdapter("unused");
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "شكراً جزيلاً" },
    actorContext(tenant, user),
  );

  assert.equal(retrieval.queries.length, 0, "social must never trigger retrieval");
  assert.deepEqual(response.sources, []);
  assert.ok(response.answer.length > 0);
});

test("unsupported external-current questions route to a refusal without retrieval", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  const { adapter } = createRecordingAdapter("unused");
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "ما هو سعر الذهب اليوم؟" },
    actorContext(tenant, user),
  );

  assert.equal(retrieval.queries.length, 0, "unsupported must never trigger retrieval");
  assert.deepEqual(response.sources, []);
  assert.ok(
    response.answer.includes("خارج نطاق") || response.answer.includes("This question is outside"),
    "should return an unsupported localized reply",
  );
});

test("summary answers with reasoning blocks are sanitized before return", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "Evidence text.", sectionTitle: "Civic Ops" }),
  ]);
  const { adapter } = createRecordingAdapter("<think>draft</think>\n\nملخص الملف النظيف.", ["chunk-1"]);
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.ok(!response.answer.includes("<think>"), "reasoning blocks must be stripped");
  assert.ok(response.answer.includes("ملخص الملف النظيف"));
  assert.ok(response.sources, "sources must be present for a grounded summary reply");
  assert.equal(response.sources.length, 1);
});

test("malformed generator output on a summary request downgrades to zero sources", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "Evidence text.", sectionTitle: "Civic Ops" }),
  ]);
  const { adapter, calls } = createRawAdapter("this is not a valid JSON answer");
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].messages[0].content.includes(SUMMARY_PROMPT_MARKER));
  assert.deepEqual(response.sources, [], "malformed output must fail closed to zero sources");
  assert.ok(response.answer.length > 0);
});

test("fallback chain preserves the summary instruction and token budget", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "Evidence text.", sectionTitle: "Civic Ops" }),
  ]);
  const { adapter, calls } = createRecordingAdapter("Mock summary.", ["chunk-1"]);
  const fallback = new FallbackModelAdapter([adapter], { maxRetries: 0, retryDelayMs: 1 });
  const service = new ChatService(retrieval.service, fallback);

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxTokens, SUMMARY_MAX_TOKENS, "fallback chain must forward the summary budget");
  assert.ok(calls[0].messages[0].content.includes(SUMMARY_PROMPT_MARKER), "fallback chain must forward the summary instruction");
  assert.ok(response.sources, "sources must be present for a grounded summary reply");
  assert.ok(response.sources.length >= 1);
});

test("summary with citations disabled uses the no-citation summary prompt and persists no sources", async () => {
  const { tenant, user } = await seedTenantAdmin({ citationsEnabled: false });
  const retrieval = createStubRetrieval(tenant.id);
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", pageNumber: 1, text: "Evidence text.", sectionTitle: "Civic Ops" }),
  ]);
  const { adapter, calls } = createRecordingAdapter("Mock summary.", ["chunk-1"]);
  const service = new ChatService(retrieval.service, adapter);

  const response = await service.sendMessage(
    { message: "لخص ملف civic ops" },
    actorContext(tenant, user),
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].messages[0].content.includes(SUMMARY_PROMPT_MARKER));
  assert.ok(calls[0].messages[0].content.includes("Do not include any citations"), "no-citation summary prompt must be used");
  assert.equal(response.sources, undefined, "sources must be omitted when citations are disabled");

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  assert.deepEqual(assistantMessage.sources, [], "no sources may be persisted when citations are disabled");
});
