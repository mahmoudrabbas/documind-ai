import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AppError } from "../../../common/errors/AppError.js";
import { disconnectRedis } from "../../../db/redis.js";
import AgentRunModel from "../../../db/models/agentRun.model.js";
import AgentStepModel from "../../../db/models/agentStep.model.js";
import AgentToolCallModel from "../../../db/models/agentToolCall.model.js";
import ConversationModel from "../../../db/models/conversation.model.js";
import DocumentModel from "../../../db/models/document.model.js";
import DocumentAccessPolicyModel from "../../../db/models/documentAccessPolicy.model.js";
import DocumentChunkModel from "../../../db/models/documentChunk.model.js";
import DocumentClassificationModel from "../../../db/models/documentClassification.model.js";
import IntentQueryTraceModel from "../../../db/models/intentQueryTrace.model.js";
import MessageModel from "../../../db/models/message.model.js";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import {
  FakeEmbeddingAdapter,
  FakeModelAdapter,
} from "../../../providers/llm/fakeAdapters.js";
import { FakeKeywordAdapter } from "../../../providers/embedding/fakeKeywordAdapter.js";
import { FakeVectorStoreAdapter } from "../../../providers/embedding/fakeVectorStoreAdapter.js";
import { getDocumentAccessAuthorizationService } from "../../document-access/documentAccess.authorization.service.js";
import { FakeConversationContextAdapter } from "../../intent-query/adapters/conversationContext.fakeAdapter.js";
import { MongoConversationContextAdapter } from "../../intent-query/adapters/conversationContext.mongoAdapter.js";
import { resolveAuthorizedDocumentHints } from "../../intent-query/intentQuery.documentHints.js";
import { IntentQueryService } from "../../intent-query/intentQuery.service.js";
import { FakeRerankerAdapter } from "../../reranker/fakeReranker.adapter.js";
import { createRerankerService } from "../../reranker/reranker.service.js";
import {
  compileAccessFilters,
  compileQueryFilters,
  mergeFilters,
} from "../../retrieval/filterCompiler.js";
import { FusionEngine } from "../../retrieval/fusionEngine.js";
import { createRetrievalRepository } from "../../retrieval/retrieval.repository.js";
import { createRetrievalService } from "../../retrieval/retrieval.service.js";
import {
  createDefaultLoadChunksByIds,
  createDefaultLoadEligibleDocumentIds,
  type AuthorizedRetrievalDependencies,
} from "../../agents/tools/authorizedRetrievalTools.js";
import { MongoSupervisorPersistence } from "../../agents/supervisorPersistence.js";
import { createProductionChatWorkflowService } from "../chatWorkflowService.js";

const QUESTION = "What is the remote work policy?";
const COMPLIANCE_APPROVED_ANSWER = "Simulated grounded answer.";
const TURN_ONE_QUESTION =
  "How many remote days are allowed in the Remote Work Policy document?";
const TURN_TWO_QUESTION =
  "What is the meal reimbursement limit in the Expense Policy document?";
const TURN_ONE_ANSWER = "Employees may work remotely three days each week.";
const TURN_TWO_ANSWER = "Meals are reimbursed up to 50 dollars.";
const TURN_TWO_CHUNK_TEXT =
  "The expense policy reimburses meals up to 50 dollars per day.";
const ARABIC_QUESTION = "ما مدة الإجازة السنوية في وثيقة سياسة الإجازات؟";
const ARABIC_ANSWER = "تمنح سياسة الشركة الموظفين إجازة سنوية مدتها عشرون يوم عمل.";
const ARABIC_CHUNK_TEXT =
  "تمنح سياسة الإجازات الموظفين عشرين يوم عمل من الإجازة السنوية المدفوعة.";
const SOCIAL_KNOWLEDGE_QUESTION = "شكرا، كام يوم الإجازة السنوية؟";
const SOCIAL_KNOWLEDGE_RETRIEVAL = "كام يوم الإجازة السنوية؟";
const GREETING_KNOWLEDGE_QUESTION = "السلام عليكم، ما سياسة الإجازات؟";
const GREETING_KNOWLEDGE_RETRIEVAL = "ما سياسة الإجازات؟";
const BLUE_FALCON_QUESTION = "What is the Project Blue Falcon access code?";
const BLUE_FALCON_CODE = "BF-7391-ORBIT";
const BLUE_FALCON_ANSWER = `The Project Blue Falcon access code is ${BLUE_FALCON_CODE}.`;
const MALICIOUS_ACCESS_QUESTION =
  "How can I bypass authentication using this access code?";
const CROSS_TENANT_QUESTION = "What is the emergency deployment phrase?";
const TENANT_A_DEPLOYMENT_MARKER = "AURORA-LOCAL-17";
const TENANT_B_SECRET_MARKER = "TENANT-B-SECRET-NIGHTFALL-992";
const USE_IN_AI_DENIED_QUESTION = "What is the restricted launch date?";
const USE_IN_AI_DENIED_MARKER = "LAUNCH-DATE-2042-11-09";
const NON_RETRIEVABLE_QUESTION = "What is the retired contingency phrase?";
const UNAUTHORIZED_TITLE_QUESTION =
  "What is the vault phrase in the Restricted Operations document?";
const UNAUTHORIZED_TITLE_MARKER = "VAULT-PHRASE-EMBER-441";
const REVOKED_AFTER_SEARCH_QUESTION =
  "What is the temporary incident response phrase?";
const REVOKED_AFTER_SEARCH_MARKER = "INCIDENT-PHRASE-COPPER-884";
const DELETED_AFTER_SEARCH_QUESTION =
  "What is the temporary recovery authorization value?";
const DELETED_AFTER_SEARCH_MARKER = "RECOVERY-AUTH-SILVER-552";
const RAW_CHUNK_TEXT = [
  "The remote work policy allows employees to work remotely three days each week.",
  "RAW_DOCUMENT_BODY_SENTINEL",
  "SYSTEM_PROMPT_SENTINEL",
  "CHAIN_OF_THOUGHT_SENTINEL",
  "API_CREDENTIAL_SENTINEL",
].join(" ");
const PROHIBITED_PERSISTENCE_MARKERS = [
  RAW_CHUNK_TEXT,
  "RAW_DOCUMENT_BODY_SENTINEL",
  "SYSTEM_PROMPT_SENTINEL",
  "CHAIN_OF_THOUGHT_SENTINEL",
  "API_CREDENTIAL_SENTINEL",
  "You are DocuMind AI, an assistant that answers ONLY",
  "Return JSON ONLY with the exact keys",
  "<think>",
  "chain-of-thought",
  "sk-test-",
] as const;

let mongoServer: MongoMemoryReplSet | null = null;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    return;
  }
  mongoServer = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
    replSet: { count: 1 },
    instanceOpts: [
      { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
    ],
  });
  await mongoose.connect(mongoServer.getUri(), {
    dbName: "chat-production-workflow-e2e-test",
  });
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    AgentToolCallModel.deleteMany({}),
    AgentStepModel.deleteMany({}),
    AgentRunModel.deleteMany({}),
    MessageModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    IntentQueryTraceModel.deleteMany({}),
    DocumentChunkModel.deleteMany({}),
    DocumentAccessPolicyModel.deleteMany({}),
    DocumentModel.deleteMany({}),
    DocumentClassificationModel.deleteMany({}),
    UserModel.deleteMany({}),
    TenantModel.deleteMany({}),
  ]);
});

interface SeededWorkflow {
  tenantId: string;
  actorId: string;
  conversationId: string;
  documentId: string;
  chunkId: string;
  documentVersionId: string;
  rogueDocumentId: string;
}

interface EvidenceFixture {
  tenantId: string;
  documentId: string;
  chunkId: string;
  documentVersionId: string;
  title: string;
  question: string;
  text: string;
}

interface RecordedModelCall {
  messages: Array<{ role: string; content: string }>;
  structuredOutput?: { type: "json_object" };
}

function isIntentClassificationRequest(
  params: Parameters<FakeModelAdapter["complete"]>[0],
): boolean {
  return params.messages.some(
    (message) =>
      message.role === "system" &&
      message.content.includes('"detectedIntent"') &&
      message.content.includes('"semanticQueries"'),
  );
}

function isSemanticCitationRequest(
  params: Parameters<FakeModelAdapter["complete"]>[0],
): boolean {
  return params.messages.some(
    (message) =>
      message.role === "system" &&
      message.content.includes("Judge whether each supplied factual claim is entailed"),
  );
}

