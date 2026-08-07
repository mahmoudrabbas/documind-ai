import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";

import { connectDB, disconnectDB } from "../../db/connection.js";
import { connectRedis, disconnectRedis, getRedisClient } from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import ConversationModel from "../../db/models/conversation.model.js";
import MessageModel from "../../db/models/message.model.js";
import KnowledgeGapModel from "../../db/models/knowledgeGap.model.js";
import GapOccurrenceModel from "../../db/models/gapOccurrence.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { ChatService } from "./chat.service.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import { FeedbackService } from "../feedback/feedback.service.js";
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
          traceId: "chat-knowledge-gaps-test",
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
  return { service, queries, setCandidates(c) { candidates = c; } };
}

async function seedTenantAdmin() {
  const tenant = await TenantModel.create({
    name: "Gap Co",
    slug: "gap-co",
    status: "active",
    plan: "free",
    settings: { aiRuntimePreferences: { maxTokens: 1024, citationsEnabled: true } },
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Gap Admin",
    email: "gap@admin.com",
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
    traceId: "chat-knowledge-gaps-trace",
    requestId: "chat-knowledge-gaps-req",
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
    KnowledgeGapModel.deleteMany({}),
    GapOccurrenceModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    getRedisClient().flushdb().catch(() => {}),
  ]);
  setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });
});

test("no-evidence answers create an implicit unanswered knowledge gap", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  const service = new ChatService(retrieval.service, createRecordingAdapter("unused"));

  const response = await service.sendMessage(
    { message: "What is the pet adoption allowance for remote contractors?" },
    actorContext(tenant, user),
  );

  assert.equal(response.sources?.length ?? 0, 0);

  const gap = await KnowledgeGapModel.findOne({ tenantId: tenant.id }).lean().exec();
  assert.ok(gap, "an implicit knowledge gap must be created when no evidence is found");
  assert.equal(gap.representativeQuestion, "What is the pet adoption allowance for remote contractors?");
  assert.equal(gap.source, "refusal");
  assert.equal(gap.sourceMetadata?.outcome, "refused");
  assert.equal(String(gap.tenantId), tenant.id);

  const occurrence = await GapOccurrenceModel.findOne({ gapId: gap._id }).lean().exec();
  assert.ok(occurrence, "the gap occurrence must be recorded");
  assert.equal(String(occurrence.conversationId), response.conversationId);
  assert.equal(String(occurrence.messageId), response.messageId);
  assert.equal(String(occurrence.actorId), user.id);
});

test("generator insufficient_evidence decisions create an implicit knowledge gap", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Unrelated evidence text." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("I could not find the answer.", [], "insufficient_evidence"),
  );

  await service.sendMessage(
    { message: "How many vacation days accrue for part-time staff?" },
    actorContext(tenant, user),
  );

  const gap = await KnowledgeGapModel.findOne({ tenantId: tenant.id }).lean().exec();
  assert.ok(gap, "a knowledge gap must be created when the generator reports insufficient evidence");
  assert.equal(gap.representativeQuestion, "How many vacation days accrue for part-time staff?");
  assert.equal(gap.source, "refusal");
});

test("clarification decisions do not create a knowledge gap", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Evidence text." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("Could you clarify?", [], "clarification"),
  );

  await service.sendMessage(
    { message: "Tell me about the policy" },
    actorContext(tenant, user),
  );

  const gap = await KnowledgeGapModel.findOne({ tenantId: tenant.id }).lean().exec();
  assert.equal(gap, null, "clarification requests are not knowledge gaps");
});

test("thumbs-down feedback creates a negative_feedback gap (existing wiring)", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const feedbackService = new FeedbackService();

  await feedbackService.submitFeedback(tenant.id, user.id, {
    messageId: new mongoose.Types.ObjectId().toString(),
    conversationId: new mongoose.Types.ObjectId().toString(),
    rating: "thumbs_down",
    category: "inaccurate",
  });

  const gap = await KnowledgeGapModel.findOne({ tenantId: tenant.id }).lean().exec();
  assert.ok(gap, "a gap must be created from thumbs-down feedback");
  assert.equal(gap.source, "negative_feedback");
  assert.equal(gap.sourceMetadata?.outcome, "negative_feedback");
});

test("malformed generator output downgraded to insufficient_evidence creates a knowledge gap", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Unrelated evidence text." }),
  ]);
  const malformedAdapter: ModelAdapter = {
    providerKey: "malformed",
    async complete(_params) {
      return {
        id: "malformed-1",
        provider: "malformed",
        model: "malformed-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "This is not valid JSON at all." },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: 0, completionTokens: 8, totalTokens: 8 },
        latencyMs: 1,
        estimatedCost: 0,
      };
    },
  };
  const service = new ChatService(retrieval.service, malformedAdapter);

  await service.sendMessage(
    { message: "What is the travel reimbursement limit?" },
    actorContext(tenant, user),
  );

  const gap = await KnowledgeGapModel.findOne({ tenantId: tenant.id }).lean().exec();
  assert.ok(gap, "a knowledge gap must be created when generator output is malformed");
  assert.equal(gap.representativeQuestion, "What is the travel reimbursement limit?");
  assert.equal(gap.source, "refusal");
});

test("grounded decision without citations downgraded to insufficient_evidence creates a knowledge gap", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Unrelated evidence text." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("Here is the answer.", [], "grounded_answer"),
  );

  await service.sendMessage(
    { message: "What is the notice period for resignations?" },
    actorContext(tenant, user),
  );

  const gap = await KnowledgeGapModel.findOne({ tenantId: tenant.id }).lean().exec();
  assert.ok(gap, "a knowledge gap must be created when a grounded decision has no citations");
  assert.equal(gap.representativeQuestion, "What is the notice period for resignations?");
  assert.equal(gap.source, "refusal");
});

test("grounded answers do not create a knowledge gap", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  retrieval.setCandidates([
    makeCandidate({ chunkId: "chunk-1", text: "Remote work is allowed twice a week." }),
  ]);
  const service = new ChatService(
    retrieval.service,
    createRecordingAdapter("Remote work is allowed twice a week.", ["chunk-1"], "grounded_answer"),
  );

  await service.sendMessage(
    { message: "How often can employees work remotely?" },
    actorContext(tenant, user),
  );

  const gap = await KnowledgeGapModel.findOne({ tenantId: tenant.id }).lean().exec();
  assert.equal(gap, null, "grounded answers must not create a knowledge gap");
});
