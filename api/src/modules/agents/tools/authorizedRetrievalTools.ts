import { z } from "zod";
import mongoose from "mongoose";
import type { ToolRegistry } from "../toolRegistry.js";
import type {
  RegisteredTool,
  RunContext,
  ToolSchema,
} from "../agents.types.js";
import type { AgentRunContext } from "../agentRunContext.js";
import type { BaseRole } from "../../../common/auth/baseRoles.js";
import type { HybridRetrievalService } from "../../retrieval/retrieval.service.js";
import type { RerankerService } from "../../reranker/reranker.service.js";
import type {
  AccessContext,
  RetrievalCandidate,
} from "../../retrieval/retrieval.types.js";
import type { EvidenceBundle } from "../../reranker/reranker.types.js";
import { EVIDENCE_ITEM_MIN_TOTAL_SCORE } from "../../reranker/reranker.types.js";
import { AppError } from "../../../common/errors/AppError.js";
import { logger } from "../../../common/logger/logger.js";
import type { DocumentAccessAuthorizationService } from "../../document-access/documentAccess.authorization.service.js";
import type { DocumentAccessActorContext } from "../../document-access/documentAccess.types.js";
import type {
  DocumentHintContext,
  DocumentHintResolution,
} from "../../intent-query/intentQuery.documentHints.js";
import type { DocumentChunkDocument } from "../../../db/models/documentChunk.model.js";
import DocumentModel from "../../../db/models/document.model.js";
import { createRetrievalRepository } from "../../retrieval/retrieval.repository.js";
import { Permission } from "../../permissions/permissions.catalog.js";

/**
 * Trusted dependencies injected from production wiring in app.ts.
 * Tests pass fake/stub implementations. No module-level singletons are
 * imported or invoked by the tools themselves.
 */
export interface AuthorizedRetrievalDependencies {
  readonly retrieval: HybridRetrievalService;
  readonly reranker: RerankerService;
  readonly authorization: DocumentAccessAuthorizationService;
  /**
   * Authorized document-title/id resolver. Injected explicitly — the tools
   * never reach for a hidden singleton. Unauthorized, cross-tenant, and
   * nonexistent references resolve to empty (indistinguishable) results.
   */
  readonly resolveDocumentHints: (
    rawIds: readonly string[],
    context: DocumentHintContext,
    rawTitles?: readonly string[],
  ) => Promise<DocumentHintResolution>;
  /**
   * Server-side candidate loader, always tenant-scoped. Unknown or
   * cross-tenant chunk ids resolve to nothing.
   */
  readonly loadChunksByIds: (
    tenantId: string,
    chunkIds: readonly string[],
  ) => Promise<readonly LoadedChunkCandidate[]>;
  /**
   * Server-side document eligibility check: returns only document ids that
   * are tenant-owned, not archived, not deleted, not failed, and not stale.
   */
  readonly loadEligibleDocumentIds: (
    tenantId: string,
    documentIds: readonly string[],
  ) => Promise<readonly string[]>;
}

/**
 * A chunk candidate loaded server-side by id. The tool never accepts chunk
 * text or raw similarity scores from the model.
 */
export interface LoadedChunkCandidate {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  tenantId: string;
  text: string;
  pageNumber?: number;
  sectionTitle?: string;
  classification?: string;
  /**
   * Legacy denormalized hint. Older and newly indexed chunks may omit it and
   * policy propagation can make it stale, so controlled authorization must
   * never rely on this field. The active document policy is authoritative.
   */
  allowAiUse?: boolean;
  status: string;
  confidenceScore?: number;
}

/**
 * Document lifecycle statuses that are eligible for AI use. `failed` and
 * `canceled` documents never participate.
 */
export const RETRIEVABLE_DOCUMENT_STATUSES: ReadonlyArray<
  "uploading" | "uploaded" | "processing" | "processed" | "reprocessing"
> = ["uploading", "uploaded", "processing", "processed", "reprocessing"];

/** Search-index statuses that make a document ineligible (stale index). */
export const EXCLUDED_SEARCH_STATUSES = ["FAILED", "STALE"] as const;

/** Chunk statuses eligible for evidence evaluation. */
export const RETRIEVABLE_CHUNK_STATUSES: ReadonlyArray<
  "EMBEDDED" | "INDEXED" | "ACTIVE"
