import { AnalyticsService } from "../analytics/analytics.service.js";
import type { IntentQueryService } from "../intent-query/intentQuery.service.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import type { AgentContract } from "./agentContract.js";
import type { ModelAdapter, RegisteredTool } from "./agents.types.js";
import {
  registerAnswerWriterAgentExecutor,
  type AnswerWriterAgentDependencies,
} from "./answerWriterAgent.js";
import { AnswerWriterService } from "./answerWriter.service.js";
import {
  registerCitationVerificationAgentExecutor,
  type CitationVerificationAgentDependencies,
} from "./citationVerificationAgent.js";
import { CitationSemanticVerificationService } from "./citationSemanticVerification.service.js";
import type { CitationSemanticVerificationResult } from "./citationSemanticVerification.service.js";
import { createChatAgentRegistry } from "./chatAgents.js";
import {
  createChatWorkflowRegistry,
  type ChatWorkflowDefinition,
} from "./chatWorkflow.js";
import { registerComplianceAgentExecutor } from "./complianceAgent.js";
import { evaluateCompliance } from "./compliance.service.js";
import { registerIntentQueryAgentExecutor } from "./intentQueryAgent.js";
import {
  ModelAdapterSupervisorDecisionModel,
  SupervisorRuntime,
} from "./supervisorRuntime.js";
import {
  MongoSupervisorPersistence,
  type SupervisorPersistence,
} from "./supervisorPersistence.js";
import { ToolRegistry } from "./toolRegistry.js";
import { createAnalyticsTool } from "./tools/analyticsTool.js";
import {
  registerAuthorizedRetrievalTools,
  type AuthorizedRetrievalDependencies,
} from "./tools/authorizedRetrievalTools.js";

export interface ProductionChatSupervisorDependencies {
  readonly model: ModelAdapter;
  /** Optional dedicated verifier model; must implement the same provider-neutral contract. */
  readonly citationVerifierModel?: ModelAdapter;
  readonly intentQueryService: IntentQueryService;
  readonly authorizedRetrieval: AuthorizedRetrievalDependencies;
  readonly analyticsService?: AnalyticsService;
}

export interface ProductionChatSupervisorComposition {
  readonly runtime: SupervisorRuntime;
  readonly workflow: ChatWorkflowDefinition & {
    readonly id: "chat-rag-v1";
  };
  readonly persistence: SupervisorPersistence;
  readonly executors: readonly AgentContract[];
  readonly tools: readonly RegisteredTool[];
}

/** Isolated content artifact for evaluation observers; never an authoritative verifier reference. */
export type CitationSemanticEvaluationArtifact = Readonly<{
  claims: readonly string[];
  preparedClaims: CitationSemanticVerificationResult["preparedClaims"];
  claimResults: CitationSemanticVerificationResult["claimResults"];
  unsupportedClaims: readonly string[];
  unknownClaims: readonly string[];
  supportingEvidenceIds: readonly string[];
  releasedAnswerText?: string;
  releasedClaimCount: number;
  retryCount: number;
  complete: boolean;
  reasonCode: CitationSemanticVerificationResult["reasonCode"];
  coverage: CitationSemanticVerificationResult["coverage"];
  providerKey?: string;
  modelName?: string;
  totalTokens?: number;
  estimatedCost?: number;
  latencyMs?: number;
}>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export function createCitationSemanticEvaluationArtifact(
  result: CitationSemanticVerificationResult,
): CitationSemanticEvaluationArtifact {
  const artifact = structuredClone({
    claims: result.claims,
    preparedClaims: result.preparedClaims,
    claimResults: result.claimResults,
    unsupportedClaims: result.unsupportedClaims,
    unknownClaims: result.unknownClaims,
    supportingEvidenceIds: result.supportingEvidenceIds,
    ...(result.releasedAnswerText === undefined ? {} : { releasedAnswerText: result.releasedAnswerText }),
    releasedClaimCount: result.releasedClaimCount,
    retryCount: result.retryCount,
    complete: result.complete,
    reasonCode: result.reasonCode,
    coverage: result.coverage,
    ...(result.providerKey === undefined ? {} : { providerKey: result.providerKey }),
    ...(result.modelName === undefined ? {} : { modelName: result.modelName }),
    ...(result.totalTokens === undefined ? {} : { totalTokens: result.totalTokens }),
    ...(result.estimatedCost === undefined ? {} : { estimatedCost: result.estimatedCost }),
    ...(result.latencyMs === undefined ? {} : { latencyMs: result.latencyMs }),
  });
  return deepFreeze(artifact);
}

