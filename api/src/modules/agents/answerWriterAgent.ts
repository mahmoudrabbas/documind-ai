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
  AnswerWriterInputSchema,
  AnswerWriterOutputSchema,
  type AnswerWriterOutput,
} from "./chatAgentIO.js";
import {
  AnswerWriterService,
  insufficientEvidenceMessage,
  type AnswerWriterEvidenceItem,
} from "./answerWriter.service.js";
import {
  RETRIEVABLE_CHUNK_STATUSES,
  type LoadedChunkCandidate,
} from "./tools/authorizedRetrievalTools.js";

export const ANSWER_WRITER_AGENT_ID = "answer-writer-agent";
export const ANSWER_WRITER_AGENT_VERSION = "1.0.0";

/**
 * Trusted dependencies injected from the composition root. The executor never
 * reaches into a module-level singleton: production wiring passes resolved
 * instances explicitly, tests inject deterministic stubs.
 */
export interface AnswerWriterAgentDependencies {
  /**
   * Provider-neutral answer generator. Produces the canonical
   * {decision, answer, citedChunkIds} contract from server-loaded evidence.
   */
  readonly answerWriter: AnswerWriterService;
  /**
   * Tenant-scoped chunk loader. Evidence text is loaded server-side by id —
   * never accepted from the model — so unknown or cross-tenant chunk ids
   * resolve to nothing.
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
   * trusts that approved evidence ids remain authorized.
   */
  readonly authorization: DocumentAccessAuthorizationService;
}

/**
 * Controlled error mapping. AppError codes are preserved as-is so the
 * supervisor sees the same controlled codes the chat path produces
 * (LLM_PROVIDER_UNAVAILABLE, LLM_RATE_LIMITED, LLM_TIMEOUT, ...). 401/403
 * AppErrors surface as "unauthorized"; anything else (unexpected provider/DB
 * failures) collapses to AGENT_PROVIDER_ERROR so no raw error detail leaks
 * beyond the run trace.
 */
export function mapAnswerWriterAgentError(caught: unknown): {
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
    message: "Answer generation failed",
  };
}

/**
 * Real, traced answer-writer-agent. Loads authorized evidence server-side for
 * the approved chunk ids, reauthorizes each parent document for use_in_ai, and
 * generates a grounded answer through the shared AnswerWriterService.
 *
 * Fails closed:
 * - empty / unknown / unauthorized evidence yields the localized
 *   insufficient_evidence message without calling the generator;
 * - invalid / unusable generation content — empty provider output, empty or
 *   sanitization-collapsed structured answers, parse-failure fallback text, or
 *   a grounded_answer with no cited chunks — completes with the same localized
 *   message; it is never passed through and never treated as a provider
 *   failure;
 * - only genuinely thrown provider/infrastructure errors produce a failed
 *   AgentResult, preserving provider/AppError semantics;
 * - the model can never supply chunk text or similarity scores — only chunk
 *   ids, and only ids already approved by the evidence tool.
 */
export class AnswerWriterAgentExecutor implements AgentContract {
  readonly id = toAgentId(ANSWER_WRITER_AGENT_ID);
  readonly version = ANSWER_WRITER_AGENT_VERSION;
  readonly capabilities = ["read", "generate"] as const;
  readonly inputSchema = AnswerWriterInputSchema;
  readonly outputSchema = AnswerWriterOutputSchema;

  private readonly deps: AnswerWriterAgentDependencies;

  constructor(options: { deps: AnswerWriterAgentDependencies }) {
    this.deps = options.deps;
  }