> = ["EMBEDDED", "INDEXED", "ACTIVE"];

/**
 * Default tenant-scoped chunk loader backed by the retrieval repository.
 * Passed explicitly from the composition root.
 */
export function createDefaultLoadChunksByIds(): AuthorizedRetrievalDependencies["loadChunksByIds"] {
  const repository = createRetrievalRepository();
  return async (tenantId, chunkIds) => {
    const validIds = chunkIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id),
    );
    if (validIds.length === 0) return [];
    const chunks = await repository.findChunksByIds(tenantId, validIds);
    return chunks.map(chunkToLoadedCandidate);
  };
}

/**
 * Default document eligibility loader. Mirrors the retrievable-status rules
 * used by the document-title resolver and additionally excludes stale/failed
 * search-index statuses. Passed explicitly from the composition root.
 */
export function createDefaultLoadEligibleDocumentIds(): AuthorizedRetrievalDependencies["loadEligibleDocumentIds"] {
  return async (tenantId, documentIds) => {
    const validIds = documentIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id),
    );
    if (validIds.length === 0) return [];
    const docs = await DocumentModel.find({
      _id: { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) },
      tenantId,
      deletedAt: null,
      isArchived: false,
      status: { $in: [...RETRIEVABLE_DOCUMENT_STATUSES] },
      searchStatus: { $nin: [...EXCLUDED_SEARCH_STATUSES] },
    })
      .select("_id")
      .lean()
      .exec();
    return docs.map((doc) => doc._id.toString());
  };
}

function chunkToLoadedCandidate(chunk: DocumentChunkDocument): LoadedChunkCandidate {
  return {
    chunkId: chunk._id.toString(),
    documentId: chunk.documentId.toString(),
    documentVersionId: chunk.documentVersionId?.toString() ?? "",
    tenantId: chunk.tenantId.toString(),
    text: chunk.text,
    pageNumber: chunk.pageNumber ?? undefined,
    sectionTitle: chunk.sectionTitle ?? undefined,
    classification: chunk.classification ?? undefined,
    allowAiUse: chunk.allowAiUse,
    status: chunk.status,
    confidenceScore: chunk.confidenceScore ?? undefined,
  };
}

/**
 * Fields that an agent tool input must never carry — identity, permissions,
 * and tracing are authoritative server-side values derived from the trusted
 * RunContext. Any presence is treated as an injection attempt and rejected.
 */
const TRUSTED_CONTEXT_FIELDS = [
  "tenantId",
  "actorId",
  "actorRole",
  "permissions",
  "requestId",
  "traceId",
  "workflowId",
  "runId",
  "baseRole",
] as const satisfies readonly string[];

function assertNoTrustedContextFields(
  input: unknown,
  toolName: string,
): void {
  if (input === null || typeof input !== "object") return;
  for (const field of TRUSTED_CONTEXT_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(input, field) &&
      (input as Record<string, unknown>)[field] !== undefined
    ) {
      logger.warn(
        { toolName, injectedField: field },
        "Rejected tool input containing trusted context field",
      );
      throw new AppError(
        400,
        "INVALID_TOOL_INPUT",
        `Tool "${toolName}" input must not contain "${field}"`,
      );
    }
  }
}

/**
 * Resolves the authenticated actor identity for a tool invocation.
 *
 * Order of authority:
 * 1. The trusted `actorRole`/`actorEmail` present on the RunContext (set
 *    server-side by SupervisorRuntime, never by the model).
 * 2. The persisted actor resolved through the document-access service.
 *
 * If neither is available the tool fails closed — no default role is ever
 * assumed.
 */
async function resolveTrustedActor(
  context: RunContext,
  deps: AuthorizedRetrievalDependencies,
): Promise<{
  tenantId: string;
  actorId: string;
  actorEmail?: string;
  actorRole: BaseRole;
  traceId: string;
}> {
  const partial = context as Partial<AgentRunContext>;
  if (partial.actorRole) {
    return {
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorEmail: partial.actorEmail,
      actorRole: partial.actorRole,
      traceId: context.traceId,
    };
  }

  let actor: DocumentAccessActorContext | null = null;
  try {
    actor = await deps.authorization.resolveActor({
      tenantId: context.tenantId,
      actorId: context.actorId,
    });
  } catch {
    actor = null;
  }
  if (actor) {
    return {
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorRole: actor.baseRole,
      traceId: context.traceId,
    };
  }

  throw new AppError(
    401,
    "UNAUTHORIZED",
    "Tool execution requires an authenticated agent context",
  );
}

