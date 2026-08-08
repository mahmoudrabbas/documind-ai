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
  readonly intentQueryService: IntentQueryService;
  readonly authorizedRetrieval: AuthorizedRetrievalDependencies;
  readonly analyticsService?: AnalyticsService;
}

export interface ProductionChatSupervisorComposition {
  readonly runtime: SupervisorRuntime;
  readonly workflow: ChatWorkflowDefinition;
  readonly persistence: SupervisorPersistence;
  readonly executors: readonly AgentContract[];
  readonly tools: readonly RegisteredTool[];
}

/**
 * Constructs the production chat supervisor without starting a request. Every
 * invocation owns fresh registries and a runtime; request context, hooks, and
 * AgentRun creation remain the caller's responsibility.
 */
export function createProductionChatSupervisorComposition(
  deps: ProductionChatSupervisorDependencies,
): ProductionChatSupervisorComposition {
  const executorRegistry = new AgentExecutorRegistry(createChatAgentRegistry());
  const toolRegistry = new ToolRegistry();
  const workflowRegistry = createChatWorkflowRegistry();
  const persistence = new MongoSupervisorPersistence();

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
  registerCitationVerificationAgentExecutor(
    executorRegistry,
    evidenceDependencies,
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