class SemanticAwareFakeModelAdapter extends FakeModelAdapter {
  override async complete(
    params: Parameters<FakeModelAdapter["complete"]>[0],
  ): ReturnType<FakeModelAdapter["complete"]> {
    const response = await super.complete(params);
    if (!isSemanticCitationRequest(params)) return response;
    const payload = JSON.parse(params.messages.at(-1)?.content ?? "{}") as {
      claims?: unknown[];
    };
    return {
      ...response,
      choices: response.choices.map((choice, index) =>
        index === 0
          ? {
              ...choice,
              message: {
                ...choice.message,
                content: JSON.stringify({
                  judgments: (payload.claims ?? []).map((_claim, claimIndex) => ({
                    claimIndex,
                    verdict: "supported",
                  })),
                }),
              },
            }
          : choice,
      ),
    };
  }
}

class RecordingFakeModelAdapter extends SemanticAwareFakeModelAdapter {
  readonly calls: RecordedModelCall[] = [];

  constructor(private readonly answers: ReadonlyMap<string, string>) {
    super();
  }

  override async complete(
    params: Parameters<FakeModelAdapter["complete"]>[0],
  ): ReturnType<FakeModelAdapter["complete"]> {
    const isIntentClassification = isIntentClassificationRequest(params);
    const isSemanticCitation = isSemanticCitationRequest(params);
    this.calls.push({
      messages: params.messages.map((message) => ({ ...message })),
      ...(params.structuredOutput && !isIntentClassification && !isSemanticCitation
        ? { structuredOutput: params.structuredOutput }
        : {}),
    });
    const response = await super.complete(params);
    if (!params.structuredOutput) return response;
    if (isIntentClassification) return response;
    if (isSemanticCitation) return response;

    const question = [...params.messages]
      .reverse()
      .find((message) => message.role === "user")?.content ?? "";
    const answer = this.answers.get(question);
    if (!answer) return response;

    const combined = params.messages.map((message) => message.content).join("\n");
    const citedChunkIds = [
      ...combined.matchAll(/id:([^\s\]]+)/g),
    ].map((match) => match[1]);
    return {
      ...response,
      choices: response.choices.map((choice, index) =>
        index === 0
          ? {
              ...choice,
              message: {
                ...choice.message,
                content: JSON.stringify({
                  decision: "grounded_answer",
                  answer,
                  citedChunkIds: [...new Set(citedChunkIds)],
                }),
              },
            }
          : choice,
      ),
    };
  }
}

class IntentProviderFailureFakeModelAdapter extends SemanticAwareFakeModelAdapter {
  override async complete(
    params: Parameters<FakeModelAdapter["complete"]>[0],
  ): ReturnType<FakeModelAdapter["complete"]> {
    if (isIntentClassificationRequest(params)) {
      throw new Error("simulated intent provider failure");
    }
    return super.complete(params);
  }
}

