import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import DocumentModel from "../../../db/models/document.model.js";
import DocumentClassificationModel from "../../../db/models/documentClassification.model.js";
import DocumentAccessPolicyModel from "../../../db/models/documentAccessPolicy.model.js";
import DocumentChunkModel, {
  type ChunkStatus,
  type ChunkClassification,
} from "../../../db/models/documentChunk.model.js";
import { hashPassword } from "../../auth/passwordHashing.js";
import { disconnectRedis } from "../../../db/redis.js";
import { getDocumentAccessAuthorizationService } from "../../document-access/documentAccess.authorization.service.js";
import { resolveAuthorizedDocumentHints } from "../../intent-query/intentQuery.documentHints.js";
import { createRetrievalService } from "../../retrieval/retrieval.service.js";
import { createRetrievalRepository } from "../../retrieval/retrieval.repository.js";
import { FusionEngine } from "../../retrieval/fusionEngine.js";
import {
  compileAccessFilters,
  compileQueryFilters,
  mergeFilters,
} from "../../retrieval/filterCompiler.js";
import { FakeRerankerAdapter } from "../../reranker/fakeReranker.adapter.js";
import { createRerankerService } from "../../reranker/reranker.service.js";
import type { VectorStoreAdapter } from "../../../providers/embedding/vectorStoreAdapter.js";
import type { KeywordAdapter } from "../../../providers/embedding/keywordAdapter.js";
import type { AdapterFilter } from "../../../providers/embedding/adapterFilter.types.js";
import type { EmbeddingAdapter } from "../agents.types.js";
import type { AgentRunContext } from "../agentRunContext.js";
import type { RerankerService } from "../../reranker/reranker.service.js";
import {
  createDefaultLoadChunksByIds,
  createDefaultLoadEligibleDocumentIds,
  createAuthorizedRetrievalTools,
  type AuthorizedRetrievalDependencies,
} from "./authorizedRetrievalTools.js";

/**
 * Real-Mongo integration tests for the authorized retrieval/evidence tools.
 *
 * Every dependency except the external search backends is the production
 * composition from app.ts:
 *   - resolveAuthorizedDocumentHints (real resolver, real authorization service)
 *   - createDefaultLoadChunksByIds / createDefaultLoadEligibleDocumentIds (real)
 *   - getDocumentAccessAuthorizationService (real policy evaluation)
 *   - createRerankerService({ reranker: new FakeRerankerAdapter() }) (real, same
 *     adapter as the runtime default)
 *   - createRetrievalService wired exactly like app.ts, with in-test vector /
 *     keyword adapters that query the seeded DocumentChunk collection.
 *
 * Only the external vector/keyword/embedding backends are stubbed — those
 * cannot run against MongoMemoryReplSet and are covered by the unit and
 * SupervisorRuntime integration suites.
 */

let mongoServer: MongoMemoryReplSet | null = null;
const TEST_PASSWORD = "StrongPass123!";

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "authorized-retrieval-tools-db-test" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "authorized-retrieval-tools-db-test" });
  }
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

let tenantId: string;
let actorId: string;
let otherTenantId: string;
let otherActorId: string;

// ── Seed helpers ───────────────────────────────────────────────────────────

async function seedClassification(forTenantId: string, userId: string) {
  const normalizedName = "internal";
  let classificationDoc = await DocumentClassificationModel.findOne({
    tenantId: forTenantId,
    normalizedName,
    status: "active",
  });
  if (!classificationDoc) {
    classificationDoc = await DocumentClassificationModel.create({
      tenantId: forTenantId,
      name: "Internal",
      normalizedName,
      level: "confidential" as const,
      description: "Internal classification",
      status: "active" as const,
      version: 1,
      createdBy: userId,
      updatedBy: userId,
    });
  }
  return classificationDoc;
}

