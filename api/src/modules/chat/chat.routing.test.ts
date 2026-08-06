import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentModel from "../../db/models/document.model.js";
import MessageModel from "../../db/models/message.model.js";
import ConversationModel from "../../db/models/conversation.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { disconnectRedis } from "../../db/redis.js";

import { ChatService } from "./chat.service.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import { setIntentQueryAdaptersForTests } from "../intent-query/intentQuery.factory.js";
import type { ModelAdapter } from "../agents/agents.types.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { RetrievalCandidate, RetrievalQuery, RetrievalResult } from "../retrieval/retrieval.types.js";
import type { EvidenceBundle } from "../reranker/reranker.types.js";
import type { DocumentAccessAction } from "../document-access/documentAccess.actions.js";

let mongoServer: MongoMemoryReplSet | null = null;
const TEST_PASSWORD = "StrongPass123!";
const INSUFFICIENT_AUTHORIZED_EVIDENCE =
  "I don't have sufficient authorized evidence to answer that question.";

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "chat-routing-test" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "chat-routing-test" });
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
        traceId: "chat-routing-test",
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

// Returns a model adapter whose response is a valid QueryPlan JSON with
// the given overrides — drives the deterministic LLM routing path in chat.
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

async function createAuthorizedDoc(fileName: string): Promise<{ id: string; title: string }> {
  const normalizedName = "internal";
  const classificationDoc = await DocumentClassificationModel.create({
    tenantId,
    name: "Internal",
    normalizedName,
    level: "confidential" as const,
    description: "Internal classification",
    status: "active" as const,
    version: 1,
    createdBy: actorId,
    updatedBy: actorId,
  });

  const policyId = new Types.ObjectId();
  const now = new Date();
  const doc = await DocumentModel.create({
    tenantId,
    fileName,
    originalFileName: fileName,
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: `${tenantId}/${fileName}`,
    checksum: `cs-${fileName}`,
    status: "uploaded" as const,
    metadata: { title: `Title of ${fileName}`, description: null, tags: [] },
    classification: "internal" as const,
    version: 1,
    versionLabel: "v1",
    uploadedBy: actorId,
    owner: actorId,
    classificationId: classificationDoc._id,
    activePolicyId: policyId,
    activePolicyVersion: 1,
    policyChangedAt: now,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none" as const,
    scanResult: null,
    category: null,
    department: null,
    effectiveDate: null,
    expiryDate: null,
  });

  await DocumentAccessPolicyModel.create({
    tenantId,
    documentId: doc._id,
    policyId,
    policyVersion: 1,
    contractVersion: 1,
    status: "active",
    effectiveFrom: now,
    effectiveUntil: null,
    inherits: null,
    rules: [{
      ruleId: "test-owner-rule",
      effect: "allow",
      subject: { type: "owner" },
      actions: ["discover", "read", "download", "use_in_ai"] as DocumentAccessAction[],
    }],
    provenance: { createdBy: actorId, createdAt: now, reason: "Test fixture" },
    indexMetadata: {
      policyId,
      policyVersion: 1,
      classificationId: classificationDoc._id,
      categoryId: null,
      departmentId: null,
    },
    createdAt: now,
  });

  return { id: doc.id, title: `Title of ${fileName}` };
}

let retrieval: FakeRetrievalService;
let chatService: ChatService;

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await DocumentClassificationModel.deleteMany({});
  await DocumentAccessPolicyModel.deleteMany({});
  await MessageModel.deleteMany({});
  await ConversationModel.deleteMany({});

  const tenant = await TenantModel.create({
    name: "Chat Routing Corp",
    slug: "chat-routing-corp",
    status: "active",
    plan: "free",
  });
  tenantId = tenant.id;

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Chat Admin",
    email: "admin@chat-routing.com",
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
    traceId: "chat-routing-trace",
    requestId: "chat-routing-req",
  };

  // Reset the shared IntentQueryService singleton to deterministic defaults.
  setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });

  retrieval = new FakeRetrievalService();
  chatService = new ChatService(retrieval, new FakeModelAdapter());
});