async function seedWorkflowState(): Promise<SeededWorkflow> {
  const tenant = await TenantModel.create({
    name: "Production Workflow Corp",
    slug: "production-workflow-corp",
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant._id,
    name: "Workflow Admin",
    email: "workflow-admin@example.test",
    passwordHash: "not-used-by-this-e2e",
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  const classification = await DocumentClassificationModel.create({
    tenantId: tenant._id,
    name: "Internal",
    normalizedName: "internal",
    level: "confidential",
    description: "Production workflow fixture",
    status: "active",
    version: 1,
    createdBy: user._id,
    updatedBy: user._id,
  });

  const createDocument = async (fileName: string, withPolicy: boolean) => {
    const policyId = new Types.ObjectId();
    const now = new Date();
    const document = await DocumentModel.create({
      tenantId: tenant._id,
      fileName,
      originalFileName: fileName,
      fileSize: 1024,
      mimeType: "application/pdf",
      storageKey: `${tenant.id}/${fileName}`,
      checksum: `checksum-${fileName}`,
      status: "processed",
      metadata: {
        title: fileName === "remote-work.pdf" ? "Remote Work Policy" : "Unapproved Annex",
        description: null,
        tags: [],
      },
      classification: "internal",
      version: 1,
      versionLabel: "v1",
      uploadedBy: user._id,
      owner: user._id,
      classificationId: classification._id,
      activePolicyId: withPolicy ? policyId : null,
      activePolicyVersion: withPolicy ? 1 : null,
      policyChangedAt: now,
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      deletedAt: null,
      deletedBy: null,
      quarantineStatus: "none",
      scanResult: null,
      category: null,
      department: null,
      effectiveDate: null,
      expiryDate: null,
      searchStatus: "READY",
    });

    if (withPolicy) {
      await DocumentAccessPolicyModel.create({
        tenantId: tenant._id,
        documentId: document._id,
        policyId,
        policyVersion: 1,
        contractVersion: 1,
        status: "active",
        effectiveFrom: now,
        effectiveUntil: null,
        inherits: null,
        rules: [
          {
            ruleId: "workflow-owner-use-in-ai",
            effect: "allow",
            subject: { type: "owner" },
            actions: ["discover", "read", "use_in_ai"],
          },
        ],
        provenance: {
          createdBy: user._id,
          createdAt: now,
          reason: "Production workflow E2E fixture",
        },
        indexMetadata: {
          policyId,
          policyVersion: 1,
          classificationId: classification._id,
          categoryId: null,
          departmentId: null,
        },
        createdAt: now,
      });
    }
    return document;
  };

  const document = await createDocument("remote-work.pdf", true);
  const rogueDocument = await createDocument("unapproved-annex.pdf", false);
  const documentVersionId = new Types.ObjectId();
  const chunk = await DocumentChunkModel.create({
    tenantId: tenant._id,
    documentId: document._id,
    documentVersion: 1,
    documentVersionId,
    generationId: new Types.ObjectId(),
    chunkIndex: 0,
    sectionPath: ["Working arrangements"],
    pageStart: 3,
    pageEnd: 3,
    offsetStart: 0,
    offsetEnd: RAW_CHUNK_TEXT.length,
    contentType: "paragraph",
    language: "en",
    department: null,
    classification: "internal",
    accessPolicyVersion: "1",
    confidenceScore: 1,
    text: RAW_CHUNK_TEXT,
    checksum: "checksum-remote-work-chunk",
    tokenCount: Math.ceil(RAW_CHUNK_TEXT.length / 4),
    status: "ACTIVE",
    partIndex: null,
    partCount: null,
    vector: [],
    category: null,
    allowAiUse: true,
    pageNumber: 3,
    sectionTitle: "Working arrangements",
  });
  const conversation = await ConversationModel.create({
    tenantId: tenant._id,
    userId: user._id,
    title: "Remote work policy",
    lastMessageAt: new Date(),
    messageCount: 0,
  });

  return {
    tenantId: tenant.id,
    actorId: user.id,
    conversationId: conversation.id,
    documentId: document.id,
    chunkId: chunk.id,
    documentVersionId: documentVersionId.toString(),
    rogueDocumentId: rogueDocument.id,
  };
}

async function seedAdditionalAuthorizedEvidence(
  fixture: SeededWorkflow,
  input: {
    fileName: string;
    title: string;
    question: string;
    text: string;
    language?: "en" | "ar";
    sectionTitle: string;
    pageNumber: number;
    scope?: {
      tenantId: string;
      actorId: string;
      classificationId: Types.ObjectId;
    };
    policyActions?: Array<"discover" | "read" | "use_in_ai">;
    allowAiUse?: boolean;
    status?: "processed" | "failed";
    isArchived?: boolean;
    deletedAt?: Date | null;
  },
): Promise<EvidenceFixture> {
  const baseDocument = input.scope
    ? null
    : await DocumentModel.findById(fixture.documentId)
        .select("classificationId")
        .lean()
        .exec();
  const tenantId = input.scope?.tenantId ?? fixture.tenantId;
  const actorId = input.scope?.actorId ?? fixture.actorId;
  const classificationId =
    input.scope?.classificationId ?? baseDocument?.classificationId;
  assert.ok(classificationId);
  const policyId = new Types.ObjectId();
  const now = new Date();
  const documentVersionId = new Types.ObjectId();
  const document = await DocumentModel.create({
    tenantId,
    fileName: input.fileName,
    originalFileName: input.fileName,
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: `${tenantId}/${input.fileName}`,
    checksum: `checksum-${input.fileName}`,
    status: input.status ?? "processed",
    metadata: { title: input.title, description: null, tags: [] },
    classification: "internal",
    version: 1,
    versionLabel: "v1",
    uploadedBy: actorId,
    owner: actorId,
    classificationId,
    activePolicyId: policyId,
    activePolicyVersion: 1,
    policyChangedAt: now,
    isArchived: input.isArchived ?? false,
    archivedAt: input.isArchived ? now : null,
    archivedBy: null,
    deletedAt: input.deletedAt ?? null,
    deletedBy: null,
    quarantineStatus: "none",
    scanResult: null,
    category: null,
    department: null,
    effectiveDate: null,
    expiryDate: null,
    searchStatus: "READY",
  });
  await DocumentAccessPolicyModel.create({
    tenantId,
    documentId: document._id,
    policyId,
    policyVersion: 1,
    contractVersion: 1,
    status: "active",
    effectiveFrom: now,
    effectiveUntil: null,
    inherits: null,
    rules: [
      {
        ruleId: `owner-use-in-ai-${input.fileName}`,
        effect: "allow",
        subject: { type: "owner" },
        actions: input.policyActions ?? ["discover", "read", "use_in_ai"],
      },
    ],
    provenance: {
      createdBy: actorId,
      createdAt: now,
      reason: "Production workflow E2E fixture",
    },
    indexMetadata: {
      policyId,
      policyVersion: 1,
      classificationId,
      categoryId: null,
      departmentId: null,
    },
    createdAt: now,
  });
  const chunk = await DocumentChunkModel.create({
    tenantId,
    documentId: document._id,
    documentVersion: 1,
    documentVersionId,
    generationId: new Types.ObjectId(),
    chunkIndex: 0,
    sectionPath: [input.sectionTitle],
    pageStart: input.pageNumber,
    pageEnd: input.pageNumber,
    offsetStart: 0,
    offsetEnd: input.text.length,
    contentType: "paragraph",
    language: input.language ?? "en",
    department: null,
    classification: "internal",
    accessPolicyVersion: "1",
    confidenceScore: 1,
    text: input.text,
    checksum: `checksum-${input.fileName}-chunk`,
    tokenCount: Math.ceil(input.text.length / 4),
    status: "ACTIVE",
    partIndex: null,
    partCount: null,
    vector: [],
    category: null,
    allowAiUse: input.allowAiUse ?? true,
    pageNumber: input.pageNumber,
    sectionTitle: input.sectionTitle,
  });
  return {
    tenantId,
    documentId: document.id,
    chunkId: chunk.id,
    documentVersionId: documentVersionId.toString(),
    title: input.title,
    question: input.question,
    text: input.text,
  };
}

async function seedOtherTenantScope(): Promise<{
  tenantId: string;
  actorId: string;
  classificationId: Types.ObjectId;
}> {
  const tenant = await TenantModel.create({
    name: "Isolated Tenant B",
    slug: "isolated-tenant-b",
    status: "active",
    plan: "free",
  });
  const actor = await UserModel.create({
    tenantId: tenant._id,
    name: "Tenant B Admin",
    email: "tenant-b-admin@example.test",
    passwordHash: "not-used-by-this-e2e",
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  const classification = await DocumentClassificationModel.create({
    tenantId: tenant._id,
    name: "Internal",
    normalizedName: "internal",
    level: "confidential",
    description: "Cross-tenant isolation fixture",
    status: "active",
    version: 1,
    createdBy: actor._id,
    updatedBy: actor._id,
  });
  return {
    tenantId: tenant.id,
    actorId: actor.id,
    classificationId: classification._id,
  };
}

async function loadSupervisorGraph(requestId: string) {
  const run = await AgentRunModel.findOne({ requestId }).lean().exec();
  assert.ok(run);
  const steps = await AgentStepModel.find({ runId: run._id })
    .sort({ stepIndex: 1 })
    .lean()
    .exec();
  const toolCalls = await AgentToolCallModel.find({ runId: run._id })
    .sort({ createdAt: 1 })
    .lean()
    .exec();
  return { run, steps, toolCalls };
}

function assertValuesAbsent(value: unknown, forbidden: readonly string[]): void {
  const serialized = JSON.stringify(value);
  for (const marker of forbidden) {
    assert.equal(
      serialized.includes(marker),
      false,
      `unexpected protected value in serialized result: ${marker}`,
    );
  }
}

async function executeWithMutationAfterSearch<T>(
  execute: () => Promise<T>,
  mutate: () => Promise<void>,
): Promise<T> {
  const original = MongoSupervisorPersistence.prototype.completeToolCall;
  let mutationApplied = false;
  MongoSupervisorPersistence.prototype.completeToolCall = async (
    tenantId,
    toolCallId,
    patch,
  ) => {
    const completed = await original(tenantId, toolCallId, patch);
    if (
      !mutationApplied &&
      completed?.toolName === "authorized_hybrid_search" &&
      completed.status === "completed"
    ) {
      const candidates = completed.output?.candidates as unknown[] | undefined;
      assert.ok(candidates && candidates.length > 0);
      await mutate();
      mutationApplied = true;
    }
    return completed;
  };

  try {
    const result = await execute();
    assert.equal(mutationApplied, true);
    return result;
  } finally {
    MongoSupervisorPersistence.prototype.completeToolCall = original;
  }
}

async function revokeUseInAiGrant(
  fixture: SeededWorkflow,
  evidence: EvidenceFixture,
): Promise<void> {
  const document = await DocumentModel.findOne({
    _id: evidence.documentId,
    tenantId: fixture.tenantId,
  })
    .select("classificationId categoryId departmentId activePolicyId activePolicyVersion")
    .lean()
    .exec();
  assert.ok(document?.classificationId);
  const policyId = new Types.ObjectId();
  const now = new Date();
  await DocumentAccessPolicyModel.create({
    tenantId: fixture.tenantId,
    documentId: evidence.documentId,
    policyId,
    policyVersion: 1,
    contractVersion: 1,
    status: "active",
    effectiveFrom: now,
    effectiveUntil: null,
    inherits: null,
    rules: [
      {
        ruleId: "post-search-readable-without-ai",
        effect: "allow",
        subject: { type: "owner" },
        actions: ["discover", "read"],
      },
    ],
    provenance: {
      createdBy: fixture.actorId,
      createdAt: now,
      reason: "TOCTOU test revocation after controlled search",
    },
    indexMetadata: {
      policyId,
      policyVersion: 1,
      classificationId: document.classificationId,
      categoryId: document.categoryId ?? null,
      departmentId: document.departmentId ?? null,
    },
    createdAt: now,
  });
  const updated = await DocumentModel.updateOne(
    {
      _id: evidence.documentId,
      tenantId: fixture.tenantId,
      activePolicyId: document.activePolicyId,
      activePolicyVersion: document.activePolicyVersion,
    },
    {
      $set: {
        activePolicyId: policyId,
        activePolicyVersion: 1,
        policyChangedAt: now,
      },
    },
  ).exec();
  assert.equal(updated.modifiedCount, 1);
}

async function deleteDocumentAfterSearch(
  fixture: SeededWorkflow,
  evidence: EvidenceFixture,
): Promise<void> {
  const updated = await DocumentModel.updateOne(
    {
      _id: evidence.documentId,
      tenantId: fixture.tenantId,
      deletedAt: null,
    },
    {
      $set: {
        deletedAt: new Date(),
        deletedBy: new Types.ObjectId(fixture.actorId),
      },
    },
  ).exec();
  assert.equal(updated.modifiedCount, 1);
}

async function productionService(
  fixture: SeededWorkflow,
  options: {
    broadenAtMaterialization?: boolean;
    evidence?: readonly EvidenceFixture[];
    model?: FakeModelAdapter;
    useMongoHistory?: boolean;
  } = {},
) {
  const model = options.model ?? new SemanticAwareFakeModelAdapter();
  const embedding = new FakeEmbeddingAdapter();
  const vector = new FakeVectorStoreAdapter();
  const keyword = new FakeKeywordAdapter();
  const reranker = createRerankerService({ reranker: new FakeRerankerAdapter() });
  const authorization = getDocumentAccessAuthorizationService();
  const evidence = options.evidence ?? [
    {
      documentId: fixture.documentId,
      chunkId: fixture.chunkId,
      documentVersionId: fixture.documentVersionId,
      tenantId: fixture.tenantId,
      title: "Remote Work Policy",
      question: QUESTION,
      text: RAW_CHUNK_TEXT,
    },
  ];
  const vectors = await embedding.embed({
    inputs: evidence.map((item) => item.question),
  });
  await vector.storeChunks(
    evidence.map((item, index) => ({
      chunkId: item.chunkId,
      vector: vectors.vectors[index]!,
      metadata: {
        tenantId: item.tenantId,
        documentId: item.documentId,
        documentVersionId: item.documentVersionId,
        classification: "internal",
        allowAiUse: true,
      },
    })),
  );
  await keyword.indexChunks(
    evidence.map((item) => ({
      chunkId: item.chunkId,
      text: item.text,
      metadata: {
        tenantId: item.tenantId,
        documentId: item.documentId,
        documentVersionId: item.documentVersionId,
        classification: "internal",
        allowAiUse: true,
      },
    })),
  );

  const retrieval = createRetrievalService({
    vectorAdapter: vector,
    keywordAdapter: keyword,
    embeddingAdapter: embedding,
    fusionEngine: new FusionEngine(),
    filterCompiler: { compileAccessFilters, compileQueryFilters, mergeFilters },
    repository: createRetrievalRepository(),
    rerankerService: reranker,
    resolveAccessContext: async (context) => {
      const actor = await authorization.resolveActor({
        tenantId: context.tenantId,
        actorId: context.actorId,
      });
      return {
        ...context,
        baseRole: actor.baseRole,
        customRoleId: actor.customRoleId,
        departmentIds: [...(actor.departmentIds ?? [])],
        requiredAction: "use_in_ai",
      };
    },
    authorizeDocumentForAi: async (context, documentId) => {
      await authorization.authorizeDocumentAction(
        { tenantId: context.tenantId, actorId: context.actorId },
        documentId,
        "use_in_ai",
      );
    },
  });
  const defaultLoadChunks = createDefaultLoadChunksByIds();
  let loadChunksCall = 0;
  const loadChunksByIds: AuthorizedRetrievalDependencies["loadChunksByIds"] =
    async (tenantId, chunkIds) => {
      loadChunksCall += 1;
      const chunks = await defaultLoadChunks(tenantId, chunkIds);
      if (!options.broadenAtMaterialization || loadChunksCall !== 4) {
        return chunks;
      }
      return chunks.map((chunk) => ({
        ...chunk,
        documentId: fixture.rogueDocumentId,
      }));
    };
  const authorizedRetrieval: AuthorizedRetrievalDependencies = {
    retrieval,
    reranker,
    authorization,
    resolveDocumentHints: resolveAuthorizedDocumentHints,
    loadChunksByIds,
    loadEligibleDocumentIds: createDefaultLoadEligibleDocumentIds(),
  };
  const intentQueryService = new IntentQueryService(
    model,
    options.useMongoHistory
      ? new MongoConversationContextAdapter()
      : new FakeConversationContextAdapter(),
  );

  return createProductionChatWorkflowService({
    model,
    intentQueryService,
    authorizedRetrieval,
  });
}

function executionContext(fixture: SeededWorkflow, requestId: string) {
  return {
    tenantId: fixture.tenantId,
    actorId: fixture.actorId,
    actorEmail: "workflow-admin@example.test",
    actorRole: "COMPANY_ADMIN" as const,
    traceId: `trace-${requestId}`,
    requestId,
  };
}

function assertPersistenceSafety(records: unknown): void {
  const serialized = JSON.stringify(records);
  for (const marker of PROHIBITED_PERSISTENCE_MARKERS) {
    assert.equal(
      serialized.includes(marker),
      false,
      `persisted supervisor graph leaked prohibited marker: ${marker}`,
    );
  }
  assert.doesNotMatch(
    serialized,
    /"(?:password|authorization|apiKey|secret|systemPrompt|chainOfThought|hiddenReasoning)"\s*:/i,
  );
}

test(
  "production-composed grounded workflow persists one correlated runtime graph and the Compliance-authorized assistant message",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const requestId = "request-production-grounded";
    const traceId = `trace-${requestId}`;
    const service = await productionService(fixture);

    const response = await service.execute(
      { conversationId: fixture.conversationId, message: QUESTION },
      executionContext(fixture, requestId),
    );

    assert.equal(response.answer, COMPLIANCE_APPROVED_ANSWER);
    assert.deepEqual(
      response.sources?.map((source) => ({
        chunkId: source.chunkId,
        documentId: source.documentId,
      })),
      [{ chunkId: fixture.chunkId, documentId: fixture.documentId }],
    );
    assert.equal(response.sources?.[0]?.text, RAW_CHUNK_TEXT);

    const assistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
    })
      .lean()
      .exec();
    assert.ok(assistant);
    assert.equal(assistant.content, response.answer);
    assert.deepEqual(
      assistant.sources.map((source) => ({
        chunkId: source.chunkId,
        documentId: source.documentId,
        documentTitle: source.documentTitle,
        sectionTitle: source.sectionTitle,
        pageNumber: source.pageNumber,
        score: source.score,
      })),
      response.sources?.map((source) => ({
        chunkId: source.chunkId,
        documentId: source.documentId,
        documentTitle: source.documentTitle,
        sectionTitle: source.sectionTitle,
        pageNumber: source.pageNumber,
        score: source.score,
      })),
    );

    const runs = await AgentRunModel.find({ requestId }).lean().exec();
    assert.equal(runs.length, 1);
    const run = runs[0]!;
    const runId = run._id.toString();
    const steps = await AgentStepModel.find({ runId: run._id })
      .sort({ stepIndex: 1 })
      .lean()
      .exec();
    const toolCalls = await AgentToolCallModel.find({ runId: run._id })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    assert.equal(run.status, "completed");
    assert.equal(run.totalSteps, steps.length);
    assert.equal(run.totalToolCalls, toolCalls.length);
    assert.deepEqual(
      steps.map((step) => step.stepIndex),
      steps.map((_, index) => index),
    );
    assert.deepEqual(
      toolCalls.map((toolCall) => toolCall.toolName),
      ["authorized_hybrid_search", "evaluate_evidence"],
    );
    assert.deepEqual(
      steps
        .filter((step) => step.action === "execute")
        .map((step) => step.agentName),
      [
        "intent-query-agent",
        "answer-writer-agent",
        "citation-verification-agent",
        "compliance-agent",
      ],
    );
    const evidenceTool = toolCalls.find(
      (toolCall) => toolCall.toolName === "evaluate_evidence",
    );
    assert.deepEqual(evidenceTool?.output?.approvedEvidenceIds, [fixture.chunkId]);
    const complianceStep = steps.find(
      (step) =>
        step.agentName === "compliance-agent" && step.action === "execute",
    );
    assert.ok(complianceStep);
    assert.equal(complianceStep.output?.action, "release");
    assert.equal(complianceStep.output?.answer, response.answer);
    assert.deepEqual(complianceStep.output?.sourceIds, [fixture.chunkId]);
    assert.equal(run.output?.answer, complianceStep.output?.answer);
    assert.deepEqual(run.output?.sourceIds, complianceStep.output?.sourceIds);

    for (const record of [run, ...steps, ...toolCalls]) {
      assert.equal(record.tenantId.toString(), fixture.tenantId);
      assert.equal(record.traceId, traceId);
      assert.equal(record.requestId, requestId);
      if ("runId" in record) assert.equal(record.runId.toString(), runId);
    }
    for (const toolCall of toolCalls) {
      assert.ok(toolCall.stepId);
      assert.equal(
        steps.some((step) => step._id.equals(toolCall.stepId)),
        true,
      );
    }
    assertPersistenceSafety({ run, steps, toolCalls });
  },
);

test(
  "production-composed workflow refuses a numerically contradicted claim despite a valid citation id",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const contradictedAnswer = "Employees may work remotely 30 days each week.";
    const model = new RecordingFakeModelAdapter(
      new Map([[QUESTION, contradictedAnswer]]),
    );
    const service = await productionService(fixture, { model });
    const response = await service.execute(
      { conversationId: fixture.conversationId, message: QUESTION },
      executionContext(fixture, "request-semantic-contradiction"),
    );

    assert.notEqual(response.answer, contradictedAnswer);
    assert.deepEqual(response.sources, []);
    const verifierStep = await AgentStepModel.findOne({
      requestId: "request-semantic-contradiction",
      agentName: "citation-verification-agent",
      action: "execute",
    }).lean().exec();
    assert.equal(verifierStep?.output?.verified, false);
    assert.equal(verifierStep?.output?.reasonCode, "UNSUPPORTED_CLAIMS");
    assert.deepEqual(verifierStep?.output?.validatedCitationIds, [fixture.chunkId]);
  },
);