async function createDoc(options: {
  tenantId: string;
  ownerId: string;
  fileName: string;
  title?: string | null;
  withPolicy?: boolean;
  policyActions?: readonly import("../../document-access/documentAccess.actions.js").DocumentAccessAction[];
  status?: "uploading" | "uploaded" | "processing" | "processed" | "failed" | "canceled";
  isArchived?: boolean;
  deletedAt?: Date | null;
  searchStatus?: "NOT_INDEXED" | "INDEXING" | "READY" | "FAILED" | "STALE";
}) {
  const withPolicy = options.withPolicy ?? true;
  const actions = options.policyActions ?? ["discover", "read", "download", "use_in_ai"];
  const classificationDoc = await seedClassification(options.tenantId, options.ownerId);
  const policyId = new Types.ObjectId();
  const now = new Date();

  const doc = await DocumentModel.create({
    tenantId: options.tenantId,
    fileName: options.fileName,
    originalFileName: options.fileName,
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: `${options.tenantId}/${options.fileName}`,
    checksum: `cs-${options.fileName}`,
    status: (options.status ?? "uploaded") as "uploading" | "uploaded" | "processing" | "processed" | "failed" | "canceled",
    metadata: { title: options.title ?? null, description: null, tags: [] },
    classification: "internal" as const,
    version: 1,
    versionLabel: "v1",
    uploadedBy: options.ownerId,
    owner: options.ownerId,
    classificationId: classificationDoc._id,
    activePolicyId: withPolicy ? policyId : null,
    activePolicyVersion: withPolicy ? 1 : null,
    policyChangedAt: now,
    isArchived: options.isArchived ?? false,
    archivedAt: options.isArchived ? now : null,
    archivedBy: null,
    deletedAt: options.deletedAt ?? null,
    deletedBy: null,
    quarantineStatus: "none" as const,
    scanResult: null,
    category: null,
    department: null,
    effectiveDate: null,
    expiryDate: null,
    searchStatus: options.searchStatus ?? "READY",
  });

  if (withPolicy) {
    await DocumentAccessPolicyModel.create({
      tenantId: options.tenantId,
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
        actions: [...actions],
      }],
      provenance: { createdBy: options.ownerId, createdAt: now, reason: "Test fixture" },
      indexMetadata: {
        policyId,
        policyVersion: 1,
        classificationId: classificationDoc._id,
        categoryId: null,
        departmentId: null,
      },
      createdAt: now,
    });
  }

  return doc;
}

async function createChunk(options: {
  tenantId: string;
  documentId: string;
  text: string;
  status?: ChunkStatus;
  confidenceScore?: number | null;
  allowAiUse?: boolean;
  classification?: ChunkClassification;
  pageNumber?: number;
  sectionTitle?: string;
  documentVersionId?: string | null;
}) {
  return DocumentChunkModel.create({
    tenantId: options.tenantId,
    documentId: options.documentId,
    documentVersion: 1,
    generationId: new Types.ObjectId(),
    chunkIndex: 0,
    sectionPath: [],
    pageStart: 1,
    pageEnd: 1,
    offsetStart: 0,
    offsetEnd: options.text.length,
    contentType: "paragraph" as const,
    language: "en" as const,
    department: null,
    classification: options.classification ?? "internal",
    accessPolicyVersion: null,
    confidenceScore: options.confidenceScore ?? null,
    text: options.text,
    checksum: `cs-${options.text.slice(0, 24)}`,
    tokenCount: Math.ceil(options.text.length / 4),
    status: options.status ?? "ACTIVE",
    partIndex: null,
    partCount: null,
    vector: [],
    category: null,
    allowAiUse: options.allowAiUse ?? true,
    documentVersionId:
      options.documentVersionId === null || options.documentVersionId === undefined
        ? null
        : new Types.ObjectId(options.documentVersionId),
    pageNumber: options.pageNumber ?? null,
    sectionTitle: options.sectionTitle ?? null,
  });
}

function runContext(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    tenantId,
    actorId,
    actorRole: "COMPANY_ADMIN",
    actorEmail: "admin@example.com",
    traceId: "trace-db-test",
    requestId: "req-db-test",
    workflowName: "chat-rag-v1",
    agentName: "chat-supervisor",
    ...overrides,
  };
}

function hintContext() {
  return {
    tenantId,
    actorId,
    tenantObjectId: new mongoose.Types.ObjectId(tenantId),
  };
}

// ── In-test search adapters (query the seeded chunk collection) ────────────