test("ChatService - social route bypasses retrieval and persists no sources", async (t) => {
  await t.test("Arabic social message returns a source-less social reply", async () => {
    const response = await chatService.sendMessage(
      { message: "شكراً جزيلاً" },
      chatContext,
    );

    assert.equal(response.answer, "على الرحب والسعة! يسعدني مساعدتك.");
    assert.deepEqual(response.sources, []);
    assert.equal(retrieval.calls.length, 0, "retrieval must not be invoked for social");
  });

  await t.test("English social message returns an English social reply", async () => {
    const response = await chatService.sendMessage(
      { message: "thank you" },
      chatContext,
    );

    assert.equal(response.answer, "You're welcome! Happy to help.");
    assert.deepEqual(response.sources, []);
    assert.equal(retrieval.calls.length, 0);
  });

  await t.test("social reply is persisted without sources", async () => {
    await chatService.sendMessage({ message: "شكراً جزيلاً" }, chatContext);

    const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
    assert.ok(assistantMessage);
    assert.equal(assistantMessage.content, "على الرحب والسعة! يسعدني مساعدتك.");
    assert.deepEqual(assistantMessage.sources, []);
  });

await t.test("social subtypes get distinct localized replies and never retrieve", async () => {
     const cases: Array<[string, string]> = [
       ["مع السلامة", "مع السلامة! أتمنى لك يوماً سعيداً."],
       ["تمام", "تمام، أنا جاهز لمساعدتك."],
       ["كيف حالك؟", "أنا بخير، شكراً لسؤالك! كيف يمكنني مساعدتك؟"],
       ["hello", "Hello! How can I help you today?"],
       ["goodbye", "Goodbye! Have a great day."],
     ];
     for (const [message, expected] of cases) {
       const response = await chatService.sendMessage({ message }, chatContext);
       assert.equal(response.answer, expected, `reply for "${message}"`);
       assert.deepEqual(response.sources, []);
     }
     assert.equal(
       retrieval.calls.length,
       0,
       "no social subtype may trigger retrieval",
     );
   });

  await t.test("ChatService - unsupported external-current questions route to unsupported and do not retrieve", async () => {
    const response = await chatService.sendMessage({ message: "ما هو سعر الذهب اليوم؟" }, chatContext);
    assert.ok(response.answer.includes("خارج نطاق") || response.answer.includes("This question is outside"), "should return an unsupported localized reply");
    assert.deepEqual(response.sources, []);
    assert.equal(retrieval.calls.length, 0, "retrieval must not be invoked for unsupported external-current questions");
  });

   await t.test("question-mark social messages route to social wellbeing", async () => {
     const cases: Array<[string, string]> = [
       ["هل أنت بخير؟", "أنا بخير، شكراً لسؤالك! كيف يمكنني مساعدتك؟"],
       ["How are you?", "I'm doing well, thanks for asking! How can I help you?"],
       ["Are you okay?", "I'm doing well, thanks for asking! How can I help you?"],
     ];
     for (const [message, expected] of cases) {
       const response = await chatService.sendMessage({ message }, chatContext);
       assert.equal(response.answer, expected, `reply for "${message}"`);
       assert.deepEqual(response.sources, []);
       assert.equal(retrieval.calls.length, 0, `retrieval must not be invoked for social: "${message}"`);
     }
   });

   await t.test("question mark alone does not determine the route", async () => {
     const response = await chatService.sendMessage(
       { message: "?" },
       chatContext,
     );
     assert.notEqual(response.answer, "أنا بخير، شكراً لسؤالك! كيف يمكنني مساعدتك؟");
   });

  await t.test("social stays social after a prior RAG conversation turn", async () => {
    setIntentQueryAdaptersForTests({
      modelAdapter: planAdapter({
        detectedIntent: "knowledge_question",
        semanticQueries: [{ text: "what is the leave policy", language: "en", weight: 1 }],
      }),
    });
    retrieval.candidates = [];
    const first = await chatService.sendMessage(
      { message: "what is the leave policy" },
      chatContext,
    );
    assert.equal(retrieval.calls.length, 1);
    assert.deepEqual(first.sources, []);

    setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });
    const second = await chatService.sendMessage(
      { message: "شكراً جزيلاً", conversationId: first.conversationId },
      chatContext,
    );

assert.deepEqual(second.sources, []);
     assert.equal(retrieval.calls.length, 1, "social turn must not trigger retrieval");
   });

   await t.test("substantive questions with question marks remain RAG, not social", async () => {
     setIntentQueryAdaptersForTests({
       modelAdapter: planAdapter({
         detectedIntent: "knowledge_question",
         semanticQueries: [{ text: "what is the leave policy", language: "en", weight: 1 }],
       }),
     });
     retrieval.candidates = [];

     const cases = [
       "شكراً، ما هي سياسة الإجازات؟",
       "كيف أطلب إجازة؟",
       "Hello, what is the remote work policy?",
     ];
     for (const message of cases) {
       retrieval.calls = [];
       const response = await chatService.sendMessage({ message }, chatContext);
       assert.notEqual(response.answer, "على الرحب والسعة! يسعدني مساعدتك.");
       assert.notEqual(response.answer, "أنا بخير، شكراً لسؤالك! كيف يمكنني مساعدتك؟");
     }
   });
});

