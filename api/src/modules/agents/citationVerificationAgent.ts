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
import {
  RETRIEVABLE_CHUNK_STATUSES,
  type LoadedChunkCandidate,
} from "./tools/authorizedRetrievalTools.js";

export const CITATION_VERIFICATION_AGENT_ID = "citation-verification-agent";
export const CITATION_VERIFICATION_AGENT_VERSION = "1.0.0";

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
 * Real, traced citation-verification-agent. Deterministic and provider-free:
 * it never calls an LLM, so it reports no model/provider/token metadata and
 * the supervisor persists null model fields for its step.
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

      const authorizedIds = await this.loadAuthorizedChunkIds(
        context,
        agentInput.approvedEvidenceIds ?? [],
      );

      const output = CitationVerificationService.verify({
        ...agentInput,
        approvedEvidenceIds: authorizedIds,
      });
      return {
        ok: true,
        status: "completed",
        output,
        latencyMs: Date.now() - startedAt,
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
  private async loadAuthorizedChunkIds(
    context: AgentRunContext,
    approvedEvidenceIds: readonly string[],
  ): Promise<string[]> {
    if (approvedEvidenceIds.length === 0) return [];

    const loaded = await this.deps.loadChunksByIds(
      context.tenantId,
      approvedEvidenceIds,
    );
    const eligibleChunks = loaded.filter(
      (chunk) =>
        chunk.allowAiUse &&
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

    const authorizedIds: string[] = [];
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
      authorizedIds.push(chunk.chunkId);
    }
    return authorizedIds;
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