test(
  "production-composed workflow keeps varied social-only and unsupported input out of retrieval with empty sources",
  { timeout: 90_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const service = await productionService(fixture);
    const cases = [
      { message: "شجرا", route: "social" },
      { message: "شكررا", route: "social" },
      { message: "شكرن", route: "social" },
      { message: "شكراااا", route: "social" },
      { message: "تسلممم", route: "social" },
      { message: "شكرا يا قائد", route: "social" },
      { message: "ألف شكر يا معلم", route: "social" },
      { message: "تمام", route: "social" },
      { message: "ماشي", route: "social" },
      { message: "اشطا", route: "social" },
      { message: "تسلم", route: "social" },
      { message: "thanks", route: "social" },
      { message: "thx", route: "social" },
      { message: "tnx", route: "social" },
      { message: "thanx", route: "social" },
      { message: "thanks يا قائد", route: "social" },
      { message: "شكرا bro", route: "social" },
      { message: "❤️", route: "social" },
      { message: "👍", route: "social" },
      { message: "🙏", route: "social" },
      { message: "asdasd", route: "unsupported" },
      { message: "What is the capital of France?", route: "unsupported" },
    ] as const;

    for (const [index, item] of cases.entries()) {
      const requestId = `request-terminal-intent-${index}`;
      const response = await service.execute(
        { conversationId: fixture.conversationId, message: item.message },
        executionContext(fixture, requestId),
      );
      const graph = await loadSupervisorGraph(requestId);
      const intentStep = graph.steps.find(
        (step) =>
          step.agentName === "intent-query-agent" && step.action === "execute",
      );

      assert.equal(intentStep?.output?.route, item.route, item.message);
      assert.deepEqual(response.sources, [], item.message);
      assert.deepEqual(graph.toolCalls, [], item.message);
    }
  },
);