test("ChatService - clarification route returns a source-less clarification", async () => {
  setIntentQueryAdaptersForTests({
    modelAdapter: planAdapter({
      detectedIntent: "knowledge_question",
      clarificationNeeded: true,
      clarification: {
        reason: "ambiguous_intent",
        suggestedQuestions: ["Which policy?"],
        messageEn: "Please clarify your vacation question?",
        messageAr: "هل يمكنك توضيح سؤالك عن الإجازات؟",
      },
    }),
  });

  const response = await chatService.sendMessage(
    { message: "What about the policy?" },
    chatContext,
  );

  assert.equal(response.answer, "Please clarify your vacation question?");
  assert.deepEqual(response.sources, []);
  assert.equal(retrieval.calls.length, 0, "clarification must not trigger retrieval");
});

test("ChatService - unsupported route returns a polite refusal without retrieval", async () => {
  setIntentQueryAdaptersForTests({
    modelAdapter: planAdapter({
      detectedIntent: "unsupported",
      semanticQueries: [],
    }),
  });

  const response = await chatService.sendMessage(
    { message: "What is the capital of France?" },
    chatContext,
  );

  assert.equal(
    response.answer,
    "This question is outside the scope of company documents. I can help with questions about company policies and documents.",
  );
  assert.deepEqual(response.sources, []);
  assert.equal(retrieval.calls.length, 0);
});

test("ChatService - deterministic fallback never hijacks the message into clarification", async () => {
  setIntentQueryAdaptersForTests({
    modelAdapter: {
      providerKey: "failing-provider",
      async complete() {
        throw new Error("Provider Offline");
      },
    },
  });

  const response = await chatService.sendMessage(
    { message: "What is the leave policy?" },
    chatContext,
  );

  assert.equal(response.answer, INSUFFICIENT_AUTHORIZED_EVIDENCE);
  assert.deepEqual(response.sources, []);
  assert.equal(retrieval.calls.length, 1, "fallback must fall through to RAG, not clarify");
});

test("ChatService - evidence gate returns a refusal when no candidates survive", async () => {
  retrieval.candidates = [];
  const response = await chatService.sendMessage(
    { message: "What is the remote work policy?" },
    chatContext,
  );

  assert.equal(response.answer, INSUFFICIENT_AUTHORIZED_EVIDENCE);
  assert.deepEqual(response.sources, []);
  assert.equal(retrieval.calls.length, 1);
});

