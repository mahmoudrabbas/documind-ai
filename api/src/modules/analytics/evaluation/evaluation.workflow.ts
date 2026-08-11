import { createHash } from "node:crypto";
import type { BaseRole } from "../../../common/auth/baseRoles.js";
import { AppError } from "../../../common/errors/AppError.js";
import type {
  OperationAuthorizationContext,
  ResolvedOperationAuthorizationContext,
} from "../../permissions/permissions.operation.js";
import type { PermissionEvaluator, PermissionScopes } from "../../permissions/permissions.types.js";
import {
  createChatSupervisorComposition,
  type ProductionChatSupervisorDependencies,
} from "../../agents/chatSupervisorComposition.js";
import type { CitationSemanticVerificationResult } from "../../agents/citationSemanticVerification.service.js";
import type { CitationSemanticEvaluationArtifact } from "../../agents/chatSupervisorComposition.js";
import { InMemorySupervisorPersistence } from "../../agents/supervisorPersistence.js";
import type { HybridRetrievalArtifacts } from "../../retrieval/retrieval.service.js";
import {
  ChatWorkflowService,
  type ChatWorkflowExecutionArtifacts,
  type ChatWorkflowRepository,
} from "../../chat/chatWorkflowService.js";
import type { JudgeEvidence } from "../llmJudge.types.js";
import type { RagEvaluationCaseV2 } from "./evaluation.schemas.js";

export interface RagEvaluationExecutionContext {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  baseRole: BaseRole;
  customRoleId?: string | null;
  permissionScopes?: PermissionScopes;
  /** Tenant-resolved taxonomy names converted to scenario semantic keys. */
  permissionDepartmentSemanticKeys?: readonly string[];
  /** Independently resolved effective DOCUMENTS_USE_IN_AI grant state. */
  documentsUseInAiGranted?: boolean;
  language: "ar" | "en" | "mixed";
  question: string;
  evaluationId: string;
  traceId: string;
}

export type EvaluationFailureKind =
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "authorization_invariant"
  | "workflow_failed";

export interface RagWorkflowExecution {
  status: "completed" | "failed";
  artifacts: ChatWorkflowExecutionArtifacts | null;
  semanticVerification: CitationSemanticVerificationResult | null;
  retrievalArtifacts: HybridRetrievalArtifacts | null;
  /** Explicit evaluation content artifact; may contain the final answer text. */
  finalAnswer: string;
  /** Explicit evaluation content artifact; may contain authorized evidence text in memory only. */
  judgeEvidence: JudgeEvidence[];
  authorizationByChunkId: ReadonlyMap<string, boolean>;
  provider: string;
  model: string;
  errorCode: string | null;
  failureKind: EvaluationFailureKind | null;
  /** Evaluation artifact only; never changes production verification or release. */
  exhaustiveDocumentCoverage?: boolean;
}

export interface RagEvaluationWorkflow {
  execute(
    evaluationCase: RagEvaluationCaseV2,
    context: RagEvaluationExecutionContext,
  ): Promise<RagWorkflowExecution>;
  isolationSnapshot?(): EvaluationIsolationSnapshot;
}

export interface EvaluationIsolationSnapshot {
  conversations: number;
  messages: number;
  supervisorRuns: number;
  supervisorSteps: number;
  supervisorToolCalls: number;
  supervisorApprovals: number;
  durableAgentRuns: number;
}

interface InMemoryChatRecord {
  _id: string;
  userId: string;
}

class EvaluationChatRepository implements ChatWorkflowRepository {
  readonly conversations = new Map<string, InMemoryChatRecord>();
  readonly messages: Array<{ role: "user" | "assistant" }> = [];
  private nextConversationId = "000000000000000000000000";

  setConversationId(id: string): void {
    this.nextConversationId = id;
  }

  createConversation(_tenantId: string, actorId: string): Promise<InMemoryChatRecord> {
    const record = { _id: this.nextConversationId, userId: actorId };
    this.conversations.set(record._id, record);
    return Promise.resolve(record);
  }

  getConversationById(
    _tenantId: string,
    conversationId: string,
  ): Promise<InMemoryChatRecord | null> {
    return Promise.resolve(this.conversations.get(conversationId) ?? null);
  }

  countMessages(): Promise<number> {
    return Promise.resolve(this.messages.length);
  }

  addMessage(
    _tenantId: string,
    _conversationId: string,
    role: "user" | "assistant",
  ): Promise<{ _id: string }> {
    this.messages.push({ role });
    return Promise.resolve({ _id: `evaluation-message-${this.messages.length}` });
  }
}