test(
  "production-composed workflow positively routes social-prefixed knowledge questions to grounded retrieval",
  { timeout: 90_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const evidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "leave-policy-ar.pdf",
      title: "سياسة الإجازات",
      question: SOCIAL_KNOWLEDGE_RETRIEVAL,
      text: ARABIC_CHUNK_TEXT,
      sectionTitle: "الإجازة السنوية",
      pageNumber: 3,
      language: "ar",
    });
    const model = new RecordingFakeModelAdapter(
      new Map([
        [SOCIAL_KNOWLEDGE_RETRIEVAL, ARABIC_ANSWER],
        [GREETING_KNOWLEDGE_RETRIEVAL, ARABIC_ANSWER],
      ]),
    );
    const service = await productionService(fixture, {
      evidence: [evidence],
      model,
    });

    for (const [index, message] of [
      SOCIAL_KNOWLEDGE_QUESTION,
      GREETING_KNOWLEDGE_QUESTION,
    ].entries()) {
      const requestId = `request-social-knowledge-${index}`;
      const response = await service.execute(
        { conversationId: fixture.conversationId, message },
        executionContext(fixture, requestId),
      );
      const graph = await loadSupervisorGraph(requestId);
      const intentStep = graph.steps.find(
        (step) =>
          step.agentName === "intent-query-agent" && step.action === "execute",
      );

      assert.equal(intentStep?.output?.route, "rag", message);
      assert.equal(response.answer, ARABIC_ANSWER, message);
      assert.deepEqual(
        response.sources?.map((source) => source.chunkId),
        [evidence.chunkId],
        message,
      );
      assert.deepEqual(
        graph.toolCalls.map((toolCall) => toolCall.toolName),
        ["authorized_hybrid_search", "evaluate_evidence"],
        message,
      );
    }
  },
);

test(
  "production-composed workflow fails closed on provider uncertainty unless knowledge signals are positive",
  { timeout: 90_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const service = await productionService(fixture, {
      model: new IntentProviderFailureFakeModelAdapter(),
    });

    for (const [index, message] of ["شجرا", "asdasd"].entries()) {
      const requestId = `request-provider-failure-terminal-${index}`;
      const response = await service.execute(
        { conversationId: fixture.conversationId, message },
        executionContext(fixture, requestId),
      );
      const graph = await loadSupervisorGraph(requestId);
      assert.deepEqual(response.sources, [], message);
      assert.deepEqual(graph.toolCalls, [], message);
    }

    const requestId = "request-provider-failure-positive-knowledge";
    const response = await service.execute(
      {
        conversationId: fixture.conversationId,
        message: "What is the remote work policy?",
      },
      executionContext(fixture, requestId),
    );
    const graph = await loadSupervisorGraph(requestId);
    const intentStep = graph.steps.find(
      (step) =>
        step.agentName === "intent-query-agent" && step.action === "execute",
    );
    assert.equal(intentStep?.output?.route, "rag");
    assert.deepEqual(
      graph.toolCalls.map((toolCall) => toolCall.toolName),
      ["authorized_hybrid_search", "evaluate_evidence"],
    );
    assert.deepEqual(
      response.sources?.map((source) => source.chunkId),
      [fixture.chunkId],
    );
  },
);

test(
  "production workflow fails closed when final source materialization broadens provenance to an unapproved document",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const requestId = "request-production-provenance-broadening";
    const service = await productionService(fixture, {
      broadenAtMaterialization: true,
    });

    await assert.rejects(
      service.execute(
        { conversationId: fixture.conversationId, message: QUESTION },
        executionContext(fixture, requestId),
      ),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "CHAT_WORKFLOW_AUTHORITY_INVALID",
    );

    const assistantMessages = await MessageModel.find({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
    })
      .lean()
      .exec();
    assert.equal(assistantMessages.length, 0);
    assert.equal(
      JSON.stringify(
        await MessageModel.find({
          tenantId: fixture.tenantId,
          conversationId: fixture.conversationId,
        })
          .lean()
          .exec(),
      ).includes(fixture.rogueDocumentId),
      false,
    );

    const runs = await AgentRunModel.find({ requestId }).lean().exec();
    assert.equal(runs.length, 1);
    const run = runs[0]!;
    const steps = await AgentStepModel.find({ runId: run._id })
      .sort({ stepIndex: 1 })
      .lean()
      .exec();
    const toolCalls = await AgentToolCallModel.find({ runId: run._id })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    assert.equal(run.status, "completed");
    assert.deepEqual(run.output?.sourceIds, [fixture.chunkId]);
    assert.equal(JSON.stringify({ run, steps, toolCalls }).includes(fixture.rogueDocumentId), false);
    assertPersistenceSafety({ run, steps, toolCalls });
  },
);