function adapterMongoFilter(filter: AdapterFilter): Record<string, unknown> {
  const query: Record<string, unknown> = { tenantId: filter.tenantId };
  if (filter.documentIds && filter.documentIds.length > 0) {
    query.documentId = {
      $in: filter.documentIds.map((id) => new Types.ObjectId(id)),
    };
  }
  if (filter.classification?.$in) query.classification = { $in: filter.classification.$in };
  if (filter.department?.$in) query.department = { $in: filter.department.$in };
  if (filter.category?.$in) query.category = { $in: filter.category.$in };
  if (filter.allowAiUse !== undefined) query.allowAiUse = filter.allowAiUse;
  if (filter.documentVersionId) query.documentVersionId = filter.documentVersionId;
  return query;
}

function lexicalScore(text: string, queryText: string): number {
  const tokenize = (value: string) =>
    value.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((t) => t.length > 0);
  const terms = tokenize(queryText);
  if (terms.length === 0) return 0;
  const candidateTerms = new Set(tokenize(text));
  let matches = 0;
  for (const term of terms) if (candidateTerms.has(term)) matches++;
  return matches / terms.length;
}

const vectorAdapter: VectorStoreAdapter = {
  providerKey: "test-vector",
  async search({ topK, filter }) {
    const chunks = await DocumentChunkModel.find(adapterMongoFilter(filter))
      .select("_id text")
      .limit(topK)
      .lean()
      .exec();
    return chunks.map((chunk) => ({ chunkId: chunk._id.toString(), score: 0.6 }));
  },
  async storeChunks() {},
  async deleteChunks() {},
};

const keywordAdapter: KeywordAdapter = {
  providerKey: "test-keyword",
  async search({ queryText, topK, filter }) {
    const chunks = await DocumentChunkModel.find(adapterMongoFilter(filter))
      .select("_id text")
      .limit(topK)
      .lean()
      .exec();
    return chunks.map((chunk) => ({
      chunkId: chunk._id.toString(),
      score: lexicalScore(chunk.text, queryText),
    }));
  },
  async indexChunks() {},
  async removeChunks() {},
};

const embeddingAdapter: EmbeddingAdapter = {
  providerKey: "test-embedding",
  async embed() {
    return { vectors: [[0.1, 0.2, 0.3]], usage: { totalTokens: 3 } };
  },
};

// ── Production-equivalent composition ──────────────────────────────────────

const rerankerService: RerankerService = createRerankerService({
  reranker: new FakeRerankerAdapter(),
});

const retrievalService = createRetrievalService({
  vectorAdapter,
  keywordAdapter,
  embeddingAdapter,
  fusionEngine: new FusionEngine(),
  filterCompiler: { compileAccessFilters, compileQueryFilters, mergeFilters },
  repository: createRetrievalRepository(),
  rerankerService,
  resolveAccessContext: async (context) => {
    const actor = await getDocumentAccessAuthorizationService().resolveActor({
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
    await getDocumentAccessAuthorizationService().authorizeDocumentAction(
      { tenantId: context.tenantId, actorId: context.actorId },
      documentId,
      "use_in_ai",
    );
  },
});

const deps: AuthorizedRetrievalDependencies = {
  retrieval: retrievalService,
  reranker: rerankerService,
  authorization: getDocumentAccessAuthorizationService(),
  resolveDocumentHints: resolveAuthorizedDocumentHints,
  loadChunksByIds: createDefaultLoadChunksByIds(),
  loadEligibleDocumentIds: createDefaultLoadEligibleDocumentIds(),
};

const tools = createAuthorizedRetrievalTools(deps);
const resolveTitlesTool = tools[0]!;
const hybridSearchTool = tools[1]!;
const evaluateEvidenceTool = tools[2]!;

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await DocumentClassificationModel.deleteMany({});
  await DocumentAccessPolicyModel.deleteMany({});
  await DocumentChunkModel.deleteMany({});

  const tenant = await TenantModel.create({ name: "Retrieval Corp", slug: "retrieval-corp", status: "active", plan: "free" });
  tenantId = tenant.id;
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Admin User",
    email: "admin@retrieval.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  actorId = user.id;

  const otherTenant = await TenantModel.create({ name: "Other Corp", slug: "other-retrieval-corp", status: "active", plan: "free" });
  otherTenantId = otherTenant.id;
  const otherUser = await UserModel.create({
    tenantId: otherTenant.id,
    name: "Other Admin",
    email: "admin@other-retrieval.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  otherActorId = otherUser.id;
});

// ── resolve_document_titles ────────────────────────────────────────────────

test("resolve_document_titles returns one_match for an authorized title", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "handbook.pdf", title: "Employee Handbook" });

  const output = (await resolveTitlesTool.handler(runContext(), {
    titles: ["Employee Handbook"],
  })) as { status: string; documentIds: string[]; reasonCode: string };

  assert.equal(output.status, "one_match");
  assert.deepEqual(output.documentIds, [doc.id]);
  assert.equal(output.reasonCode, "MATCH_FOUND");
});