/**
 * Convert the resolved trusted actor into an AccessContext suitable for the
 * retrieval service. The server is the sole authority for tenantId, actorId,
 * and baseRole — these are never client-controlled.
 */
function buildAccessContext(actor: {
  tenantId: string;
  actorId: string;
  actorEmail?: string;
  actorRole: BaseRole;
}): AccessContext {
  return {
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail ?? null,
    baseRole: actor.actorRole,
    requiredAction: "use_in_ai",
  };
}

// ── Input schemas (strict — unknown keys rejected) ────────────────────────

const TitleSchema = z.string().trim().min(1).max(500);

function boundedIdArraySchema(max = 20) {
  return z
    .array(z.string())
    .min(1)
    .max(max)
    .refine(
      (arr) => arr.every((id) => mongoose.Types.ObjectId.isValid(id)),
      { message: "Each document id must be a valid ObjectId" },
    );
}

/** resolve_document_titles input */
const ResolveTitlesInputSchema = z
  .object({
    titles: z.array(TitleSchema).min(1).max(20),
  })
  .strict();

/** authorized_hybrid_search input */
const HybridSearchInputSchema = z
  .object({
    queryText: z.string().min(1).max(2000),
    topK: z.number().int().min(1).max(50).default(10),
    documentIds: boundedIdArraySchema(20).optional(),
  })
  .strict();

/** evaluate_evidence input */
const EvaluateEvidenceInputSchema = z
  .object({
    question: z.string().min(1).max(2000),
    candidateIds: boundedIdArraySchema(50),
  })
  .strict();

// ── Output schemas (no chunk text / embeddings / prompts) ─────────────────

const ResolveTitlesOutputSchema = z
  .object({
    status: z.enum(["one_match", "no_match", "ambiguous"]),
    documentIds: z.array(z.string()).max(20),
    reasonCode: z.string().min(1).max(200),
  })
  .strict();

const SearchCandidateSummarySchema = z
  .object({
    chunkId: z.string(),
    documentId: z.string(),
    documentVersionId: z.string(),
    score: z.number().min(0),
    pageNumber: z.number().int().positive().optional(),
    sectionTitle: z.string().optional(),
    retrievalMethod: z.string().optional(),
  })
  .strict();

const HybridSearchOutputSchema = z
  .object({
    candidates: z.array(SearchCandidateSummarySchema),
    totalCandidates: z.number().int().nonnegative(),
    reasonCode: z.string().min(1).max(200),
  })
  .strict();

const EvaluateEvidenceOutputSchema = z
  .object({
    sufficiency: z.enum(["SUFFICIENT", "WEAK", "NO_EVIDENCE", "CONFLICTING"]),
    approvedEvidenceIds: z.array(z.string()),
    rejectedEvidenceIds: z.array(z.string()),
    reasonCode: z.string().min(1).max(200),
  })
  .strict();

// ── Tool schemas ──────────────────────────────────────────────────────────

export const resolveDocumentTitlesSchema: ToolSchema = {
  name: "resolve_document_titles",
  version: "1.0.0",
  description:
    "Resolve LLM-provided document title hints into authorized document " +
    "references. Returns a single coarse status with the matching document " +
    "ids only. Unauthorized, cross-tenant, and nonexistent titles are " +
    "externally indistinguishable and all report no_match. " +
    "Never fabricates matches.",
  inputSchema: ResolveTitlesInputSchema,
  outputSchema: ResolveTitlesOutputSchema,
};

export const authorizedHybridSearchSchema: ToolSchema = {
  name: "authorized_hybrid_search",
  version: "1.0.0",
  description:
    "Tenant-scoped hybrid (vector + keyword) search over authorized " +
    "documents. Requires explicit authorization via the use_in_ai action. " +
    "Returns authorized retrieval candidate ids and safe metadata only — " +
    "chunk text, embeddings, prompts, and evidence sufficiency are never " +
    "returned.",
  inputSchema: HybridSearchInputSchema,
  outputSchema: HybridSearchOutputSchema,
  requiredPermission: Permission.DOCUMENTS_USE_IN_AI,
  timeoutMs: 30_000,
};