test(
  "a self-contained second turn keeps document, query, source, and Answer Writer context request-local",
  { timeout: 90_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const expenseEvidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "expense-policy.pdf",
      title: "Expense Policy",
      question: TURN_TWO_QUESTION,
      text: TURN_TWO_CHUNK_TEXT,
      sectionTitle: "Meal reimbursement",
      pageNumber: 7,
    });
    const remoteEvidence: EvidenceFixture = {
      tenantId: fixture.tenantId,
      documentId: fixture.documentId,
      chunkId: fixture.chunkId,
      documentVersionId: fixture.documentVersionId,
      title: "Remote Work Policy",
      question: TURN_ONE_QUESTION,
      text: RAW_CHUNK_TEXT,
    };
    const model = new RecordingFakeModelAdapter(
      new Map([
        [TURN_ONE_QUESTION, TURN_ONE_ANSWER],
        [TURN_TWO_QUESTION, TURN_TWO_ANSWER],
      ]),
    );
    const service = await productionService(fixture, {
      evidence: [remoteEvidence, expenseEvidence],
      model,
      useMongoHistory: true,
    });

    const turnOne = await service.execute(
      { conversationId: fixture.conversationId, message: TURN_ONE_QUESTION },
      executionContext(fixture, "request-history-turn-one"),
    );
    const turnTwoRequestId = "request-history-turn-two";
    const turnTwo = await service.execute(
      { conversationId: fixture.conversationId, message: TURN_TWO_QUESTION },
      executionContext(fixture, turnTwoRequestId),
    );

    assert.equal(turnOne.answer, TURN_ONE_ANSWER);
    assert.deepEqual(turnOne.sources?.map((source) => source.chunkId), [
      fixture.chunkId,
    ]);
    assert.equal(turnTwo.answer, TURN_TWO_ANSWER);
    assert.equal(turnTwo.answer.includes(TURN_ONE_ANSWER), false);
    assert.deepEqual(
      turnTwo.sources?.map((source) => ({
        chunkId: source.chunkId,
        documentId: source.documentId,
      })),
      [
        {
          chunkId: expenseEvidence.chunkId,
          documentId: expenseEvidence.documentId,
        },
      ],
    );

    const turnTwoRun = await AgentRunModel.findOne({
      requestId: turnTwoRequestId,
    })
      .lean()
      .exec();
    assert.ok(turnTwoRun);
    const turnTwoSteps = await AgentStepModel.find({ runId: turnTwoRun._id })
      .sort({ stepIndex: 1 })
      .lean()
      .exec();
    const turnTwoToolCalls = await AgentToolCallModel.find({
      runId: turnTwoRun._id,
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    const intentStep = turnTwoSteps.find(
      (step) =>
        step.agentName === "intent-query-agent" && step.action === "execute",
    );
    assert.ok(intentStep?.output);
    assert.equal(intentStep.output.route, "rag");
    assert.equal(intentStep.output.isFollowUp, false);
    assert.equal(intentStep.output.conversationContextUsed, false);
    assert.equal(intentStep.output.normalizedQuestion, TURN_TWO_QUESTION);
    assert.deepEqual(intentStep.output.referencedDocumentIds, [
      expenseEvidence.documentId,
    ]);
    assert.deepEqual(intentStep.output.referencedDocumentTitles, [
      "Expense Policy",
    ]);
    const turnTwoQueryState = JSON.stringify({
      semanticQueries: intentStep.output.semanticQueries,
      keywordQueries: intentStep.output.keywordQueries,
    });
    assert.equal(turnTwoQueryState.includes(TURN_ONE_QUESTION), false);
    assert.equal(turnTwoQueryState.toLowerCase().includes("remote"), false);
    assert.equal(turnTwoQueryState.includes(fixture.documentId), false);

    const searchCall = turnTwoToolCalls.find(
      (toolCall) => toolCall.toolName === "authorized_hybrid_search",
    );
    const evidenceCall = turnTwoToolCalls.find(
      (toolCall) => toolCall.toolName === "evaluate_evidence",
    );
    assert.ok(searchCall);
    assert.equal(searchCall.input.queryText, TURN_TWO_QUESTION);
    assert.deepEqual(searchCall.input.documentIds, [expenseEvidence.documentId]);
    assert.deepEqual(
      (searchCall.output?.candidates as Array<{ chunkId: string }>).map(
        (candidate) => candidate.chunkId,
      ),
      [expenseEvidence.chunkId],
    );
    assert.ok(evidenceCall);
    assert.deepEqual(evidenceCall.input.candidateIds, [expenseEvidence.chunkId]);
    assert.deepEqual(evidenceCall.output?.approvedEvidenceIds, [
      expenseEvidence.chunkId,
    ]);
    assert.equal(
      JSON.stringify({ searchCall, evidenceCall }).includes(fixture.chunkId),
      false,
    );

    const answerWriterStep = turnTwoSteps.find(
      (step) =>
        step.agentName === "answer-writer-agent" && step.action === "execute",
    );
    assert.ok(answerWriterStep);
    assert.deepEqual(answerWriterStep.input.approvedEvidenceIds, [
      expenseEvidence.chunkId,
    ]);
    const answerWriterPayload = JSON.stringify(answerWriterStep.input);
    for (const previousTurnValue of [
      TURN_ONE_QUESTION,
      TURN_ONE_ANSWER,
      RAW_CHUNK_TEXT,
      fixture.documentId,
      fixture.chunkId,
    ]) {
      assert.equal(answerWriterPayload.includes(previousTurnValue), false);
    }

    const answerWriterCalls = model.calls.filter(
      (call) => call.structuredOutput?.type === "json_object",
    );
    assert.equal(answerWriterCalls.length, 2);
    const turnTwoAnswerWriterMessages = JSON.stringify(
      answerWriterCalls[1]!.messages,
    );
    assert.equal(turnTwoAnswerWriterMessages.includes(TURN_TWO_QUESTION), true);
    assert.equal(turnTwoAnswerWriterMessages.includes(TURN_TWO_CHUNK_TEXT), true);
    for (const previousTurnValue of [
      TURN_ONE_QUESTION,
      TURN_ONE_ANSWER,
      RAW_CHUNK_TEXT,
    ]) {
      assert.equal(turnTwoAnswerWriterMessages.includes(previousTurnValue), false);
    }

    const persistedTurnTwoAssistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
      sequenceNumber: 3,
    })
      .lean()
      .exec();
    assert.ok(persistedTurnTwoAssistant);
    assert.equal(persistedTurnTwoAssistant.content, turnTwo.answer);
    assert.deepEqual(
      persistedTurnTwoAssistant.sources.map((source) => ({
        chunkId: source.chunkId,
        documentId: source.documentId,
      })),
      [
        {
          chunkId: expenseEvidence.chunkId,
          documentId: expenseEvidence.documentId,
        },
      ],
    );
  },
);

test(
  "Arabic authorized evidence produces a structured grounded answer released as usable Arabic prose",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const arabicEvidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "leave-policy-ar.pdf",
      title: "سياسة الإجازات",
      question: ARABIC_QUESTION,
      text: ARABIC_CHUNK_TEXT,
      language: "ar",
      sectionTitle: "الإجازة السنوية",
      pageNumber: 4,
    });
    const model = new RecordingFakeModelAdapter(
      new Map([[ARABIC_QUESTION, ARABIC_ANSWER]]),
    );
    const requestId = "request-arabic-grounded";
    const service = await productionService(fixture, {
      evidence: [arabicEvidence],
      model,
      useMongoHistory: true,
    });

    const response = await service.execute(
      { conversationId: fixture.conversationId, message: ARABIC_QUESTION },
      executionContext(fixture, requestId),
    );

    assert.equal(response.answer, ARABIC_ANSWER);
    assert.match(response.answer, /[\u0600-\u06ff]/);
    assert.equal(response.answer.trim().startsWith("{"), false);
    assert.doesNotMatch(response.answer, /"(?:decision|answer|citedChunkIds)"/);
    assert.doesNotMatch(response.answer, /معلومات كافية|أدلة كافية/);
    assert.deepEqual(
      response.sources?.map((source) => ({
        chunkId: source.chunkId,
        documentId: source.documentId,
      })),
      [
        {
          chunkId: arabicEvidence.chunkId,
          documentId: arabicEvidence.documentId,
        },
      ],
    );

    const run = await AgentRunModel.findOne({ requestId }).lean().exec();
    assert.ok(run);
    assert.equal(run.status, "completed");
    const steps = await AgentStepModel.find({ runId: run._id })
      .sort({ stepIndex: 1 })
      .lean()
      .exec();
    const intentStep = steps.find(
      (step) =>
        step.agentName === "intent-query-agent" && step.action === "execute",
    );
    const answerWriterStep = steps.find(
      (step) =>
        step.agentName === "answer-writer-agent" && step.action === "execute",
    );
    const complianceStep = steps.find(
      (step) =>
        step.agentName === "compliance-agent" && step.action === "execute",
    );
    assert.equal(intentStep?.output?.route, "rag");
    assert.equal(intentStep?.output?.language, "ar");
    assert.equal(answerWriterStep?.status, "completed");
    assert.equal(answerWriterStep?.output?.decision, "grounded_answer");
    assert.equal(answerWriterStep?.output?.answer, ARABIC_ANSWER);
    assert.deepEqual(answerWriterStep?.output?.citedChunkIds, [
      arabicEvidence.chunkId,
    ]);
    assert.equal(complianceStep?.output?.action, "release");
    assert.equal(
      complianceStep?.output?.reasonCode,
      "COMPLIANT_GROUNDED_RESPONSE",
    );
    assert.equal(complianceStep?.output?.answer, response.answer);
    assert.deepEqual(complianceStep?.output?.sourceIds, [
      arabicEvidence.chunkId,
    ]);
    const answerWriterCalls = model.calls.filter(
      (call) => call.structuredOutput?.type === "json_object",
    );
    assert.equal(answerWriterCalls.length, 1);
    assert.equal(
      JSON.stringify(answerWriterCalls[0]!.messages).includes(ARABIC_CHUNK_TEXT),
      true,
    );

    const assistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
    })
      .lean()
      .exec();
    assert.ok(assistant);
    assert.equal(assistant.content, response.answer);
    assert.deepEqual(
      assistant.sources.map((source) => source.chunkId),
      [arabicEvidence.chunkId],
    );
  },
);