test("resolve_document_titles returns no_match for a nonexistent title", async () => {
  const output = (await resolveTitlesTool.handler(runContext(), {
    titles: ["Nonexistent Document"],
  })) as { status: string; documentIds: string[]; reasonCode: string };

  assert.equal(output.status, "no_match");
  assert.deepEqual(output.documentIds, []);
  assert.equal(output.reasonCode, "NO_MATCH");
});

test("resolve_document_titles returns ambiguous when multiple authorized matches exist", async () => {
  await createDoc({ tenantId, ownerId: actorId, fileName: "one.pdf", title: "Shared Title" });
  await createDoc({ tenantId, ownerId: actorId, fileName: "two.pdf", title: "Shared Title" });

  const output = (await resolveTitlesTool.handler(runContext(), {
    titles: ["Shared Title"],
  })) as { status: string; documentIds: string[]; reasonCode: string };

  assert.equal(output.status, "ambiguous");
  assert.deepEqual(output.documentIds, []);
  assert.equal(output.reasonCode, "AMBIGUOUS_TITLE");
});

test("resolve_document_titles never exposes titles without use_in_ai", async () => {
  await createDoc({ tenantId, ownerId: actorId, fileName: "secret.pdf", title: "Secret Title", withPolicy: false });

  const output = (await resolveTitlesTool.handler(runContext(), {
    titles: ["Secret Title"],
  })) as { status: string; documentIds: string[]; reasonCode: string };

  assert.equal(output.status, "no_match");
  assert.deepEqual(output.documentIds, []);
});

test("resolve_document_titles never exposes cross-tenant titles", async () => {
  const foreign = await createDoc({ tenantId: otherTenantId, ownerId: otherActorId, fileName: "foreign.pdf", title: "Foreign Secret" });

  const output = (await resolveTitlesTool.handler(runContext(), {
    titles: ["Foreign Secret"],
  })) as { status: string; documentIds: string[]; reasonCode: string };

  assert.equal(output.status, "no_match");
  const documentIds: string[] = output.documentIds;
  assert.equal(documentIds.includes(foreign.id), false);
  assert.deepEqual(documentIds, []);
});

test("resolve_document_titles treats a use_in_ai denial as no_match", async () => {
  await createDoc({
    tenantId,
    ownerId: actorId,
    fileName: "denied.pdf",
    title: "Denied Doc",
    policyActions: ["read"],
  });

  const output = (await resolveTitlesTool.handler(runContext(), {
    titles: ["Denied Doc"],
  })) as { status: string; documentIds: string[]; reasonCode: string };

  assert.equal(output.status, "no_match");
  assert.deepEqual(output.documentIds, []);
});

test("resolve_document_titles never resolves archived, deleted, or failed documents", async () => {
  await createDoc({ tenantId, ownerId: actorId, fileName: "archived.pdf", title: "Archived Policy", isArchived: true });
  await createDoc({ tenantId, ownerId: actorId, fileName: "deleted.pdf", title: "Deleted Policy", deletedAt: new Date() });
  await createDoc({ tenantId, ownerId: actorId, fileName: "failed.pdf", title: "Failed Policy", status: "failed" });

  const output = (await resolveTitlesTool.handler(runContext(), {
    titles: ["Archived Policy", "Deleted Policy", "Failed Policy"],
  })) as { status: string; documentIds: string[]; reasonCode: string };

  assert.equal(output.status, "no_match");
  assert.deepEqual(output.documentIds, []);
});

