import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_CONTRACT_INVALID,
  AGENT_PROVIDER_ERROR,
} from "../../common/errors/errorCodes.js";
import type { QueryPlan, QueryRouteValue } from "../intent-query/intentQuery.types.js";
import type { IntentQueryService } from "../intent-query/intentQuery.service.js";
import type { AgentContract, AgentResult } from "./agentContract.js";
import { toAgentId } from "./agentContracts.js";
import type { AgentDefinition } from "./agentDefinition.schema.js";
import type { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import type { AgentRunContext } from "./agentRunContext.js";
import {
  IntentAgentInputSchema,
  IntentAgentOutputSchema,
  type IntentAgentOutput,
} from "./chatAgentIO.js";

export const INTENT_QUERY_AGENT_ID = "intent-query-agent";
export const INTENT_QUERY_AGENT_VERSION = "1.1.0";

/**
 * Deterministic reason code per route, mirroring the canonical codes used by
 * the existing chat routing path (chat.service.ts) so consumers see one
 * taxonomy, never a parallel one.
 */
export const INTENT_QUERY_ROUTE_REASON_CODES: Record<QueryRouteValue, string> = {
  assistant: "ASSISTANT_INTENT",
  rag: "RAG_REQUIRED",
  social: "SOCIAL_INTENT",
  clarification: "CLARIFICATION_REQUIRED",
  unsupported: "UNSUPPORTED_INTENT",
  unsafe: "UNSAFE_INTENT",
};

/**
 * Converts the existing service's full QueryPlan into the strict
 * IntentAgentOutput contract. Retrieval-only fields are emitted for the rag
 * route only: social / unsupported / unsafe / clarification must never leak an
 * executable retrieval plan.
 */
export function mapQueryPlanToAgentOutput(plan: QueryPlan): IntentAgentOutput {
  const route = plan.route;
  const retrievable = route === "rag";
  const output: IntentAgentOutput = {
    normalizedQuestion: plan.normalizedQuestion,
    language: plan.language,
    route,
    intent: plan.detectedIntent,
    assistantKind: plan.assistantKind,
    intentConfidence: plan.intentConfidence,
    referencedDocumentIds: plan.referencedDocumentIds,
    clarificationNeeded: plan.clarificationNeeded,
    clarification: plan.clarification,
    isFollowUp: plan.isFollowUp,
    conversationContextUsed: plan.conversationContextUsed,
    reasonCode: INTENT_QUERY_ROUTE_REASON_CODES[route],
    semanticQueries: retrievable ? plan.semanticQueries : [],
    keywordQueries: retrievable ? plan.keywordQueries : [],
    exactTerms: retrievable ? plan.exactTerms : [],
    entities: plan.entities,
    referencedDocumentTitles: retrievable ? plan.referencedDocumentTitles : [],
    temporalConstraints: plan.temporalConstraints,
    departments: retrievable ? plan.departments : [],
    categories: retrievable ? plan.categories : [],
  };
  if (route === "social") {
    output.socialSubtype = plan.socialSubtype;
  }
  return output;
}

/**
 * Controlled error mapping. AppError codes are preserved as-is so the
 * supervisor sees the same controlled codes the chat path produces
 * (AUTHENTICATION/PERMISSION, RATE_LIMITED, ENTITLEMENT_EXCEEDED,
 * INTENT_QUERY_*). 401/403 AppErrors surface as "unauthorized"; anything else
 * (unexpected provider/DB failures) collapses to AGENT_PROVIDER_ERROR so no
 * raw error detail leaks beyond the run trace.
 */
export function mapIntentQueryAgentError(caught: unknown): {
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
    message: "Intent query analysis failed",
  };
}

export interface IntentQueryAgentExecutorOptions {
  /**
   * The IntentQueryService instance to use. The executor never reaches into a
   * module-level singleton: production wiring passes the resolved service
   * explicitly, tests inject a deterministic service.
   */
  service: IntentQueryService;
}

/**
 * Real, traced intent-query-agent. It actually invokes the existing
 * IntentQueryService end-to-end (validation, authorization, LLM analysis,
 * fallback, metrics, audit) and maps the resulting QueryPlan into the strict
 * IntentAgentOutput contract.
 */
export class IntentQueryAgentExecutor
  implements AgentContract
{
  readonly id = toAgentId(INTENT_QUERY_AGENT_ID);
  readonly version = INTENT_QUERY_AGENT_VERSION;
  readonly capabilities = ["read"] as const;
  readonly inputSchema = IntentAgentInputSchema;
  readonly outputSchema = IntentAgentOutputSchema;

  private readonly service: IntentQueryService;

  constructor(options: IntentQueryAgentExecutorOptions) {
    this.service = options.service;
  }

  async execute(
    context: AgentRunContext,
    input: unknown,
  ): Promise<AgentResult<IntentAgentOutput>> {
    const startedAt = Date.now();
    const parsed = IntentAgentInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        status: "failed",
        error: {
          code: AGENT_CONTRACT_INVALID,
          message: "Invalid intent agent input",
        },
        latencyMs: Date.now() - startedAt,
      };
    }
    const intentInput = parsed.data;
    try {
      const plan = await this.service.analyzeQuery(
        {
          question: intentInput.question,
          conversationId: intentInput.conversationId,
          language: intentInput.language,
          referencedDocumentIds: intentInput.referencedDocumentIds,
          currentMessageAlreadyPersisted: true,
          maxTokens: Math.min(1000, context.maxTokens ?? 1000),
          maxContext: 5,
        },
        {
          tenantId: context.tenantId,
          actorId: context.actorId,
          actorEmail: context.actorEmail,
          actorRole: context.actorRole,
          traceId: context.traceId,
          requestId: context.requestId,
        },
        {
          tokenAccounting: "external",
        },
      );
      return {
        ok: true,
        status: "completed",
        output: mapQueryPlanToAgentOutput(plan),
        latencyMs: Date.now() - startedAt,
        metadata: {
          modelProvider: plan.modelVersion,
          modelName: plan.modelVersion,
          promptVersion: plan.promptVersion,
          promptVersionId: null,
          tokensUsed: plan.processingMetadata.tokensUsed,
          estimatedCost: plan.processingMetadata.estimatedCost,
          latencyMs: plan.processingMetadata.latencyMs,
        },
      };
    } catch (caught) {
      const mapped = mapIntentQueryAgentError(caught);
      return {
        ok: false,
        status: mapped.status,
        error: { code: mapped.code, message: mapped.message },
        latencyMs: Date.now() - startedAt,
      };
    }
  }
}

/**
 * Explicit registration helper. Production wiring passes the resolved
 * IntentQueryService instance; the registry rejects the agent unless its
 * approved definition is active.
 */
export function registerIntentQueryAgentExecutor(
  registry: AgentExecutorRegistry,
  service: IntentQueryService,
): AgentDefinition {
  return registry.register(new IntentQueryAgentExecutor({ service }));
}