export const evaluateEvidenceSchema: ToolSchema = {
  name: "evaluate_evidence",
  version: "1.0.0",
  description:
    "Loads candidate chunks server-side by id, scopes them to the trusted " +
    "tenant, reauthorizes each document for use_in_ai, and runs the evidence " +
    "reranker. Fails closed: only bundles whose sufficiency is SUFFICIENT " +
    "yield approved evidence ids; reranker failure or fallback never " +
    "approves raw similarity matches.",
  inputSchema: EvaluateEvidenceInputSchema,
  outputSchema: EvaluateEvidenceOutputSchema,
  requiredPermission: Permission.DOCUMENTS_USE_IN_AI,
  timeoutMs: 30_000,
};

// ── Helpers ───────────────────────────────────────────────────────────────

type TrustedCandidateCatalog = Map<
  string,
  Map<string, RetrievalCandidate>
>;

function catalogKey(context: RunContext): string {
  return context.runId ?? context.traceId;
}

function toRetrievalCandidate(
  chunk: LoadedChunkCandidate,
  trusted?: RetrievalCandidate,
): RetrievalCandidate {
  const trustedMatches =
    trusted?.chunkId === chunk.chunkId &&
    trusted.documentId === chunk.documentId &&
    trusted.documentVersionId === chunk.documentVersionId &&
    trusted.tenantId === chunk.tenantId;
  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentVersionId: chunk.documentVersionId,
    tenantId: chunk.tenantId,
    text: chunk.text,
    score: trustedMatches ? trusted.score : (chunk.confidenceScore ?? 0),
    pageNumber: chunk.pageNumber,
    sectionTitle: chunk.sectionTitle,
    classification: chunk.classification,
    retrievalMethod: trustedMatches ? trusted.retrievalMethod : "hybrid",
    ...(trustedMatches && trusted.scoreBreakdown
      ? { scoreBreakdown: { ...trusted.scoreBreakdown } }
      : {}),
  };
}

/**
 * True when the evidence bundle was produced by the reranker's deterministic
 * fallback (raw similarity ranking without a real rerank). Such bundles must
 * never approve evidence — they are treated as a reranker failure.
 */
function isRerankerFallback(bundle: EvidenceBundle): boolean {
  if (
    typeof bundle.scoreExplanation === "string" &&
    bundle.scoreExplanation.startsWith("Fallback:")
  ) {
    return true;
  }
  return bundle.sufficiency.reasons.some((reason) =>
    reason.toLowerCase().includes("fallback"),
  );
}

// ── Tool factories ─────────────────────────────────────────────────────────

/**
 * resolve_document_titles — resolves title hints through the injected
 * authorized resolver. No retrieval permission is required at the tool level:
 * per-document `use_in_ai` authorization happens inside the resolver, and
 * inaccessible titles are indistinguishable from nonexistent ones.
 */
export function createResolveDocumentTitlesTool(
  deps: AuthorizedRetrievalDependencies,
): RegisteredTool {
  const handler = async (
    context: RunContext,
    input: unknown,
  ): Promise<unknown> => {
    assertNoTrustedContextFields(input, "resolve_document_titles");
    const parsed = ResolveTitlesInputSchema.parse(input);
    const actor = await resolveTrustedActor(context, deps);

    const hintContext: DocumentHintContext = {
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      tenantObjectId: new mongoose.Types.ObjectId(actor.tenantId),
    };

    const resolution = await deps.resolveDocumentHints(
      [],
      hintContext,
      parsed.titles,
    );

    if (resolution.ambiguousTitleMatches) {
      return {
        status: "ambiguous",
        documentIds: [],
        reasonCode: "AMBIGUOUS_TITLE",
      };
    }
    if (resolution.referencedDocumentIds.length === 0) {
      return {
        status: "no_match",
        documentIds: [],
        reasonCode: "NO_MATCH",
      };
    }
    return {
      status: "one_match",
      documentIds: resolution.referencedDocumentIds,
      reasonCode: "MATCH_FOUND",
    };
  };

  return {
    schema: resolveDocumentTitlesSchema,
    handler,
  };
}