// ── Explicit document IDs via the wired production resolver ────────────────

test("explicit authorized document ID resolves through the wired resolver", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "id-handbook.pdf", title: "ID Handbook" });

  const resolution = await resolveAuthorizedDocumentHints([doc.id], hintContext());

  assert.deepEqual(resolution.referencedDocumentIds, [doc.id]);
  assert.deepEqual(resolution.referencedDocumentTitles, ["ID Handbook"]);
  assert.equal(resolution.ambiguousTitleMatches, false);
});

test("explicit unauthorized document ID is silently dropped by the wired resolver", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "id-secret.pdf", title: "ID Secret", withPolicy: false });

  const resolution = await resolveAuthorizedDocumentHints([doc.id], hintContext());

  assert.deepEqual(resolution.referencedDocumentIds, []);
  assert.deepEqual(resolution.referencedDocumentTitles, []);
});

// ── authorized_hybrid_search ───────────────────────────────────────────────

test("authorized_hybrid_search with explicit document IDs returns only the authorized chunk", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "search.pdf", title: "Search Doc" });
  const chunk = await createChunk({
    tenantId,
    documentId: doc.id,
    text: "leave policy grants twenty days of annual vacation leave",
    confidenceScore: 0.9,
  });
  const other = await createDoc({ tenantId, ownerId: actorId, fileName: "other.pdf", title: "Other Doc" });
  const otherChunk = await createChunk({
    tenantId,
    documentId: other.id,
    text: "unrelated expense reimbursement procedure",
    confidenceScore: 0.9,
  });

  const output = (await hybridSearchTool.handler(runContext(), {
    queryText: "leave policy",
    topK: 10,
    documentIds: [doc.id],
  })) as { candidates: Array<Record<string, unknown>>; totalCandidates: number; reasonCode: string };

  const ids = output.candidates.map((c) => c.chunkId);
  assert.ok(ids.includes(chunk.id));
  assert.equal(ids.includes(otherChunk.id), false);
  assert.ok(output.candidates.length > 0);
  const serialized = JSON.stringify(output);
  assert.equal(serialized.includes(chunk.text), false);
  assert.equal(serialized.includes("textExcerpt"), false);
});

test("authorized_hybrid_search with an unauthorized explicit document ID returns nothing", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "nopolicy.pdf", title: "No Policy", withPolicy: false });
  await createChunk({
    tenantId,
    documentId: doc.id,
    text: "confidential compensation figures for executives",
    confidenceScore: 0.9,
  });

  const output = (await hybridSearchTool.handler(runContext(), {
    queryText: "compensation",
    topK: 10,
    documentIds: [doc.id],
  })) as { candidates: Array<Record<string, unknown>>; totalCandidates: number; reasonCode: string };

  assert.equal(output.candidates.length, 0);
  assert.equal(output.totalCandidates, 0);
  assert.equal(output.reasonCode, "NO_RESULTS");
});

test("authorized_hybrid_search never returns cross-tenant chunks", async () => {
  const foreignDoc = await createDoc({ tenantId: otherTenantId, ownerId: otherActorId, fileName: "foreign.pdf", title: "Foreign" });
  const foreignChunk = await createChunk({
    tenantId: otherTenantId,
    documentId: foreignDoc.id,
    text: "foreign tenant classified payroll data",
  });

  const output = (await hybridSearchTool.handler(runContext(), {
    queryText: "payroll",
    topK: 10,
  })) as { candidates: Array<Record<string, unknown>>; totalCandidates: number };

  const ids = output.candidates.map((c) => c.chunkId);
  assert.equal(ids.includes(foreignChunk.id), false);
});