test("ChatService - grounded RAG regression keeps citations for authorized evidence", async () => {
  const { id: documentId } = await createAuthorizedDoc("handbook.pdf");
  retrieval.candidates = [
    {
      chunkId: "chunk-1",
      documentId,
      documentVersionId: "64a000000000000000000ff",
      tenantId,
      text: "Remote work is allowed twice a week.",
      score: 0.9,
      pageNumber: 2,
      sectionTitle: "Remote Work",
      retrievalMethod: "hybrid",
    },
  ];
  retrieval.evidenceBundle = {
    items: [
      {
        rank: 1,
        candidate: retrieval.candidates[0]!,
        scoreBreakdown: {
          fusionScore: 0.9,
          rerankScore: 0.85,
          semanticScore: 0.9,
          exactTermScore: 0,
          sourceAuthorityScore: 0,
          versionPreferenceScore: 0,
          totalScore: 0.88,
        },
        citationAnchor: {
          chunkId: "chunk-1",
          documentId,
          documentVersionId: "64a000000000000000000ff",
          pageNumber: 2,
        },
        textExcerpt: "Remote work is allowed twice a week.",
      },
    ],
    totalTokenCount: 0,
    maxTokenCount: 4000,
    inputCandidateCount: 1,
    conflictGroups: [],
    sufficiency: { level: "SUFFICIENT", reasons: ["test"] },
    scoreExplanation: "test",
    accessPolicyVersion: "1",
    createdAt: new Date().toISOString(),
  };

  const response = await chatService.sendMessage(
    { message: "How often can I work remotely?" },
    chatContext,
  );

  assert.ok(response.answer.length > 0);
  assert.ok(response.sources, "sources must be present for a grounded RAG reply");
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].documentId, documentId);
  assert.equal(response.sources[0].documentTitle, "Title of handbook.pdf");
  assert.equal(response.sources[0].text, "Remote work is allowed twice a week.");

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).lean().exec();
  assert.ok(assistantMessage);
  assert.equal(assistantMessage.sources.length, 1);
  assert.equal(assistantMessage.sources[0].documentId, documentId);
});

test("ChatService - router-resolved document hints are passed as retrieval filter", async () => {
  const { id: documentId } = await createAuthorizedDoc("policy.pdf");
  setIntentQueryAdaptersForTests({
    modelAdapter: planAdapter({
      detectedIntent: "document_specific",
      semanticQueries: [{ text: "what does policy.pdf say", language: "en", weight: 1 }],
      referencedDocumentIds: [documentId],
      referencedDocumentTitles: [],
    }),
  });
retrieval.candidates = [
    {
      chunkId: "chunk-2",
      documentId,
      documentVersionId: "64a000000000000000000ff",
      tenantId,
      text: "Policy content.",
      score: 0.8,
      pageNumber: 1,
      retrievalMethod: "hybrid",
    },
  ];
  retrieval.evidenceBundle = {
    items: [
      {
        rank: 1,
        candidate: retrieval.candidates[0]!,
        scoreBreakdown: {
          fusionScore: 0.8,
          rerankScore: 0.75,
          semanticScore: 0.8,
          exactTermScore: 0,
          sourceAuthorityScore: 0,
          versionPreferenceScore: 0,
          totalScore: 0.77,
        },
        citationAnchor: {
          chunkId: "chunk-2",
          documentId,
          documentVersionId: "64a000000000000000000ff",
          pageNumber: 1,
        },
        textExcerpt: "Policy content.",
      },
    ],
    totalTokenCount: 0,
    maxTokenCount: 4000,
    inputCandidateCount: 1,
    conflictGroups: [],
    sufficiency: { level: "SUFFICIENT", reasons: ["test"] },
    scoreExplanation: "test",
    accessPolicyVersion: "1",
    createdAt: new Date().toISOString(),
  };

  await chatService.sendMessage(
    { message: "what does policy.pdf say" },
    chatContext,
  );

  assert.equal(retrieval.calls.length, 1);
  assert.deepEqual(retrieval.calls[0].filter, { documentIds: [documentId] });
  assert.equal(retrieval.calls[0].queryText, "what does policy.pdf say");
});