test(
  "authorized sensitive-looking facts stay grounded while malicious access-code requests take the source-less safety path",
  { timeout: 90_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const sensitiveEvidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "blue-falcon.pdf",
      title: "Project Blue Falcon",
      question: BLUE_FALCON_QUESTION,
      text: `Authorized project record: the internal access code is ${BLUE_FALCON_CODE}.`,
      sectionTitle: "Authorized access",
      pageNumber: 2,
    });
    const model = new RecordingFakeModelAdapter(
      new Map([[BLUE_FALCON_QUESTION, BLUE_FALCON_ANSWER]]),
    );
    const service = await productionService(fixture, {
      evidence: [sensitiveEvidence],
      model,
      useMongoHistory: true,
    });

    const benignRequestId = "request-benign-sensitive-lookup";
    const benign = await service.execute(
      {
        conversationId: fixture.conversationId,
        message: BLUE_FALCON_QUESTION,
      },
      executionContext(fixture, benignRequestId),
    );
    const benignGraph = await loadSupervisorGraph(benignRequestId);
    const benignIntent = benignGraph.steps.find(
      (step) =>
        step.agentName === "intent-query-agent" && step.action === "execute",
    );
    assert.equal(benignIntent?.output?.route, "rag");
    assert.equal(benignIntent?.output?.intent, "knowledge_question");
    assert.deepEqual(
      benignGraph.toolCalls.map((toolCall) => toolCall.toolName),
      ["authorized_hybrid_search", "evaluate_evidence"],
    );
    assert.equal(benign.answer, BLUE_FALCON_ANSWER);
    assert.equal(benign.answer.includes(BLUE_FALCON_CODE), true);
    assert.deepEqual(
      benign.sources?.map((source) => ({
        chunkId: source.chunkId,
        documentId: source.documentId,
      })),
      [
        {
          chunkId: sensitiveEvidence.chunkId,
          documentId: sensitiveEvidence.documentId,
        },
      ],
    );

    const maliciousRequestId = "request-malicious-access-code";
    const malicious = await service.execute(
      {
        conversationId: fixture.conversationId,
        message: MALICIOUS_ACCESS_QUESTION,
      },
      executionContext(fixture, maliciousRequestId),
    );
    const maliciousGraph = await loadSupervisorGraph(maliciousRequestId);
    const maliciousIntent = maliciousGraph.steps.find(
      (step) =>
        step.agentName === "intent-query-agent" && step.action === "execute",
    );
    const maliciousCompliance = maliciousGraph.steps.find(
      (step) =>
        step.agentName === "compliance-agent" && step.action === "execute",
    );
    assert.equal(maliciousIntent?.output?.route, "unsafe");
    assert.equal(maliciousCompliance?.output?.action, "refuse");
    assert.equal(maliciousCompliance?.output?.reasonCode, "UNSAFE_RESPONSE");
    assert.equal(maliciousGraph.toolCalls.length, 0);
    assert.deepEqual(malicious.sources, []);
    assertValuesAbsent(malicious, [
      BLUE_FALCON_CODE,
      sensitiveEvidence.chunkId,
      sensitiveEvidence.documentId,
      sensitiveEvidence.title,
    ]);
    const maliciousAssistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
      sequenceNumber: 3,
    })
      .lean()
      .exec();
    assert.ok(maliciousAssistant);
    assert.equal(maliciousAssistant.sources.length, 0);
    assertValuesAbsent(maliciousAssistant, [
      BLUE_FALCON_CODE,
      sensitiveEvidence.chunkId,
      sensitiveEvidence.documentId,
      sensitiveEvidence.title,
    ]);
    assertPersistenceSafety(benignGraph);
    assertPersistenceSafety(maliciousGraph);
  },
);

test(
  "Tenant A retrieval and provenance exclude semantically matching Tenant B evidence",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const tenantAEvidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "deployment-a.pdf",
      title: "Tenant A Deployment Guide",
      question: CROSS_TENANT_QUESTION,
      text: `The emergency deployment phrase is ${TENANT_A_DEPLOYMENT_MARKER}.`,
      sectionTitle: "Emergency deployment",
      pageNumber: 5,
    });
    const tenantBScope = await seedOtherTenantScope();
    const tenantBEvidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "deployment-b.pdf",
      title: "Tenant B Confidential Deployment Guide",
      question: CROSS_TENANT_QUESTION,
      text: `The emergency deployment phrase is ${TENANT_B_SECRET_MARKER}.`,
      sectionTitle: "Tenant B secret deployment",
      pageNumber: 9,
      scope: tenantBScope,
    });
    const tenantAAnswer =
      `The emergency deployment phrase is ${TENANT_A_DEPLOYMENT_MARKER}.`;
    const model = new RecordingFakeModelAdapter(
      new Map([[CROSS_TENANT_QUESTION, tenantAAnswer]]),
    );
    const requestId = "request-cross-tenant-isolation";
    const service = await productionService(fixture, {
      evidence: [tenantAEvidence, tenantBEvidence],
      model,
    });

    const response = await service.execute(
      {
        conversationId: fixture.conversationId,
        message: CROSS_TENANT_QUESTION,
      },
      executionContext(fixture, requestId),
    );
    const graph = await loadSupervisorGraph(requestId);
    const searchCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "authorized_hybrid_search",
    );
    const evidenceCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "evaluate_evidence",
    );
    assert.ok(searchCall);
    assert.deepEqual(
      (searchCall.output?.candidates as Array<{ chunkId: string }>).map(
        (candidate) => candidate.chunkId,
      ),
      [tenantAEvidence.chunkId],
    );
    assert.deepEqual(evidenceCall?.input?.candidateIds, [tenantAEvidence.chunkId]);
    assert.deepEqual(evidenceCall?.output?.approvedEvidenceIds, [
      tenantAEvidence.chunkId,
    ]);
    assert.equal(response.answer, tenantAAnswer);
    assert.deepEqual(
      response.sources?.map((source) => ({
        chunkId: source.chunkId,
        documentId: source.documentId,
      })),
      [
        {
          chunkId: tenantAEvidence.chunkId,
          documentId: tenantAEvidence.documentId,
        },
      ],
    );
    assertValuesAbsent({ response, graph }, [
      tenantBEvidence.chunkId,
      tenantBEvidence.documentId,
      tenantBEvidence.title,
      TENANT_B_SECRET_MARKER,
    ]);
    const assistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
    })
      .lean()
      .exec();
    assert.ok(assistant);
    assertValuesAbsent(assistant, [
      tenantBEvidence.chunkId,
      tenantBEvidence.documentId,
      tenantBEvidence.title,
      TENANT_B_SECRET_MARKER,
    ]);
    assertPersistenceSafety(graph);
  },
);

test(
  "same-tenant readable evidence without use_in_ai permission remains outside AI retrieval and persistence",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const deniedEvidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "readable-no-ai.pdf",
      title: "Readable Restricted Launch Plan",
      question: USE_IN_AI_DENIED_QUESTION,
      text: `The restricted launch date is ${USE_IN_AI_DENIED_MARKER}.`,
      sectionTitle: "Launch schedule",
      pageNumber: 6,
      policyActions: ["discover", "read"],
      allowAiUse: false,
    });
    const requestId = "request-use-in-ai-denied";
    const service = await productionService(fixture, {
      evidence: [deniedEvidence],
    });

    const response = await service.execute(
      {
        conversationId: fixture.conversationId,
        message: USE_IN_AI_DENIED_QUESTION,
      },
      executionContext(fixture, requestId),
    );
    const graph = await loadSupervisorGraph(requestId);
    const searchCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "authorized_hybrid_search",
    );
    const evidenceCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "evaluate_evidence",
    );
    assert.ok(searchCall);
    assert.deepEqual(searchCall.output?.candidates, []);
    assert.equal(evidenceCall, undefined);
    assert.deepEqual(response.sources, []);
    assertValuesAbsent({ response, graph }, [
      deniedEvidence.chunkId,
      deniedEvidence.documentId,
      deniedEvidence.title,
      USE_IN_AI_DENIED_MARKER,
    ]);
    const assistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
    })
      .lean()
      .exec();
    assert.ok(assistant);
    assert.equal(assistant.sources.length, 0);
    assertValuesAbsent(assistant, [
      deniedEvidence.chunkId,
      deniedEvidence.documentId,
      USE_IN_AI_DENIED_MARKER,
    ]);
    assertPersistenceSafety(graph);
  },
);

test(
  "deleted, archived, and failed documents stay outside retrieval, evidence, citations, and answers",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const states = [
      {
        fileName: "deleted-contingency.pdf",
        title: "Deleted Contingency",
        marker: "DELETED-CONTINGENCY-771",
        deletedAt: new Date(),
      },
      {
        fileName: "archived-contingency.pdf",
        title: "Archived Contingency",
        marker: "ARCHIVED-CONTINGENCY-772",
        isArchived: true,
      },
      {
        fileName: "failed-contingency.pdf",
        title: "Failed Contingency",
        marker: "FAILED-CONTINGENCY-773",
        status: "failed" as const,
      },
    ];
    const excludedEvidence = await Promise.all(
      states.map((state, index) =>
        seedAdditionalAuthorizedEvidence(fixture, {
          fileName: state.fileName,
          title: state.title,
          question: NON_RETRIEVABLE_QUESTION,
          text: `The retired contingency phrase is ${state.marker}.`,
          sectionTitle: "Retired contingency",
          pageNumber: index + 10,
          ...(state.deletedAt ? { deletedAt: state.deletedAt } : {}),
          ...(state.isArchived ? { isArchived: true } : {}),
          ...(state.status ? { status: state.status } : {}),
        }),
      ),
    );
    const requestId = "request-non-retrievable-states";
    const service = await productionService(fixture, {
      evidence: excludedEvidence,
    });

    const response = await service.execute(
      {
        conversationId: fixture.conversationId,
        message: NON_RETRIEVABLE_QUESTION,
      },
      executionContext(fixture, requestId),
    );
    const graph = await loadSupervisorGraph(requestId);
    const searchCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "authorized_hybrid_search",
    );
    const evidenceCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "evaluate_evidence",
    );
    assert.ok(searchCall);
    assert.deepEqual(searchCall.output?.candidates, []);
    assert.equal(evidenceCall, undefined);
    assert.deepEqual(response.sources, []);
    const forbidden = excludedEvidence.flatMap((item) => [
      item.chunkId,
      item.documentId,
      item.title,
      item.text,
    ]);
    assertValuesAbsent({ response, graph }, forbidden);
    const assistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
    })
      .lean()
      .exec();
    assert.ok(assistant);
    assert.equal(assistant.sources.length, 0);
    assertValuesAbsent(assistant, forbidden);
    assertPersistenceSafety(graph);
  },
);