test("direct retrieval and chat retrieval share parent-document lifecycle eligibility", async () => {
  const ready = await createDoc({
    tenantId, ownerId: actorId, fileName: "ready.pdf", title: "Ready",
    status: "processed", searchStatus: "READY",
  });
  const archived = await createDoc({
    tenantId, ownerId: actorId, fileName: "archived-search.pdf", title: "Archived",
    status: "processed", searchStatus: "READY", isArchived: true,
  });
  const failed = await createDoc({
    tenantId, ownerId: actorId, fileName: "failed-search.pdf", title: "Failed",
    status: "failed", searchStatus: "READY",
  });
  const canceled = await createDoc({
    tenantId, ownerId: actorId, fileName: "canceled-search.pdf", title: "Canceled",
    status: "canceled", searchStatus: "READY",
  });
  const stale = await createDoc({
    tenantId, ownerId: actorId, fileName: "stale-search.pdf", title: "Stale",
    status: "processed", searchStatus: "STALE",
  });
  const aiDenied = await createDoc({
    tenantId, ownerId: actorId, fileName: "ai-denied-search.pdf", title: "AI Denied",
    status: "processed", searchStatus: "READY", policyActions: ["read"],
  });
  const foreign = await createDoc({
    tenantId: otherTenantId, ownerId: otherActorId, fileName: "foreign-search.pdf", title: "Foreign",
    status: "processed", searchStatus: "READY",
  });

  const documents = [ready, archived, failed, canceled, stale, aiDenied, foreign];
  const chunks = await Promise.all(documents.map((document) => createChunk({
    tenantId: document.tenantId.toString(),
    documentId: document.id,
    text: `lifecycle parity marker ${document.fileName}`,
    confidenceScore: 0.95,
  })));

  const direct = await retrievalService.hybridSearch(
    { queryText: "lifecycle parity marker", topK: 20 },
    { tenantId, actorId, baseRole: "COMPANY_ADMIN" },
  );
  const chat = (await hybridSearchTool.handler(runContext(), {
    queryText: "lifecycle parity marker",
    topK: 20,
  })) as { candidates: Array<{ chunkId: string }> };

  const directIds = direct.candidates.map((candidate) => candidate.chunkId).sort();
  const chatIds = chat.candidates.map((candidate) => candidate.chunkId).sort();
  assert.deepEqual(directIds, [chunks[0]!.id]);
  assert.deepEqual(chatIds, directIds);
  assert.equal(directIds.includes(chunks[1]!.id), false);
  assert.equal(directIds.includes(chunks[2]!.id), false);
  assert.equal(directIds.includes(chunks[3]!.id), false);
  assert.equal(directIds.includes(chunks[4]!.id), false);
  assert.equal(directIds.includes(chunks[5]!.id), false);
  assert.equal(directIds.includes(chunks[6]!.id), false);
});

// ── evaluate_evidence ──────────────────────────────────────────────────────

test("evaluate_evidence reauthorizes candidates and approves SUFFICIENT evidence", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "leave.pdf", title: "Leave Policy" });
  const chunk = await createChunk({
    tenantId,
    documentId: doc.id,
    text: "employees are entitled to twenty working days of paid annual leave every year",
    confidenceScore: 0.9,
    sectionTitle: "Leave Entitlement",
    pageNumber: 4,
  });

  const output = (await evaluateEvidenceTool.handler(runContext(), {
    question: "how many leave days?",
    candidateIds: [chunk.id],
  })) as {
    sufficiency: string;
    approvedEvidenceIds: string[];
    rejectedEvidenceIds: string[];
    reasonCode: string;
  };

  assert.equal(output.sufficiency, "SUFFICIENT");
  assert.deepEqual(output.approvedEvidenceIds, [chunk.id]);
  assert.deepEqual(output.rejectedEvidenceIds, []);
  assert.equal(output.reasonCode, "EVIDENCE_SUFFICIENT");
  assert.equal(JSON.stringify(output).includes(chunk.text), false);
});

