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
import DocumentModel from "../../db/models/document.model.js";
import KnowledgeGapModel from "../../db/models/knowledgeGap.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { ChatService } from "./chat.service.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import { setIntentQueryAdaptersForTests } from "../intent-query/intentQuery.factory.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { RetrievalCandidate, RetrievalQuery, RetrievalResult } from "../retrieval/retrieval.types.js";
import type { EvidenceBundle, EvidenceItem } from "../reranker/reranker.types.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";

const TEST_PASSWORD = "StrongPass123!";

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
          traceId: "chat-analytics-test",
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

async function seedTenantAdmin() {
  const tenant = await TenantModel.create({
    name: "Analytics Co",
    slug: "analytics-co",
    status: "active",
    plan: "free",
    settings: { aiRuntimePreferences: { maxTokens: 1024, citationsEnabled: true } },
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Analytics Admin",
    email: "analytics@admin.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

async function seedDocuments(tenantId: string, user: { id: string }, count: number) {
  const docs = Array.from({ length: count }, (_, i) =>
    DocumentModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      fileName: `doc-${i}.pdf`,
      originalFileName: `doc-${i}.pdf`,
      fileSize: 1024,
      mimeType: "application/pdf",
      storageKey: `tenant/${tenantId}/doc-${i}.pdf`,
      checksum: `checksum-${i}`,
      status: i % 2 === 0 ? "processed" : "failed",
      uploadedBy: new mongoose.Types.ObjectId(user.id),
    }),
  );
  return Promise.all(docs);
}

async function seedUserMessages(tenantId: string, entries: Array<{ content: string; count: number }>) {
  const conversation = await ConversationModel.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(),
    title: "seed",
  });
  const messages = entries.flatMap((entry, groupIndex) =>
    Array.from({ length: entry.count }, (_, i) =>
      MessageModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        conversationId: conversation._id,
        role: "user",
        content: entry.content,
        sequenceNumber: groupIndex + i,
      }),
    ),
  );
  await Promise.all(messages);
  return conversation;
}

function actorContext(tenant: { id: string }, user: { id: string; email: string }): OperationAuthorizationContext {
  return {
    tenantId: tenant.id,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: "COMPANY_ADMIN",
    traceId: "chat-analytics-trace",
    requestId: "chat-analytics-req",
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
    DocumentModel.deleteMany({}),
    KnowledgeGapModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    getRedisClient().flushdb().catch(() => {}),
  ]);
  setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });
});

test("document-count questions invoke analytics_query with real tenant data", async () => {
  const { tenant, user } = await seedTenantAdmin();
  await seedDocuments(tenant.id, user, 2);
  const retrieval = createStubRetrieval();
  const service = new ChatService(retrieval.service, new FakeModelAdapter());

  const response = await service.sendMessage(
    { message: "How many documents do we have?" },
    actorContext(tenant, user),
  );

  assert.match(response.answer, /2 uploaded documents/);
  assert.deepEqual(response.sources, []);
  assert.equal(retrieval.queries.length, 0, "analytics questions must skip RAG retrieval");
});

test("Arabic document-count questions use the analytics tool", async () => {
  const { tenant, user } = await seedTenantAdmin();
  await seedDocuments(tenant.id, user, 3);
  const retrieval = createStubRetrieval();
  const service = new ChatService(retrieval.service, new FakeModelAdapter());

  const response = await service.sendMessage(
    { message: "كم عدد المستندات؟" },
    actorContext(tenant, user),
  );

  assert.match(response.answer, /3 مستندات/);
  assert.equal(retrieval.queries.length, 0);
});

test("top-query questions invoke analytics_query and list the most frequent queries", async () => {
  const { tenant, user } = await seedTenantAdmin();
  await seedUserMessages(tenant.id, [
    { content: "How do I request annual leave?", count: 2 },
    { content: "What is the remote work policy?", count: 1 },
  ]);
  const retrieval = createStubRetrieval();
  const service = new ChatService(retrieval.service, new FakeModelAdapter());

  const response = await service.sendMessage(
    { message: "What are the most common queries this week?" },
    actorContext(tenant, user),
  );

  assert.ok(response.answer.includes("Most common queries (this week):"));
  assert.ok(
    response.answer.includes('"How do I request annual leave?" — 2 times'),
    "the most frequent seeded query must be listed first",
  );
  assert.equal(retrieval.queries.length, 0);
});

test("document-content questions (FAQs in a handbook) stay on the RAG path", async () => {
  const { tenant, user } = await seedTenantAdmin();
  const retrieval = createStubRetrieval();
  const service = new ChatService(retrieval.service, new FakeModelAdapter());

  const response = await service.sendMessage(
    { message: "What are the FAQs in the employee handbook?" },
    actorContext(tenant, user),
  );

  assert.equal(retrieval.queries.length, 1, "document-specific questions must reach retrieval");
  assert.equal(response.sources?.length ?? 0, 0);
});

test("analytics questions do not create a knowledge gap", async () => {
  const { tenant, user } = await seedTenantAdmin();
  await seedDocuments(tenant.id, user, 1);
  const retrieval = createStubRetrieval();
  const service = new ChatService(retrieval.service, new FakeModelAdapter());

  await service.sendMessage(
    { message: "How many documents are there?" },
    actorContext(tenant, user),
  );

  const gap = await KnowledgeGapModel.findOne({ tenantId: tenant.id }).lean().exec();
  assert.equal(gap, null, "analytics questions must not be recorded as knowledge gaps");
});
