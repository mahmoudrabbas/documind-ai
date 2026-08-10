import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_CONTRACT_INVALID,
  AGENT_PROVIDER_ERROR,
} from "../../common/errors/errorCodes.js";
import type { DocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import type { AgentContract, AgentResult } from "./agentContract.js";
import { toAgentId } from "./agentContracts.js";
import type { AgentDefinition } from "./agentDefinition.schema.js";
import type { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import type { AgentRunContext } from "./agentRunContext.js";
import {
  CitationVerifierInputSchema,
  CitationVerifierOutputSchema,
  type CitationVerifierOutput,
} from "./chatAgentIO.js";
import { CitationVerificationService } from "./citationVerification.service.js";
import type { CitationSemanticVerifier } from "./citationSemanticVerification.service.js";
import {
  RETRIEVABLE_CHUNK_STATUSES,
  type LoadedChunkCandidate,
} from "./tools/authorizedRetrievalTools.js";

export const CITATION_VERIFICATION_AGENT_ID = "citation-verification-agent";
export const CITATION_VERIFICATION_AGENT_VERSION = "1.4.0";

/**
 * Trusted dependencies injected from the composition root. The executor never
 * reaches into a module-level singleton: production wiring passes resolved
 * instances explicitly, tests inject deterministic stubs.
 */
export interface CitationVerificationAgentDependencies {
  /**
   * Tenant-scoped chunk loader. Evidence is loaded server-side by id — never
   * accepted from the model — so unknown or cross-tenant chunk ids resolve to
   * nothing.
   */
  readonly loadChunksByIds: (
    tenantId: string,
    chunkIds: readonly string[],
  ) => Promise<readonly LoadedChunkCandidate[]>;
  /**
   * Document eligibility check: only tenant-owned, non-archived, non-deleted,
   * non-failed, non-stale documents may contribute evidence.
   */
  readonly loadEligibleDocumentIds: (
    tenantId: string,
    documentIds: readonly string[],
  ) => Promise<readonly string[]>;
  /**
   * Per-document reauthorization for the use_in_ai action. The agent never
   * trusts that approved evidence ids remain authorized between the evidence
   * tool's approval and verification time (TOCTOU guard).
   */
  readonly authorization: DocumentAccessAuthorizationService;
  /** Semantic support judge over only the reauthorized, cited evidence. */
  readonly semanticVerifier: CitationSemanticVerifier;
}

/**
 * Controlled error mapping. AppError codes are preserved as-is so the
 * supervisor sees the same controlled codes the chat path produces. 401/403
 * AppErrors surface as "unauthorized"; anything else (unexpected DB failures)
 * collapses to AGENT_PROVIDER_ERROR so no raw error detail leaks beyond the
 * run trace.
 */
export function mapCitationVerificationAgentError(caught: unknown): {
  status: "failed" | "unauthorized" | "cancelled" | "timeout";
  code: string;
  message: string;
} {
  if (caught instanceof AppError) {
    const unauthorized =
      caught.statusCode === 401 || caught.statusCode === 403;
    return {
      status: unauthorized ? "unauthorized" : "failed",
      code: caught.code,
      message: caught.message,
    };
  }
  return {
    status: "failed",
    code: AGENT_PROVIDER_ERROR,
    message: "Citation verification failed",
  };
}

/**
 * Real, traced citation-verification-agent. Deterministic membership and
 * authorization checks run before the bounded semantic support judge.
 *
 * Fails closed:
 * - the evidence set is re-authorized server-side (tenant scope, document
 *   eligibility, per-document use_in_ai) so a grounded answer can only keep
 *   citations that are still authorized at verification time;
 * - a grounded answer with no surviving valid citation yields verified:false
 *   (MISSING_CITATIONS) so the consumer downgrades the answer;
 * - non-grounded decisions are skipped (CITATIONS_SKIPPED, verified:true)
 *   with zero citations;
 * - only genuinely thrown infrastructure/authorization errors produce a
 *   failed AgentResult.
 */
export class CitationVerificationAgentExecutor implements AgentContract {
  readonly id = toAgentId(CITATION_VERIFICATION_AGENT_ID);
  readonly version = CITATION_VERIFICATION_AGENT_VERSION;
  readonly capabilities = ["read", "search"] as const;
  readonly inputSchema = CitationVerifierInputSchema;
  readonly outputSchema = CitationVerifierOutputSchema;

  private readonly deps: CitationVerificationAgentDependencies;

  constructor(options: {
    deps: CitationVerificationAgentDependencies;
  }) {
    this.deps = options.deps;
  }

  async execute(
    context: AgentRunContext,
    input: unknown,
  ): Promise<AgentResult<CitationVerifierOutput>> {
    const startedAt = Date.now();
    const parsed = CitationVerifierInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        status: "failed",
        error: {
          code: AGENT_CONTRACT_INVALID,
          message: "Invalid citation verifier agent input",
        },
        latencyMs: Date.now() - startedAt,
      };
    }
    const agentInput = parsed.data;

    try {
      // Non-grounded decisions carry no claims to validate: skip without
      // touching the evidence layer.
      if (agentInput.decision !== "grounded_answer") {
        return {
          ok: true,
          status: "completed",
          output: CitationVerificationService.verify(agentInput),
          latencyMs: Date.now() - startedAt,
        };
      }

      const authorizedChunks = await this.loadAuthorizedChunks(
        context,
        agentInput.approvedEvidenceIds ?? [],
      );

      const membership = CitationVerificationService.verify({
        ...agentInput,
        approvedEvidenceIds: authorizedChunks.map((chunk) => chunk.chunkId),
      });
      if (!membership.verified) {
        return {
          ok: true,
          status: "completed",
          output: membership,
          latencyMs: Date.now() - startedAt,
        };
      }

      const validated = new Set(membership.validatedCitationIds);
      const semantic = await this.deps.semanticVerifier.verify({
        answerText: agentInput.answerText ?? "",
        questionText: agentInput.questionText,
        evidence: authorizedChunks
          .filter((chunk) => validated.has(chunk.chunkId))
          .map((chunk) => ({ chunkId: chunk.chunkId, text: chunk.text })),
      });
      if (semantic.reasonCode === "VERIFICATION_BOUNDS_EXCEEDED") {
        return {
          ok: true,
          status: "completed",
          output: {
            ...membership,
            verified: false,
            validatedCitationIds: [],
            rejectedCitationIds: [...new Set([
              ...membership.rejectedCitationIds,
              ...membership.validatedCitationIds,
            ])],
            unsupportedClaims: [],
            reasonCode: "VERIFICATION_BOUNDS_EXCEEDED",
          },
          latencyMs: Date.now() - startedAt,
        };
      }
      const unsupportedClaims = [...semantic.unsupportedClaims];
      const supportingIds = new Set(semantic.supportingEvidenceIds);
      const validatedCitationIds = unsupportedClaims.length > 0
        ? [...membership.validatedCitationIds]
        : membership.validatedCitationIds.filter((id) => supportingIds.has(id));
      const rejectedCitationIds = unsupportedClaims.length > 0
        ? [...membership.rejectedCitationIds]
        : [...new Set([
            ...membership.rejectedCitationIds,
            ...membership.validatedCitationIds.filter((id) => !supportingIds.has(id)),
          ])];
      const output: CitationVerifierOutput = {
        ...membership,
        verified:
          unsupportedClaims.length === 0 && validatedCitationIds.length > 0,
        validatedCitationIds,
        rejectedCitationIds,
        unsupportedClaims,
        reasonCode:
          unsupportedClaims.length === 0 && validatedCitationIds.length > 0
            ? "CITATIONS_VERIFIED"
            : "UNSUPPORTED_CLAIMS",
      };
      return {
        ok: true,
        status: "completed",
        output,
        latencyMs: Date.now() - startedAt,
        ...(semantic.providerKey
          ? {
              metadata: {
                modelProvider: semantic.providerKey,
                modelName: semantic.modelName,
                tokensUsed: semantic.totalTokens,
                estimatedCost: semantic.estimatedCost,
                latencyMs: semantic.latencyMs,
              },
            }
          : {}),
      };
    } catch (caught) {
      const mapped = mapCitationVerificationAgentError(caught);
      return {
        ok: false,
        status: mapped.status,
        error: { code: mapped.code, message: mapped.message },
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  /**
   * Server-side reauthorization of the approved evidence ids. Loads the chunks
   * by id, scopes them to the trusted tenant, excludes ineligible records, and
   * reauthorizes each parent document for use_in_ai. Any failure drops the
   * chunk. Returns the ids that remain authorized at verification time.
   */
  private async loadAuthorizedChunks(
    context: AgentRunContext,
    approvedEvidenceIds: readonly string[],
  ): Promise<LoadedChunkCandidate[]> {
    if (approvedEvidenceIds.length === 0) return [];

    const loaded = await this.deps.loadChunksByIds(
      context.tenantId,
      approvedEvidenceIds,
    );
    const eligibleChunks = loaded.filter((chunk) =>
      RETRIEVABLE_CHUNK_STATUSES.includes(
        chunk.status as (typeof RETRIEVABLE_CHUNK_STATUSES)[number],
      ),
    );

    const documentIds = [...new Set(eligibleChunks.map((c) => c.documentId))];
    let eligibleDocumentIds = new Set<string>();
    if (documentIds.length > 0) {
      const eligibleDocs = await this.deps.loadEligibleDocumentIds(
        context.tenantId,
        documentIds,
      );
      eligibleDocumentIds = new Set(eligibleDocs);
    }

    const authorizedChunks: LoadedChunkCandidate[] = [];
    for (const chunk of eligibleChunks) {
      if (!eligibleDocumentIds.has(chunk.documentId)) continue;
      try {
        await this.deps.authorization.authorizeDocumentAction(
          { tenantId: context.tenantId, actorId: context.actorId },
          chunk.documentId,
          "use_in_ai",
        );
      } catch {
        continue;
      }
      authorizedChunks.push(chunk);
    }
    return authorizedChunks;
  }
}

/**
 * Explicit registration helper. Production wiring passes the resolved
 * dependencies; the registry rejects the agent unless its approved definition
 * is active.
 */
export function registerCitationVerificationAgentExecutor(
  registry: AgentExecutorRegistry,
  deps: CitationVerificationAgentDependencies,
): AgentDefinition {
  return registry.register(new CitationVerificationAgentExecutor({ deps }));
}