test("evaluate_evidence fails closed when the document lacks a use_in_ai grant", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "nopolicy.pdf", title: "No Policy", withPolicy: false });
  const chunk = await createChunk({
    tenantId,
    documentId: doc.id,
    text: "restricted bonus plan details for senior staff",
    confidenceScore: 0.9,
  });

  const output = (await evaluateEvidenceTool.handler(runContext(), {
    question: "bonus details",
    candidateIds: [chunk.id],
  })) as {
    sufficiency: string;
    approvedEvidenceIds: string[];
    rejectedEvidenceIds: string[];
    reasonCode: string;
  };

  assert.equal(output.sufficiency, "NO_EVIDENCE");
  assert.deepEqual(output.approvedEvidenceIds, []);
  assert.deepEqual(output.rejectedEvidenceIds, [chunk.id]);
  assert.equal(output.reasonCode, "NO_EVIDENCE");
});

test("evaluate_evidence excludes cross-tenant candidates before reranking", async () => {
  const foreignDoc = await createDoc({ tenantId: otherTenantId, ownerId: otherActorId, fileName: "foreign.pdf", title: "Foreign" });
  const foreignChunk = await createChunk({
    tenantId: otherTenantId,
    documentId: foreignDoc.id,
    text: "foreign tenant secret trade information",
    confidenceScore: 0.9,
  });

  const output = (await evaluateEvidenceTool.handler(runContext(), {
    question: "trade information",
    candidateIds: [foreignChunk.id],
  })) as {
    sufficiency: string;
    approvedEvidenceIds: string[];
    rejectedEvidenceIds: string[];
    reasonCode: string;
  };

  assert.equal(output.sufficiency, "NO_EVIDENCE");
  assert.deepEqual(output.approvedEvidenceIds, []);
  assert.deepEqual(output.rejectedEvidenceIds, [foreignChunk.id]);
});

test("evaluate_evidence excludes stale-document candidates and non-retrievable chunks", async () => {
  const staleDoc = await createDoc({
    tenantId,
    ownerId: actorId,
    fileName: "stale.pdf",
    title: "Stale Doc",
    searchStatus: "STALE",
  });
  const staleChunk = await createChunk({
    tenantId,
    documentId: staleDoc.id,
    text: "stale index document content",
    confidenceScore: 0.9,
  });
  const retiredDoc = await createDoc({ tenantId, ownerId: actorId, fileName: "retired.pdf", title: "Retired Doc" });
  const retiredChunk = await createChunk({
    tenantId,
    documentId: retiredDoc.id,
    text: "retired chunk content that must not be cited",
    confidenceScore: 0.9,
    status: "RETIRED",
  });
  const output = (await evaluateEvidenceTool.handler(runContext(), {
    question: "content",
    candidateIds: [staleChunk.id, retiredChunk.id],
  })) as {
    sufficiency: string;
    approvedEvidenceIds: string[];
    rejectedEvidenceIds: string[];
    reasonCode: string;
  };

  assert.equal(output.sufficiency, "NO_EVIDENCE");
  assert.deepEqual(output.approvedEvidenceIds, []);
  assert.deepEqual(output.rejectedEvidenceIds.sort(), [staleChunk.id, retiredChunk.id].sort());
});

test("newly indexed chunks without allowAiUse use the active document policy", async () => {
  const doc = await createDoc({
    tenantId,
    ownerId: actorId,
    fileName: "new-ready.pdf",
    title: "New Ready Guide",
    status: "processed",
    searchStatus: "READY",
  });
  const chunk = await createChunk({
    tenantId,
    documentId: doc.id,
    text: "The deployment uses a blue-green release strategy.",
    confidenceScore: 0.95,
  });
  await DocumentChunkModel.collection.updateOne(
    { _id: chunk._id },
    { $unset: { allowAiUse: "" } },
  );

  const loaded = await createDefaultLoadChunksByIds()(tenantId, [chunk.id]);
  assert.equal(loaded[0]?.allowAiUse, undefined);

  const output = (await evaluateEvidenceTool.handler(runContext(), {
    question: "Which release strategy is used?",
    candidateIds: [chunk.id],
  })) as {
    sufficiency: string;
    approvedEvidenceIds: string[];
    rejectedEvidenceIds: string[];
  };

  assert.equal(output.sufficiency, "SUFFICIENT");
  assert.deepEqual(output.approvedEvidenceIds, [chunk.id]);
  assert.deepEqual(output.rejectedEvidenceIds, []);
});