export function notifyCitationSemanticEvaluationObserver(
  observer: ((artifact: CitationSemanticEvaluationArtifact) => void) | undefined,
  result: CitationSemanticVerificationResult,
): void {
  try {
    observer?.(createCitationSemanticEvaluationArtifact(result));
  } catch {
    // Observers are advisory and cannot weaken or fail verification.
  }
}

export interface ChatSupervisorCompositionOptions {
  /** Defaults to production Mongo persistence. Evaluation supplies in-memory persistence. */
  readonly persistence?: SupervisorPersistence;
  /** Advisory observation only; failures never alter verifier safety decisions. */
  readonly onCitationSemanticVerification?: (
    artifact: CitationSemanticEvaluationArtifact,
  ) => void;
}

/**
 * Constructs the production chat supervisor without starting a request. Every
 * invocation owns fresh registries and a runtime; request context, hooks, and
 * AgentRun creation remain the caller's responsibility.
 */
export function createChatSupervisorComposition(
  deps: ProductionChatSupervisorDependencies,
  options: ChatSupervisorCompositionOptions = {},
): ProductionChatSupervisorComposition {
  const executorRegistry = new AgentExecutorRegistry(createChatAgentRegistry());
  const toolRegistry = new ToolRegistry();
  const workflowRegistry = createChatWorkflowRegistry();
  const persistence = options.persistence ?? new MongoSupervisorPersistence();

  registerIntentQueryAgentExecutor(
    executorRegistry,
    deps.intentQueryService,
  );

  const evidenceDependencies: Pick<
    AnswerWriterAgentDependencies & CitationVerificationAgentDependencies,
    "loadChunksByIds" | "loadEligibleDocumentIds" | "authorization"
  > = {
    loadChunksByIds: deps.authorizedRetrieval.loadChunksByIds,
    loadEligibleDocumentIds: deps.authorizedRetrieval.loadEligibleDocumentIds,
    authorization: deps.authorizedRetrieval.authorization,
  };

  registerAnswerWriterAgentExecutor(executorRegistry, {
    ...evidenceDependencies,
    answerWriter: new AnswerWriterService(deps.model),
  });
  const semanticVerifier = new CitationSemanticVerificationService(
    deps.citationVerifierModel ?? deps.model,
  );
  registerCitationVerificationAgentExecutor(
    executorRegistry,
    {
      ...evidenceDependencies,
      semanticVerifier: {
        verify: async (input) => {
          const result = await semanticVerifier.verify(input);
          notifyCitationSemanticEvaluationObserver(
            options.onCitationSemanticVerification,
            result,
          );
          return result;
        },
      },
    },
  );
  registerComplianceAgentExecutor(executorRegistry, {
    evaluate: evaluateCompliance,
  });

  registerAuthorizedRetrievalTools(toolRegistry, deps.authorizedRetrieval);
  toolRegistry.register(
    createAnalyticsTool(deps.analyticsService ?? new AnalyticsService()),
  );

  const runtime = new SupervisorRuntime({
    model: new ModelAdapterSupervisorDecisionModel(deps.model),
    workflowRegistry,
    executorRegistry,
    toolRegistry,
    persistence,
  });

  return {
    runtime,
    workflow: workflowRegistry.require("chat-rag-v1"),
    persistence,
    executors: Object.freeze(executorRegistry.listExecutors()),
    tools: Object.freeze(toolRegistry.list()),
  };
}

export function createProductionChatSupervisorComposition(
  deps: ProductionChatSupervisorDependencies,
): ProductionChatSupervisorComposition {
  return createChatSupervisorComposition(deps);
}