  async execute(
    context: AgentRunContext,
    input: unknown,
  ): Promise<AgentResult<AnswerWriterOutput>> {
    const startedAt = Date.now();
    const parsed = AnswerWriterInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        status: "failed",
        error: {
          code: AGENT_CONTRACT_INVALID,
          message: "Invalid answer writer agent input",
        },
        latencyMs: Date.now() - startedAt,
      };
    }
    const agentInput = parsed.data;

    try {
      const evidence = await this.loadAuthorizedEvidence(
        context,
        agentInput.approvedEvidenceIds ?? [],
      );

      if (evidence.length === 0) {
        return {
          ok: true,
          status: "completed",
          output: {
            decision: "insufficient_evidence",
            answer: insufficientEvidenceMessage(agentInput.language ?? "en"),
            citedChunkIds: [],
          },
          latencyMs: Date.now() - startedAt,
        };
      }

      const generated = await this.deps.answerWriter.generate({
        conversationId: agentInput.conversationId,
        question: agentInput.question,
        language: agentInput.language ?? "en",
        task: agentInput.task,
        citationsEnabled: agentInput.citationsEnabled,
        evidence,
        maxTokens: agentInput.maxTokens,
        maxTotalTokens: context.maxTokens,
      });

      const safeAnswer = insufficientEvidenceMessage(agentInput.language ?? "en");
      const metadata = {
        modelProvider: generated.providerKey,
        modelName: generated.modelName,
        tokensUsed: generated.totalTokens,
        estimatedCost: generated.estimatedCost,
        latencyMs: generated.latencyMs,
      };

      // Invalid / unusable model content is not a provider failure: it
      // completes fail-closed with the localized message instead of surfacing
      // the model's text. Only genuinely thrown provider/infrastructure
      // errors reach mapAnswerWriterAgentError below.
      const failClosedOutput = {
        ok: true as const,
        status: "completed" as const,
        output: {
          decision: "insufficient_evidence" as const,
          answer: safeAnswer,
          citedChunkIds: [] as string[],
        },
        latencyMs: Date.now() - startedAt,
        metadata,
      };

      // Unusable covers empty provider content, empty structured answers, and
      // sanitization collapsing to empty content.
      if (generated.outcome === "unusable") {
        return failClosedOutput;
      }

      // Usable but not a valid grounded generation:
      // - !structured: the parse-failure fallback carries raw model text that
      //   never satisfied the contract (plain prose, malformed JSON, unknown
      //   decision, unknown keys);
      // - parsedDecision grounded_answer with zero cited chunks: the model
      //   claimed a grounded answer with nothing to support it (missing or
      //   empty citedChunkIds).
      if (
        !generated.structured ||
        (generated.parsedDecision === "grounded_answer" &&
          generated.citedChunkIds.length === 0)
      ) {
        return failClosedOutput;
      }

      return {
        ok: true,
        status: "completed",
        output: {
          decision: generated.decision,
          answer: generated.answer,
          citedChunkIds: generated.citedChunkIds,
        },
        latencyMs: Date.now() - startedAt,
        metadata,
      };
    } catch (caught) {
      const mapped = mapAnswerWriterAgentError(caught);
      return {
        ok: false,
        status: mapped.status,
        error: { code: mapped.code, message: mapped.message },
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  /**
   * Server-side evidence resolution. Loads the requested chunks by id, scopes
   * them to the trusted tenant, excludes ineligible records, and reauthorizes
   * each parent document for use_in_ai. Any failure drops the chunk.
   */
  private async loadAuthorizedEvidence(
    context: AgentRunContext,
    approvedEvidenceIds: readonly string[],
  ): Promise<AnswerWriterEvidenceItem[]> {
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

    const items: AnswerWriterEvidenceItem[] = [];
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
      items.push({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentVersionId: chunk.documentVersionId,
        text: chunk.text,
        pageNumber: chunk.pageNumber,
        sectionTitle: chunk.sectionTitle,
      });
    }
    return items;
  }
}

/**
 * Explicit registration helper. Production wiring passes the resolved
 * dependencies; the registry rejects the agent unless its approved definition
 * is active.
 */
export function registerAnswerWriterAgentExecutor(
  registry: AgentExecutorRegistry,
  deps: AnswerWriterAgentDependencies,
): AgentDefinition {
  return registry.register(new AnswerWriterAgentExecutor({ deps }));
}