test("ChatService - true end-to-end title hint resolves to verified document ID and constrains retrieval", async () => {
  const { id: documentId } = await createAuthorizedDoc("employee-handbook.pdf");
  await DocumentModel.updateOne(
    { _id: documentId },
    { $set: { "metadata.title": "Employee Handbook" } },
  );

  setIntentQueryAdaptersForTests({
    modelAdapter: {
      providerKey: "title-hint-adapter",
      async complete() {
        const plan = {
          schemaVersion: "1.0.0",
          normalizedQuestion: "لخص ملف Employee Handbook",
          originalQuestion: "لخص ملف Employee Handbook",
          language: "en",
          detectedIntent: "document_specific",
          intentConfidence: 0.95,
          entities: [],
          temporalConstraints: [],
          referencedDocumentIds: [],
          referencedDocumentTitles: ["Employee Handbook"],
          departments: [],
          categories: [],
          exactTerms: [],
          semanticQueries: [{ text: "summarize Employee Handbook", language: "en", weight: 1 }],
          keywordQueries: [],
          clarificationNeeded: false,
          clarification: null,
          isFollowUp: false,
          conversationContextUsed: false,
          promptVersion: "1.0.0",
          modelVersion: "title-hint-adapter",
          processingMetadata: {
            tokensUsed: 10,
            latencyMs: 1,
            estimatedCost: 0,
            fallbackUsed: false,
          },
        };
        const text = JSON.stringify(plan);
        return {
          id: "title-hint-1",
          provider: "title-hint-adapter",
          model: "title-hint-adapter",
          choices: [{ index: 0, message: { role: "assistant", content: text }, finishReason: "stop" }],
          usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
          latencyMs: 1,
          estimatedCost: 0,
        } as Awaited<ReturnType<ModelAdapter["complete"]>>;
      },
    },
  });

  retrieval.candidates = [
    {
      chunkId: "title-hint-chunk-1",
      documentId,
      documentVersionId: "64a00000000000000000ff",
      tenantId,
      text: "Remote work is allowed twice a week.",
      score: 0.9,
      pageNumber: 2,
      sectionTitle: "Remote Work",
      retrievalMethod: "hybrid",
    },
  ];
  retrieval.evidenceBundle = {
    items: [
      {
        rank: 1,
        candidate: retrieval.candidates[0]!,
        scoreBreakdown: {
          fusionScore: 0.9,
          rerankScore: 0.85,
          semanticScore: 0.9,
          exactTermScore: 0,
          sourceAuthorityScore: 0,
          versionPreferenceScore: 0,
          totalScore: 0.88,
        },
        citationAnchor: {
          chunkId: "title-hint-chunk-1",
          documentId,
          documentVersionId: "64a00000000000000000ff",
          pageNumber: 2,
        },
        textExcerpt: "Remote work is allowed twice a week.",
      },
    ],
    totalTokenCount: 0,
    maxTokenCount: 4000,
    inputCandidateCount: 1,
    conflictGroups: [],
    sufficiency: { level: "SUFFICIENT", reasons: ["test"] },
    scoreExplanation: "test",
    accessPolicyVersion: "1",
    createdAt: new Date().toISOString(),
  };

  const response = await chatService.sendMessage(
    { message: "لخص ملف Employee Handbook" },
    chatContext,
  );

  assert.ok(response.answer.length > 0);
  assert.ok(response.sources, "sources must be present for a grounded RAG reply");
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].documentId, documentId);
  assert.equal(retrieval.calls.length, 1);
  assert.deepEqual(retrieval.calls[0].filter, { documentIds: [documentId] });

  setIntentQueryAdaptersForTests({ modelAdapter: new FakeModelAdapter() });
});