/**
 * authorized_hybrid_search — tenant-scoped hybrid search with authorization.
 * Retrieval candidates and safe metadata only; evidence sufficiency is a
 * separate concern handled by evaluate_evidence.
 */
export function createAuthorizedHybridSearchTool(
  deps: AuthorizedRetrievalDependencies,
  trustedCandidateCatalog?: TrustedCandidateCatalog,
): RegisteredTool {
  const handler = async (
    context: RunContext,
    input: unknown,
  ): Promise<unknown> => {
    assertNoTrustedContextFields(input, "authorized_hybrid_search");
    const parsed = HybridSearchInputSchema.parse(input);
    const actor = await resolveTrustedActor(context, deps);

    try {
      const accessContext = buildAccessContext(actor);
      const query: Parameters<HybridRetrievalService["hybridSearch"]>[0] = {
        queryText: parsed.queryText,
        topK: parsed.topK,
      };
      if (parsed.documentIds && parsed.documentIds.length > 0) {
        query.filter = { documentIds: parsed.documentIds };
      }

      const result = await deps.retrieval.hybridSearch(query, accessContext);
      if (trustedCandidateCatalog) {
        // Bounded, request-private provenance cache. Only the server-produced
        // candidates are retained; the model sees ids and safe metadata only.
        if (trustedCandidateCatalog.size >= 1_000) {
          const oldest = trustedCandidateCatalog.keys().next().value;
          if (oldest) trustedCandidateCatalog.delete(oldest);
        }
        trustedCandidateCatalog.set(
          catalogKey(context),
          new Map(result.candidates.map((candidate) => [candidate.chunkId, candidate])),
        );
      }

      return {
        candidates: result.candidates.map((candidate) => ({
          chunkId: candidate.chunkId,
          documentId: candidate.documentId,
          documentVersionId: candidate.documentVersionId,
          score: candidate.score,
          pageNumber: candidate.pageNumber,
          sectionTitle: candidate.sectionTitle,
          retrievalMethod: candidate.retrievalMethod,
        })),
        totalCandidates: result.totalCandidates,
        reasonCode:
          result.candidates.length > 0 ? "SEARCH_COMPLETED" : "NO_RESULTS",
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        "RETRIEVAL_UNAVAILABLE",
        "Hybrid retrieval failed",
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  };

  return {
    schema: authorizedHybridSearchSchema,
    handler,
  };
}

/**
 * evaluate_evidence — loads the requested candidates server-side, scopes them
 * to the trusted tenant, excludes ineligible records, reauthorizes each
 * document for use_in_ai, then runs the reranker/evidence service.
 *
 * Fails closed: approved evidence ids are only produced by a non-fallback
 * SUFFICIENT bundle; reranker failure, fallback bundles, and every other
 * sufficiency level yield no approved ids.
 */
export function createEvaluateEvidenceTool(
  deps: AuthorizedRetrievalDependencies,
  trustedCandidateCatalog?: TrustedCandidateCatalog,
): RegisteredTool {
  const handler = async (
    context: RunContext,
    input: unknown,
  ): Promise<unknown> => {
    assertNoTrustedContextFields(input, "evaluate_evidence");
    const parsed = EvaluateEvidenceInputSchema.parse(input);
    const actor = await resolveTrustedActor(context, deps);

    const requestedIds = parsed.candidateIds;
    const runCandidates = trustedCandidateCatalog?.get(catalogKey(context));
    trustedCandidateCatalog?.delete(catalogKey(context));

    // 1. Load candidates server-side by id (tenant-scoped).
    const loaded = await deps.loadChunksByIds(actor.tenantId, requestedIds);
    const eligibleChunks = loaded.filter((chunk) =>
      RETRIEVABLE_CHUNK_STATUSES.includes(
        chunk.status as (typeof RETRIEVABLE_CHUNK_STATUSES)[number],
      ),
    );

    // 2. Scope to eligible parent documents (archived/deleted/failed/stale).
    const documentIds = [
      ...new Set(eligibleChunks.map((c) => c.documentId)),
    ];
    let eligibleDocumentIds = new Set<string>();
    if (documentIds.length > 0) {
      const eligibleDocs = await deps.loadEligibleDocumentIds(
        actor.tenantId,
        documentIds,
      );
      eligibleDocumentIds = new Set(eligibleDocs);
    }

    // 3. Reauthorize each candidate document for use_in_ai.
    const authorizedCandidates: RetrievalCandidate[] = [];
    for (const chunk of eligibleChunks) {
      if (!eligibleDocumentIds.has(chunk.documentId)) continue;
      try {
        await deps.authorization.authorizeDocumentAction(
          { tenantId: actor.tenantId, actorId: actor.actorId },
          chunk.documentId,
          "use_in_ai",
        );
      } catch {
        continue;
      }
      authorizedCandidates.push(
        toRetrievalCandidate(chunk, runCandidates?.get(chunk.chunkId)),
      );
    }

    const authorizedIds = new Set(
      authorizedCandidates.map((candidate) => candidate.chunkId),
    );
    const rejectedBase = requestedIds.filter((id) => !authorizedIds.has(id));

    if (authorizedCandidates.length === 0) {
      return {
        sufficiency: "NO_EVIDENCE",
        approvedEvidenceIds: [],
        rejectedEvidenceIds: rejectedBase,
        reasonCode: "NO_EVIDENCE",
      };
    }

    // 4. Run the reranker/evidence service over authorized candidates only.
    let bundle: EvidenceBundle;
    try {
      bundle = await deps.reranker.buildEvidenceBundle(
        authorizedCandidates,
        parsed.question,
        actor.traceId,
      );
    } catch {
      return {
        sufficiency: "NO_EVIDENCE",
        approvedEvidenceIds: [],
        rejectedEvidenceIds: requestedIds,
        reasonCode: "RERANKER_UNAVAILABLE",
      };
    }

    // 5. Fail closed on raw-similarity fallback bundles.
    if (isRerankerFallback(bundle)) {
      return {
        sufficiency: "NO_EVIDENCE",
        approvedEvidenceIds: [],
        rejectedEvidenceIds: requestedIds,
        reasonCode: "RERANKER_UNAVAILABLE",
      };
    }

    const level = bundle.sufficiency.level;
    if (level !== "SUFFICIENT") {
      return {
        sufficiency: level,
        approvedEvidenceIds: [],
        rejectedEvidenceIds: requestedIds,
        reasonCode: `EVIDENCE_${level}`,
      };
    }

    const approved = bundle.items
      .filter(
        (item) => item.scoreBreakdown.totalScore >= EVIDENCE_ITEM_MIN_TOTAL_SCORE,
      )
      .map((item) => item.citationAnchor.chunkId);
    const approvedSet = new Set(approved);
    const rejectedEvidenceIds = requestedIds.filter(
      (id) => !approvedSet.has(id),
    );

    return {
      sufficiency: "SUFFICIENT",
      approvedEvidenceIds: approved,
      rejectedEvidenceIds,
      reasonCode: "EVIDENCE_SUFFICIENT",
    };
  };

  return {
    schema: evaluateEvidenceSchema,
    handler,
  };
}

// ── Registration ────────────────────────────────────────────────────────────

/**
 * Registers all three authorized retrieval/evidence tools onto the given
 * ToolRegistry. Explicit registration — no import-time side effects, no
 * auto-registration. Call once from the server composition root.
 */
export function registerAuthorizedRetrievalTools(
  registry: ToolRegistry,
  deps: AuthorizedRetrievalDependencies,
): void {
  const trustedCandidateCatalog: TrustedCandidateCatalog = new Map();
  registry.register(createResolveDocumentTitlesTool(deps));
  registry.register(createAuthorizedHybridSearchTool(deps, trustedCandidateCatalog));
  registry.register(createEvaluateEvidenceTool(deps, trustedCandidateCatalog));
}

/**
 * Convenience factory returning all three tools as a tuple. Useful for tests
 * and explicit composition without a registry.
 */
export function createAuthorizedRetrievalTools(
  deps: AuthorizedRetrievalDependencies,
): RegisteredTool[] {
  const trustedCandidateCatalog: TrustedCandidateCatalog = new Map();
  return [
    createResolveDocumentTitlesTool(deps),
    createAuthorizedHybridSearchTool(deps, trustedCandidateCatalog),
    createEvaluateEvidenceTool(deps, trustedCandidateCatalog),
  ];
}