test(
  "an exact unauthorized document title cannot confirm existence or reach retrieval, sources, or persistence",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const unauthorizedEvidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "restricted-operations.pdf",
      title: "Restricted Operations",
      question: UNAUTHORIZED_TITLE_QUESTION,
      text: `The restricted vault phrase is ${UNAUTHORIZED_TITLE_MARKER}.`,
      sectionTitle: "Restricted vault",
      pageNumber: 12,
      policyActions: ["discover", "read"],
      allowAiUse: false,
    });
    const requestId = "request-unauthorized-title";
    const service = await productionService(fixture, {
      evidence: [unauthorizedEvidence],
    });

    const response = await service.execute(
      {
        conversationId: fixture.conversationId,
        message: UNAUTHORIZED_TITLE_QUESTION,
      },
      executionContext(fixture, requestId),
    );
    const graph = await loadSupervisorGraph(requestId);
    assert.equal(
      graph.toolCalls.some((toolCall) =>
        ["authorized_hybrid_search", "evaluate_evidence"].includes(
          toolCall.toolName,
        ),
      ),
      false,
    );
    assert.deepEqual(response.sources, []);
    assertValuesAbsent(response, [
      unauthorizedEvidence.chunkId,
      unauthorizedEvidence.documentId,
      unauthorizedEvidence.title,
      UNAUTHORIZED_TITLE_MARKER,
    ]);
    const assistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
    })
      .lean()
      .exec();
    assert.ok(assistant);
    assert.equal(assistant.sources.length, 0);
    assertValuesAbsent(assistant, [
      unauthorizedEvidence.chunkId,
      unauthorizedEvidence.documentId,
      unauthorizedEvidence.title,
      UNAUTHORIZED_TITLE_MARKER,
    ]);
    assertPersistenceSafety(graph);
  },
);

test(
  "a use_in_ai grant revoked after search discovery is rejected by evidence reauthorization",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const evidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "temporary-incident-response.pdf",
      title: "Temporary Incident Response",
      question: REVOKED_AFTER_SEARCH_QUESTION,
      text: `The temporary incident response phrase is ${REVOKED_AFTER_SEARCH_MARKER}.`,
      sectionTitle: "Temporary response authorization",
      pageNumber: 14,
    });
    const requestId = "request-revoked-after-search";
    const service = await productionService(fixture, { evidence: [evidence] });

    const response = await executeWithMutationAfterSearch(
      () =>
        service.execute(
          {
            conversationId: fixture.conversationId,
            message: REVOKED_AFTER_SEARCH_QUESTION,
          },
          executionContext(fixture, requestId),
        ),
      () => revokeUseInAiGrant(fixture, evidence),
    );
    const graph = await loadSupervisorGraph(requestId);
    const searchCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "authorized_hybrid_search",
    );
    const evidenceCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "evaluate_evidence",
    );
    const answerWriterStep = graph.steps.find(
      (step) =>
        step.agentName === "answer-writer-agent" && step.action === "execute",
    );
    const complianceStep = graph.steps.find(
      (step) =>
        step.agentName === "compliance-agent" && step.action === "execute",
    );

    assert.ok(searchCall);
    assert.deepEqual(
      (searchCall.output?.candidates as Array<{ chunkId: string }>).map(
        (candidate) => candidate.chunkId,
      ),
      [evidence.chunkId],
    );
    assert.ok(evidenceCall);
    assert.deepEqual(evidenceCall.input.candidateIds, [evidence.chunkId]);
    assert.deepEqual(evidenceCall.output?.approvedEvidenceIds, []);
    assert.deepEqual(evidenceCall.output?.rejectedEvidenceIds, [evidence.chunkId]);
    assert.equal(evidenceCall.output?.sufficiency, "NO_EVIDENCE");
    assert.equal(answerWriterStep, undefined);
    assert.equal(complianceStep?.output?.action, "refuse");
    assert.equal(complianceStep?.output?.reasonCode, "INSUFFICIENT_EVIDENCE");
    assert.deepEqual(response.sources, []);
    assertValuesAbsent(response, [
      REVOKED_AFTER_SEARCH_MARKER,
      evidence.chunkId,
      evidence.documentId,
      evidence.title,
    ]);

    const assistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
    })
      .lean()
      .exec();
    assert.ok(assistant);
    assert.equal(assistant.content, response.answer);
    assert.equal(assistant.sources.length, 0);
    assertValuesAbsent(assistant, [
      REVOKED_AFTER_SEARCH_MARKER,
      evidence.documentId,
      evidence.title,
    ]);
    assertPersistenceSafety(graph);
  },
);

test(
  "a document deleted after search discovery is rejected by evidence eligibility revalidation",
  { timeout: 60_000 },
  async () => {
    const fixture = await seedWorkflowState();
    const evidence = await seedAdditionalAuthorizedEvidence(fixture, {
      fileName: "temporary-recovery-authorization.pdf",
      title: "Temporary Recovery Authorization",
      question: DELETED_AFTER_SEARCH_QUESTION,
      text: `The temporary recovery authorization value is ${DELETED_AFTER_SEARCH_MARKER}.`,
      sectionTitle: "Temporary recovery",
      pageNumber: 15,
    });
    const requestId = "request-deleted-after-search";
    const service = await productionService(fixture, { evidence: [evidence] });

    const response = await executeWithMutationAfterSearch(
      () =>
        service.execute(
          {
            conversationId: fixture.conversationId,
            message: DELETED_AFTER_SEARCH_QUESTION,
          },
          executionContext(fixture, requestId),
        ),
      () => deleteDocumentAfterSearch(fixture, evidence),
    );
    const graph = await loadSupervisorGraph(requestId);
    const searchCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "authorized_hybrid_search",
    );
    const evidenceCall = graph.toolCalls.find(
      (toolCall) => toolCall.toolName === "evaluate_evidence",
    );
    const answerWriterStep = graph.steps.find(
      (step) =>
        step.agentName === "answer-writer-agent" && step.action === "execute",
    );
    const complianceStep = graph.steps.find(
      (step) =>
        step.agentName === "compliance-agent" && step.action === "execute",
    );

    assert.ok(searchCall);
    assert.deepEqual(
      (searchCall.output?.candidates as Array<{ chunkId: string }>).map(
        (candidate) => candidate.chunkId,
      ),
      [evidence.chunkId],
    );
    assert.ok(evidenceCall);
    assert.deepEqual(evidenceCall.input.candidateIds, [evidence.chunkId]);
    assert.deepEqual(evidenceCall.output?.approvedEvidenceIds, []);
    assert.deepEqual(evidenceCall.output?.rejectedEvidenceIds, [evidence.chunkId]);
    assert.equal(evidenceCall.output?.sufficiency, "NO_EVIDENCE");
    assert.equal(answerWriterStep, undefined);
    assert.equal(complianceStep?.output?.action, "refuse");
    assert.equal(complianceStep?.output?.reasonCode, "INSUFFICIENT_EVIDENCE");
    assert.deepEqual(response.sources, []);
    assertValuesAbsent(response, [
      DELETED_AFTER_SEARCH_MARKER,
      evidence.chunkId,
      evidence.documentId,
      evidence.title,
    ]);

    const assistant = await MessageModel.findOne({
      tenantId: fixture.tenantId,
      conversationId: fixture.conversationId,
      role: "assistant",
    })
      .lean()
      .exec();
    assert.ok(assistant);
    assert.equal(assistant.content, response.answer);
    assert.equal(assistant.sources.length, 0);
    assertValuesAbsent(assistant, [
      DELETED_AFTER_SEARCH_MARKER,
      evidence.documentId,
      evidence.title,
    ]);
    assertPersistenceSafety(graph);
  },
);