export interface IsolatedProductionRagWorkflowDependencies {
  production: ProductionChatSupervisorDependencies;
  authorize: (
    context: OperationAuthorizationContext,
  ) => Promise<ResolvedOperationAuthorizationContext>;
  permissionEvaluator: PermissionEvaluator;
  loadPersistedActor: (
    tenantId: string,
    actorId: string,
  ) => Promise<{
    tenantId: string;
    actorId: string;
    baseRole: BaseRole;
    customRoleId: string | null;
    status: string;
  } | null>;
  loadSettings: (tenantId: string) => Promise<{
    citationsEnabled: boolean;
    maxTokens: number;
  }>;
  loadDocumentTitles: (
    tenantId: string,
    documentIds: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
  consumeRetrievalArtifacts?: () => HybridRetrievalArtifacts | null;
  runMetadata: { modelProvider: string; modelName: string };
  /** Optional evaluation-only observer; exceptions are isolated by ChatWorkflowService. */
  onEvaluationArtifacts?: (artifacts: ChatWorkflowExecutionArtifacts) => void;
}

function deterministicObjectId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function mapFailure(error: unknown): {
  code: string;
  kind: EvaluationFailureKind;
} {
  const code = error instanceof AppError ? error.code : "EVALUATION_WORKFLOW_FAILED";
  if (code === "LLM_RATE_LIMITED") return { code, kind: "rate_limited" };
  if (code === "LLM_PROVIDER_UNAVAILABLE") {
    return { code, kind: "provider_unavailable" };
  }
  if (code === "LLM_TIMEOUT") return { code, kind: "timeout" };
  if (code === "CHAT_WORKFLOW_AUTHORITY_INVALID") {
    return { code, kind: "authorization_invariant" };
  }
  return { code, kind: "workflow_failed" };
}

/**
 * Production workflow adapter with only persistence/observation replaced.
 * Agents, tools, prompts, reranking, authorization, verification, compliance,
 * and final source materialization are the production implementations.
 */
export class IsolatedProductionRagWorkflow implements RagEvaluationWorkflow {
  private readonly persistence = new InMemorySupervisorPersistence();
  private readonly repository = new EvaluationChatRepository();
  private readonly service: ChatWorkflowService;
  private currentArtifacts: ChatWorkflowExecutionArtifacts | null = null;
  private currentSemantic: CitationSemanticEvaluationArtifact | null = null;

  constructor(private readonly deps: IsolatedProductionRagWorkflowDependencies) {
    const composition = createChatSupervisorComposition(deps.production, {
      persistence: this.persistence,
      onCitationSemanticVerification: (result) => {
        this.currentSemantic = result;
      },
    });
    this.service = new ChatWorkflowService({
      composition,
      repository: this.repository,
      authorize: deps.authorize,
      permissionEvaluator: deps.permissionEvaluator,
      loadPersistedActor: deps.loadPersistedActor,
      loadSettings: deps.loadSettings,
      createRun: async (input) => {
        const id = `evaluation-${input.requestId}`;
        this.persistence.runs.delete(id);
        this.persistence.seedPendingRun(id, input.tenantId);
        return { id };
      },
      authorizedRetrieval: deps.production.authorizedRetrieval,
      loadDocumentTitles: deps.loadDocumentTitles,
      runMetadata: deps.runMetadata,
      onExecutionArtifacts: (artifacts) => {
        this.currentArtifacts = artifacts;
        deps.onEvaluationArtifacts?.(artifacts);
      },
      // Deliberately omit audit and knowledge-gap writers.
    });
  }

  async execute(
    _evaluationCase: RagEvaluationCaseV2,
    context: RagEvaluationExecutionContext,
  ): Promise<RagWorkflowExecution> {
    this.currentArtifacts = null;
    this.currentSemantic = null;
    this.repository.setConversationId(
      deterministicObjectId(`${context.evaluationId}:${context.tenantId}:${context.actorId}`),
    );

    try {
      const response = await this.service.execute(
        { message: context.question },
        {
          tenantId: context.tenantId,
          actorId: context.actorId,
          actorEmail: context.actorEmail,
          actorRole: context.baseRole,
          requestId: context.evaluationId,
          traceId: context.traceId,
        },
      );
      const artifacts = this.currentArtifacts;
      const authorizationByChunkId = await this.authorizeObservedCandidates(
        context,
        artifacts,
      );
      const judgeEvidence: JudgeEvidence[] = (response.sources ?? []).map((source) => ({
        chunkId: source.chunkId,
        documentId: source.documentId,
        documentTitle: source.documentTitle ?? source.documentId,
        sectionTitle: source.sectionTitle,
        pageNumber: source.pageNumber,
        text: source.text,
      }));
      return {
        status: "completed",
        artifacts,
        semanticVerification: this.currentSemantic,
        retrievalArtifacts: this.deps.consumeRetrievalArtifacts?.() ?? null,
        finalAnswer: response.answer,
        judgeEvidence,
        authorizationByChunkId,
        provider: this.deps.runMetadata.modelProvider,
        model: this.deps.runMetadata.modelName,
        errorCode: null,
        failureKind: null,
      };
    } catch (error) {
      const failure = mapFailure(error);
      return {
        status: "failed",
        artifacts: this.currentArtifacts,
        semanticVerification: this.currentSemantic,
        retrievalArtifacts: this.deps.consumeRetrievalArtifacts?.() ?? null,
        finalAnswer: "",
        judgeEvidence: [],
        authorizationByChunkId: await this.authorizeObservedCandidates(
          context,
          this.currentArtifacts,
        ),
        provider: this.deps.runMetadata.modelProvider,
        model: this.deps.runMetadata.modelName,
        errorCode: failure.code,
        failureKind: failure.kind,
      };
    }
  }

  isolationSnapshot(): EvaluationIsolationSnapshot {
    return {
      conversations: this.repository.conversations.size,
      messages: this.repository.messages.length,
      supervisorRuns: this.persistence.runs.size,
      supervisorSteps: this.persistence.steps.size,
      supervisorToolCalls: this.persistence.toolCalls.size,
      supervisorApprovals: this.persistence.approvals.size,
      durableAgentRuns: 0,
    };
  }

  private async authorizeObservedCandidates(
    context: RagEvaluationExecutionContext,
    artifacts: ChatWorkflowExecutionArtifacts | null,
  ): Promise<ReadonlyMap<string, boolean>> {
    const authorization = new Map<string, boolean>();
    for (const candidate of artifacts?.retrievalCandidates ?? []) {
      try {
        await this.deps.production.authorizedRetrieval.authorization.authorizeDocumentAction(
          { tenantId: context.tenantId, actorId: context.actorId },
          candidate.documentId,
          "use_in_ai",
        );
        authorization.set(candidate.chunkId, true);
      } catch {
        authorization.set(candidate.chunkId, false);
      }
    }
    return authorization;
  }
}
