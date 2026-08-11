import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  LLM_PROVIDER_UNAVAILABLE,
  LLM_RATE_LIMITED,
  LLM_TIMEOUT,
  VALIDATION_ERROR,
} from "../../common/errors/errorCodes.js";
import type { AuditWriter } from "../../common/observability/auditWriter.js";
import { getAuditWriter } from "../../common/observability/index.js";
import DocumentModel from "../../db/models/document.model.js";
import type { MessageSource } from "../../db/models/message.model.js";
import {
  createProductionChatSupervisorComposition,
  type ProductionChatSupervisorComposition,
  type ProductionChatSupervisorDependencies,
} from "../agents/chatSupervisorComposition.js";
import {
  AnswerWriterOutputSchema,
  CitationVerifierOutputSchema,
  ComplianceAgentOutputSchema,
  IntentAgentOutputSchema,
  type AnswerWriterOutput,
  type CitationVerifierOutput,
  type ComplianceAgentOutput,
  type IntentAgentOutput,
} from "../agents/chatAgentIO.js";
import { createRun } from "../agents/agents.repository.js";
import type { RunRecord } from "../agents/agents.types.js";
import type {
  SupervisorRunInput,
  SupervisorRunResult,
  SupervisorRuntimeHooks,
} from "../agents/supervisorRuntime.js";
import type { SupervisorDecision } from "../agents/supervisorDecision.js";
import type { ChatAgentId } from "../agents/chatAgents.js";
import {
  RETRIEVABLE_CHUNK_STATUSES,
  type AuthorizedRetrievalDependencies,
  type LoadedChunkCandidate,
} from "../agents/tools/authorizedRetrievalTools.js";
import { createKnowledgeGapTool } from "../agents/tools/knowledgeGapTool.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { getPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import {
  authorizeTenantOperation,
  type OperationAuthorizationContext,
  type ResolvedOperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import type {
  PermissionActor,
  PermissionEvaluator,
  ResolvedPermissions,
} from "../permissions/permissions.types.js";
import { getTenantSettings } from "../settings/settings.service.js";
import { findUserDocumentByTenantAndId } from "../auth/auth.repository.js";
import {
  detectAnalyticsRequest,
  detectReplyLanguage,
  formatAnalyticsAnswer,
  type ChatAnalyticsRequest,
} from "./chat.tools.js";
import { socialReplyFor } from "./chat.social.js";
import { assistantReplyFor } from "./chat.assistant.js";
import { detectAnswerTask } from "./chat.answerTask.js";
import type { ChatResponse, ChatSource } from "./chat.types.js";
import { ChatSendBodySchema, type ChatSendBody } from "./chat.validator.js";
import * as chatRepo from "./chat.repository.js";

const WORKFLOW_ID = "chat-rag-v1" as const;
const DEFAULT_MAX_TOKENS = 1024;
export const CHAT_DIRECT_RETRIEVAL_TOP_K = 5;
export const CHAT_SUMMARIZATION_RETRIEVAL_TOP_K = 12;
const SUMMARY_MAX_TOKENS = 2048;
const MAX_SEARCH_QUERY_CHARS = 2_000;

const SAFE_RUNTIME_PROVIDER_ERRORS = {
  [LLM_RATE_LIMITED]: {
    statusCode: 429,
    message: "The AI service is temporarily rate-limited. Please try again shortly.",
  },
  [LLM_PROVIDER_UNAVAILABLE]: {
    statusCode: 503,
    message: "The AI service is temporarily unavailable. Please try again shortly.",
  },
  [LLM_TIMEOUT]: {
    statusCode: 503,
    message: "The AI service took too long to respond. Please try again.",
  },
} as const;

function safeRuntimeProviderError(code: unknown): AppError | null {
  if (typeof code !== "string") return null;
  const safe = SAFE_RUNTIME_PROVIDER_ERRORS[code as keyof typeof SAFE_RUNTIME_PROVIDER_ERRORS];
  if (!safe) return null;
  return new AppError(safe.statusCode, code, safe.message);
}

/**
 * For Arabic questions, prioritize one validated English semantic expansion
 * while retaining the standalone Arabic question as secondary search text.
 * Other languages keep their standalone question unchanged. This stays
 * request-local and bounded; same-language provider paraphrases are excluded.
 */
export function buildAuthorizedSearchQueryText(
  intent: Pick<IntentAgentOutput, "normalizedQuestion" | "language" | "semanticQueries">,
): string {
  const normalizedQuestion = intent.normalizedQuestion.trim();
  if (intent.language !== "ar") return normalizedQuestion;

  const englishExpansion = intent.semanticQueries.find((query) =>
    query.language === "en" && query.text.trim() !== normalizedQuestion
  )?.text.trim();
  if (!englishExpansion) return normalizedQuestion;

  const combined = `${englishExpansion}\n${normalizedQuestion}`;
  return combined.length <= MAX_SEARCH_QUERY_CHARS
    ? combined
    : englishExpansion.slice(0, MAX_SEARCH_QUERY_CHARS);
}

const SearchCandidateSchema = z
  .object({
    chunkId: z.string().min(1),
    documentId: z.string().min(1),
    documentVersionId: z.string(),
    score: z.number().min(0),
    pageNumber: z.number().int().positive().optional(),
    sectionTitle: z.string().optional(),
    retrievalMethod: z.string().optional(),
  })
  .strict();

const ResolveTitlesOutputSchema = z
  .object({
    status: z.enum(["one_match", "no_match", "ambiguous"]),
    documentIds: z.array(z.string()).max(20),
    reasonCode: z.string(),
  })
  .strict();

const SearchOutputSchema = z
  .object({
    candidates: z.array(SearchCandidateSchema),
    totalCandidates: z.number().int().nonnegative(),
    reasonCode: z.string(),
  })
  .strict();

const EvidenceOutputSchema = z
  .object({
    sufficiency: z.enum(["SUFFICIENT", "WEAK", "NO_EVIDENCE", "CONFLICTING"]),
    approvedEvidenceIds: z.array(z.string()),
    rejectedEvidenceIds: z.array(z.string()),
    reasonCode: z.string(),
  })
  .strict();

const AnalyticsOutputSchema = z.object({ result: z.unknown() }).strict();

const SourceLessTerminalSchema = z
  .object({
    action: z.literal("release"),
    answer: z.string().min(1).max(20_000),
    sourceIds: z.array(z.string()).length(0),
    reasonCode: z.enum(["ASSISTANT_INTENT", "SOCIAL_INTENT", "ANALYTICS_TOOL"]),
  })
  .strict();

type TrustedTerminal = ComplianceAgentOutput | z.infer<typeof SourceLessTerminalSchema>;
type RuntimeLike = {
  execute(
    input: SupervisorRunInput,
    hooks?: SupervisorRuntimeHooks,
  ): Promise<SupervisorRunResult>;
};

interface StoredRecord {
  readonly _id: { toString(): string } | string;
}

interface StoredConversation extends StoredRecord {
  readonly userId: { toString(): string } | string;
}

export interface ChatWorkflowRepository {
  createConversation(tenantId: string, actorId: string, title: string): Promise<StoredConversation>;
  getConversationById(tenantId: string, conversationId: string): Promise<StoredConversation | null>;
  countMessages(tenantId: string, conversationId: string): Promise<number>;
  addMessage(
    tenantId: string,
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    sequenceNumber: number,
    sources?: MessageSource[],
  ): Promise<StoredRecord>;
}

interface RuntimeComposition {
  readonly runtime: RuntimeLike;
  readonly workflow: { readonly id: typeof WORKFLOW_ID };
}

export interface ChatWorkflowServiceDependencies {
  readonly composition: RuntimeComposition;
  readonly repository: ChatWorkflowRepository;
  readonly authorize: (
    context: OperationAuthorizationContext,
  ) => Promise<ResolvedOperationAuthorizationContext>;
  readonly permissionEvaluator: PermissionEvaluator;
  readonly loadPersistedActor: (
    tenantId: string,
    actorId: string,
  ) => Promise<{
    tenantId: string;
    actorId: string;
    baseRole: BaseRole;
    customRoleId: string | null;
    status: string;
  } | null>;
  readonly loadSettings: (tenantId: string) => Promise<{
    citationsEnabled: boolean;
    maxTokens: number;
  }>;
  readonly createRun: (input: Parameters<typeof createRun>[0]) => Promise<Pick<RunRecord, "id">>;
  readonly authorizedRetrieval: Pick<
    AuthorizedRetrievalDependencies,
    "authorization" | "loadChunksByIds" | "loadEligibleDocumentIds"
  >;
  readonly loadDocumentTitles: (
    tenantId: string,
    documentIds: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
  readonly reportKnowledgeGap?: (input: {
    tenantId: string;
    actorId: string;
    traceId: string;
    requestId: string;
    conversationId: string;
    messageId: string;
    question: string;
  }) => Promise<void>;
  readonly auditWriter?: AuditWriter;
  readonly runMetadata: {
    modelProvider: string;
    modelName: string;
  };
  /** Optional in-process observation seam used by isolated evaluation runs. */
  readonly onExecutionArtifacts?: (artifacts: ChatWorkflowExecutionArtifacts) => void;
}

export type ChatStageId =
  | "intent"
  | "search"
  | "evidence"
  | "answer"
  | "verify"
  | "finalize";

export interface ChatWorkflowExecutionContext
  extends OperationAuthorizationContext {
  readonly locale?: string;
  readonly onStage?: (stage: ChatStageId) => void;
}

interface CatalogCandidate {
  readonly batchId: number;
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly score: number;
  readonly pageNumber?: number;
  readonly sectionTitle?: string;
  readonly retrievalMethod?: string;
}

interface SearchBatch {
  readonly id: number;
  readonly candidates: ReadonlyMap<string, CatalogCandidate>;
}

interface ChatRunArtifacts {
  intent: IntentAgentOutput | null;
  writer: AnswerWriterOutput | null;
  verifier: CitationVerifierOutput | null;
  compliance: ComplianceAgentOutput | null;
  pendingAgent: string | null;
  pendingTool: string | null;
  resolvedDocumentIds: string[];
  titlesResolved: boolean;
  titleResolutionStatus: "one_match" | "no_match" | "ambiguous" | null;
  searchBatches: SearchBatch[];
  activeSearchBatch: SearchBatch | null;
  evidenceSearchBatch: SearchBatch | null;
  evidenceEvaluated: boolean;
  evidenceSufficiency: "SUFFICIENT" | "WEAK" | "NO_EVIDENCE" | "CONFLICTING" | null;
  approvedEvidenceIds: string[];
  rejectedEvidenceIds: string[];
  evidenceReasonCode: string | null;
  analyticsRequest: ChatAnalyticsRequest | null;
  analyticsOutput: unknown;
  complianceRequested: boolean;
}

export interface ChatWorkflowRankedCandidateArtifact {
  readonly rank: number;
  readonly chunkId: string;
  readonly documentId: string;
  readonly score: number;
  readonly retrievalMethod?: string;
}

/** Sanitized evaluation observer DTO: no prompts, answer bodies, claims, or evidence text. */
export interface ChatWorkflowExecutionArtifacts {
  readonly intent: Pick<IntentAgentOutput, "route" | "intent" | "reasonCode"> | null;
  readonly compliance: Pick<ComplianceAgentOutput, "action" | "reasonCode"> | null;
  readonly retrievalCandidates: readonly ChatWorkflowRankedCandidateArtifact[];
  readonly evidenceSelectedCandidates: readonly ChatWorkflowRankedCandidateArtifact[];
  readonly evidenceSufficiency: ChatRunArtifacts["evidenceSufficiency"];
  readonly approvedEvidenceIds: readonly string[];
  readonly rejectedEvidenceIds: readonly string[];
  readonly evidenceReasonCode: string | null;
  readonly finalSourceChunkIds: readonly string[];
  readonly finalSourceDocumentIds: readonly string[];
  readonly finalSourceAuthorizationPassed: boolean;
  readonly runtime: Pick<
    SupervisorRunResult,
    "totalTokensUsed" | "estimatedCost" | "latencyMs"
  >;
}

function idOf(record: StoredRecord): string {
  return record._id.toString();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isSubset(values: readonly string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return values.every((value) => allowedSet.has(value));
}

function failClosed(message: string): never {
  throw new AppError(502, "CHAT_WORKFLOW_AUTHORITY_INVALID", message);
}

function selectFields(
  input: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter((field) => Object.prototype.hasOwnProperty.call(input, field))
      .map((field) => [field, input[field]]),
  );
}

const INTENT_OUTPUT_FIELDS = [
  "normalizedQuestion",
  "language",
  "route",
  "intent",
  "assistantKind",
  "intentConfidence",
  "referencedDocumentIds",
  "clarificationNeeded",
  "clarification",
  "socialSubtype",
  "isFollowUp",
  "conversationContextUsed",
  "reasonCode",
  "semanticQueries",
  "keywordQueries",
  "exactTerms",
  "entities",
  "referencedDocumentTitles",
  "temporalConstraints",
  "departments",
  "categories",
] as const;

function capturePendingAgent(
  artifacts: ChatRunArtifacts,
  currentInput: Record<string, unknown>,
): void {
  const pending = artifacts.pendingAgent;
  if (!pending) return;
  if (pending === "intent-query-agent") {
    artifacts.intent = IntentAgentOutputSchema.parse(
      selectFields(currentInput, INTENT_OUTPUT_FIELDS),
    );
  } else if (pending === "answer-writer-agent") {
    artifacts.writer = AnswerWriterOutputSchema.parse(
      selectFields(currentInput, ["decision", "answer", "citedChunkIds"]),
    );
    if (!isSubset(artifacts.writer.citedChunkIds, artifacts.approvedEvidenceIds)) {
      failClosed("Answer Writer citations exceed this run's approved evidence");
    }
  } else if (pending === "citation-verification-agent") {
    artifacts.verifier = CitationVerifierOutputSchema.parse(
      selectFields(currentInput, [
        "verified",
        "validatedCitationIds",
        "rejectedCitationIds",
        "unsupportedClaims",
        "unknownClaims",
        "verifiedAnswer",
        "reasonCode",
      ]),
    );
    const writerIds = artifacts.writer?.citedChunkIds ?? [];
    if (
      !isSubset(artifacts.verifier.validatedCitationIds, writerIds) ||
      !isSubset(artifacts.verifier.validatedCitationIds, artifacts.approvedEvidenceIds)
    ) {
      failClosed("Verified citations exceed this run's writer/evidence provenance");
    }
  } else if (pending === "compliance-agent") {
    artifacts.compliance = ComplianceAgentOutputSchema.parse(
      selectFields(currentInput, ["action", "answer", "sourceIds", "reasonCode"]),
    );
  }
  artifacts.pendingAgent = null;
}

function createChatRuntimePolicy(input: {
  readonly question: string;
  readonly conversationId: string;
  readonly citationsEnabled: boolean;
  readonly maxTokens: number;
  readonly onStage?: (stage: ChatStageId) => void;
}): { hooks: SupervisorRuntimeHooks; artifacts: ChatRunArtifacts } {
  // Hook exceptions abort the run, so progress emission must never throw.
  const emitStage = (stage: ChatStageId): void => {
    try {
      input.onStage?.(stage);
    } catch {
      // Progress observers are advisory; ignore listener failures.
    }
  };

  const artifacts: ChatRunArtifacts = {
    intent: null,
    writer: null,
    verifier: null,
    compliance: null,
    pendingAgent: null,
    pendingTool: null,
    resolvedDocumentIds: [],
    titlesResolved: false,
    titleResolutionStatus: null,
    searchBatches: [],
    activeSearchBatch: null,
    evidenceSearchBatch: null,
    evidenceEvaluated: false,
    evidenceSufficiency: null,
    approvedEvidenceIds: [],
    rejectedEvidenceIds: [],
    evidenceReasonCode: null,
    analyticsRequest: null,
    analyticsOutput: undefined,
    complianceRequested: false,
  };

  const syncIntentDerivedState = (): void => {
    if (!artifacts.intent) return;
    artifacts.analyticsRequest = detectAnalyticsRequest(input.question, {
      referencedDocumentIds: artifacts.intent.referencedDocumentIds,
      referencedDocumentTitles: artifacts.intent.referencedDocumentTitles,
    });
  };

  const matchesTrustedDecision = (
    proposed: SupervisorDecision,
    trusted: SupervisorDecision,
  ): boolean => {
    if (proposed.action !== trusted.action) return false;
    if (proposed.action === "handoff" && trusted.action === "handoff") {
      return proposed.nextAgent === trusted.nextAgent;
    }
    if (proposed.action === "tool_call" && trusted.action === "tool_call") {
      return proposed.toolName === trusted.toolName;
    }
    return proposed.action === "complete";
  };

  const hooks: SupervisorRuntimeHooks = {
    resolveDecision(args) {
      capturePendingAgent(artifacts, args.currentInput);
      syncIntentDerivedState();
      const currentAgent = args.proposedDecision.currentAgent;
      let trusted: SupervisorDecision;

      if (currentAgent !== "chat-supervisor") {
        trusted = {
          action: "handoff",
          currentAgent,
          nextAgent: "chat-supervisor",
          reasonCode: "RETURN_TO_SUPERVISOR",
          payload: {},
          toolName: null,
          toolInput: null,
        };
      } else if (!artifacts.intent) {
        trusted = {
          action: "handoff",
          currentAgent,
          nextAgent: "intent-query-agent",
          reasonCode: "INTENT_REQUIRED",
          payload: {},
          toolName: null,
          toolInput: null,
        };
      } else if (artifacts.analyticsRequest) {
        trusted = artifacts.analyticsOutput === undefined
          ? {
              action: "tool_call",
              currentAgent,
              nextAgent: null,
              toolName: "analytics_query",
              toolInput: {},
              reasonCode: "ANALYTICS_REQUIRED",
            }
          : {
              action: "complete",
              currentAgent,
              nextAgent: null,
              result: {},
              reasonCode: "ANALYTICS_COMPLETE",
            };
      } else if (artifacts.intent.route === "assistant" || artifacts.intent.route === "social") {
        trusted = {
          action: "complete",
          currentAgent,
          nextAgent: null,
          result: {},
          reasonCode: artifacts.intent.route === "assistant" ? "ASSISTANT_COMPLETE" : "SOCIAL_COMPLETE",
        };
      } else if (artifacts.intent.route !== "rag") {
        trusted = artifacts.compliance
          ? {
              action: "complete",
              currentAgent,
              nextAgent: null,
              result: {},
              reasonCode: "COMPLIANCE_COMPLETE",
            }
          : {
              action: "handoff",
              currentAgent,
              nextAgent: "compliance-agent",
              reasonCode: "COMPLIANCE_REQUIRED",
              payload: {},
              toolName: null,
              toolInput: null,
            };
      } else if (
        artifacts.intent.referencedDocumentTitles.length > 0 &&
        !artifacts.titlesResolved
      ) {
        trusted = {
          action: "tool_call",
          currentAgent,
          nextAgent: null,
          toolName: "resolve_document_titles",
          toolInput: {},
          reasonCode: "TITLE_RESOLUTION_REQUIRED",
        };
      } else if (
        artifacts.intent.referencedDocumentTitles.length > 0 &&
        artifacts.titleResolutionStatus !== "one_match"
      ) {
        trusted = artifacts.compliance
          ? {
              action: "complete",
              currentAgent,
              nextAgent: null,
              result: {},
              reasonCode: "COMPLIANCE_COMPLETE",
            }
          : {
              action: "handoff",
              currentAgent,
              nextAgent: "compliance-agent",
              reasonCode: "INSUFFICIENT_EVIDENCE",
              payload: {},
              toolName: null,
              toolInput: null,
            };
      } else if (!artifacts.activeSearchBatch) {
        trusted = {
          action: "tool_call",
          currentAgent,
          nextAgent: null,
          toolName: "authorized_hybrid_search",
          toolInput: {},
          reasonCode: "AUTHORIZED_SEARCH_REQUIRED",
        };
      } else if (artifacts.activeSearchBatch.candidates.size === 0) {
        trusted = artifacts.compliance
          ? {
              action: "complete",
              currentAgent,
              nextAgent: null,
              result: {},
              reasonCode: "COMPLIANCE_COMPLETE",
            }
          : {
              action: "handoff",
              currentAgent,
              nextAgent: "compliance-agent",
              reasonCode: "NO_SEARCH_RESULTS",
              payload: {},
              toolName: null,
              toolInput: null,
            };
      } else if (!artifacts.evidenceEvaluated) {
        trusted = {
          action: "tool_call",
          currentAgent,
          nextAgent: null,
          toolName: "evaluate_evidence",
          toolInput: {},
          reasonCode: "EVIDENCE_EVALUATION_REQUIRED",
        };
      } else if (artifacts.approvedEvidenceIds.length === 0) {
        trusted = artifacts.compliance
          ? {
              action: "complete",
              currentAgent,
              nextAgent: null,
              result: {},
              reasonCode: "COMPLIANCE_COMPLETE",
            }
          : {
              action: "handoff",
              currentAgent,
              nextAgent: "compliance-agent",
              reasonCode: "INSUFFICIENT_EVIDENCE",
              payload: {},
              toolName: null,
              toolInput: null,
            };
      } else if (!artifacts.writer) {
        trusted = {
          action: "handoff",
          currentAgent,
          nextAgent: "answer-writer-agent",
          reasonCode: "ANSWER_REQUIRED",
          payload: {},
          toolName: null,
          toolInput: null,
        };
      } else if (artifacts.writer.decision === "grounded_answer" && !artifacts.verifier) {
        trusted = {
          action: "handoff",
          currentAgent,
          nextAgent: "citation-verification-agent",
          reasonCode: "CITATION_VERIFICATION_REQUIRED",
          payload: {},
          toolName: null,
          toolInput: null,
        };
      } else if (!artifacts.compliance) {
        trusted = {
          action: "handoff",
          currentAgent,
          nextAgent: "compliance-agent",
          reasonCode: "COMPLIANCE_REQUIRED",
          payload: {},
          toolName: null,
          toolInput: null,
        };
      } else {
        trusted = {
          action: "complete",
          currentAgent,
          nextAgent: null,
          result: {},
          reasonCode: "COMPLIANCE_COMPLETE",
        };
      }

      return matchesTrustedDecision(args.proposedDecision, trusted)
        ? args.proposedDecision
        : trusted;
    },

    resolveHandoffPayload(args) {
      capturePendingAgent(artifacts, args.currentInput);
      syncIntentDerivedState();
      let resolved: Record<string, unknown>;

      if (artifacts.analyticsRequest) {
        failClosed("Analytics requests must execute only the controlled analytics tool");
      }
      if (args.toAgent === "intent-query-agent") {
        if (artifacts.intent) failClosed("Intent Agent may execute only once");
        emitStage("intent");
        resolved = {
          conversationId: input.conversationId,
          question: input.question,
        };
      } else if (args.toAgent === "answer-writer-agent") {
        const intent = artifacts.intent ?? failClosed("Trusted intent output is required");
        if (intent.route !== "rag" || artifacts.approvedEvidenceIds.length === 0) {
          failClosed("Answer Writer requires approved RAG evidence");
        }
        const task = detectAnswerTask(
          { detectedIntent: intent.intent },
          intent.normalizedQuestion,
        );
        emitStage("answer");
        resolved = {
          conversationId: input.conversationId,
          question: intent.normalizedQuestion,
          language: intent.language,
          approvedEvidenceIds: [...artifacts.approvedEvidenceIds],
          referencedDocumentIds: unique([
            ...intent.referencedDocumentIds,
            ...artifacts.resolvedDocumentIds,
          ]),
          task,
          citationsEnabled: input.citationsEnabled,
          maxTokens:
            task === "document_summary" ? SUMMARY_MAX_TOKENS : input.maxTokens,
        };
      } else if (args.toAgent === "citation-verification-agent") {
        const writer = artifacts.writer ?? failClosed("Trusted Answer Writer output is required");
        if (!isSubset(writer.citedChunkIds, artifacts.approvedEvidenceIds)) {
          failClosed("Writer citations exceed approved evidence");
        }
        emitStage("verify");
        resolved = {
          decision: writer.decision,
          citedChunkIds: [...writer.citedChunkIds],
          approvedEvidenceIds: [...artifacts.approvedEvidenceIds],
          answerText: writer.answer,
          questionText: artifacts.intent?.normalizedQuestion ?? input.question,
        };
      } else if (args.toAgent === "compliance-agent") {
        const intent = artifacts.intent ?? failClosed("Trusted intent output is required");
        if (artifacts.analyticsRequest || intent.route === "assistant" || intent.route === "social") {
          failClosed("Compliance is not valid for analytics, assistant, or social paths");
        }
        emitStage("finalize");

        let answerDecision: AnswerWriterOutput["decision"];
        let answer = "";
        let citationVerification: Record<string, unknown> | undefined;
        if (intent.route === "unsafe" || intent.route === "unsupported") {
          answerDecision = intent.route;
        } else if (intent.route === "clarification") {
          answerDecision = "clarification";
          answer =
            (intent.language === "ar"
              ? intent.clarification?.messageAr
              : intent.clarification?.messageEn) ?? "";
        } else if (!artifacts.writer || artifacts.approvedEvidenceIds.length === 0) {
          answerDecision = "insufficient_evidence";
        } else {
          answerDecision = artifacts.writer.decision;
          answer = artifacts.writer.answer;
          if (answerDecision === "grounded_answer") {
            const verifier = artifacts.verifier ?? failClosed("Grounded answers require citation verification");
            if (
              !isSubset(verifier.validatedCitationIds, artifacts.writer.citedChunkIds) ||
              !isSubset(verifier.validatedCitationIds, artifacts.approvedEvidenceIds)
            ) {
              failClosed("Citation verification provenance is invalid");
            }
            citationVerification = {
              verified: verifier.verified,
              validatedCitationIds: [...verifier.validatedCitationIds],
              reasonCode: verifier.reasonCode,
            };
            if (verifier.verified) {
              answer = verifier.verifiedAnswer ?? failClosed("Verified citations require the final verified answer");
            }
          }
        }

        artifacts.complianceRequested = true;
        resolved = {
          route: intent.route,
          answerDecision,
          answer,
          language: intent.language,
          citationsEnabled: input.citationsEnabled,
          ...(citationVerification ? { citationVerification } : {}),
        };
      } else {
        failClosed(`Unsupported chat handoff target: ${args.toAgent}`);
      }

      artifacts.pendingAgent = args.toAgent;
      return resolved;
    },

    resolveToolInput(args) {
      capturePendingAgent(artifacts, args.currentInput);
      syncIntentDerivedState();
      artifacts.pendingTool = args.toolName;

      if (args.toolName === "analytics_query") {
        if (!artifacts.analyticsRequest) {
          failClosed("Analytics tool requires trusted deterministic analytics detection");
        }
        emitStage("search");
        return {
          metric: artifacts.analyticsRequest.metric,
          period: artifacts.analyticsRequest.period,
        };
      }

      const intent = artifacts.intent ?? failClosed("Retrieval tools require trusted intent output");
      if (artifacts.analyticsRequest || intent.route !== "rag") {
        failClosed("Retrieval tools are only valid for the RAG path");
      }

      if (args.toolName === "resolve_document_titles") {
        if (intent.referencedDocumentTitles.length === 0) {
          failClosed("No trusted document titles require resolution");
        }
        emitStage("search");
        return { titles: [...intent.referencedDocumentTitles] };
      }
      if (args.toolName === "authorized_hybrid_search") {
        if (intent.referencedDocumentTitles.length > 0 && !artifacts.titlesResolved) {
          failClosed("Referenced titles must be resolved before search");
        }
        if (
          intent.referencedDocumentTitles.length > 0 &&
          artifacts.titleResolutionStatus !== "one_match"
        ) {
          failClosed("Unresolved or ambiguous document titles cannot broaden search");
        }
        const documentIds = unique([
          ...intent.referencedDocumentIds,
          ...artifacts.resolvedDocumentIds,
        ]);
        const queryText = buildAuthorizedSearchQueryText(intent);
        const task = detectAnswerTask(
          { detectedIntent: intent.intent },
          intent.normalizedQuestion,
        );
        emitStage("search");
        return {
          queryText,
          topK: task === "document_summary"
            ? CHAT_SUMMARIZATION_RETRIEVAL_TOP_K
            : CHAT_DIRECT_RETRIEVAL_TOP_K,
          ...(documentIds.length > 0 ? { documentIds } : {}),
        };
      }
      if (args.toolName === "evaluate_evidence") {
        const batch = artifacts.activeSearchBatch ?? failClosed("Evidence evaluation requires this run's search candidates");
        const candidateIds = [...batch.candidates.keys()];
        if (candidateIds.length === 0) failClosed("Evidence evaluation requires non-empty search candidates");
        artifacts.evidenceSearchBatch = batch;
        emitStage("evidence");
        return {
          question: intent.normalizedQuestion,
          candidateIds,
        };
      }
      return failClosed(`Unsupported chat tool: ${args.toolName}`);
    },

    onToolResult(args) {
      if (artifacts.pendingTool !== args.toolName) {
        failClosed("Tool result does not match this run's pending tool");
      }
      artifacts.pendingTool = null;

      if (args.toolName === "resolve_document_titles") {
        const output = ResolveTitlesOutputSchema.parse(args.validatedOutput);
        artifacts.titlesResolved = true;
        artifacts.titleResolutionStatus = output.status;
        artifacts.resolvedDocumentIds = [...output.documentIds];
        return;
      }
      if (args.toolName === "authorized_hybrid_search") {
        const output = SearchOutputSchema.parse(args.validatedOutput);
        const restrictedDocumentIds = unique([
          ...(artifacts.intent?.referencedDocumentIds ?? []),
          ...artifacts.resolvedDocumentIds,
        ]);
        if (
          restrictedDocumentIds.length > 0 &&
          output.candidates.some((candidate) => !restrictedDocumentIds.includes(candidate.documentId))
        ) {
          failClosed("Search returned a candidate outside trusted document scope");
        }
        const batchId = artifacts.searchBatches.length + 1;
        const candidates = new Map(
          output.candidates.map((candidate) => [
            candidate.chunkId,
            { ...candidate, batchId } satisfies CatalogCandidate,
          ]),
        );
        const batch = { id: batchId, candidates };
        artifacts.searchBatches.push(batch);
        artifacts.activeSearchBatch = batch;
        return;
      }
      if (args.toolName === "evaluate_evidence") {
        const output = EvidenceOutputSchema.parse(args.validatedOutput);
        const batch = artifacts.evidenceSearchBatch ?? failClosed("Evidence output has no search provenance");
        if (!isSubset(output.approvedEvidenceIds, [...batch.candidates.keys()])) {
          failClosed("Approved evidence exceeds this run's evaluated candidate set");
        }
        artifacts.approvedEvidenceIds = [...output.approvedEvidenceIds];
        artifacts.rejectedEvidenceIds = [...output.rejectedEvidenceIds];
        artifacts.evidenceSufficiency = output.sufficiency;
        artifacts.evidenceReasonCode = output.reasonCode;
        artifacts.evidenceEvaluated = true;
        return;
      }
      if (args.toolName === "analytics_query") {
        artifacts.analyticsOutput = AnalyticsOutputSchema.parse(args.validatedOutput).result;
      }
    },

    resolveCompleteResult(args) {
      capturePendingAgent(artifacts, args.currentInput);
      syncIntentDerivedState();

      if (artifacts.analyticsRequest) {
        if (artifacts.analyticsOutput === undefined) {
          failClosed("Analytics completion requires a successful analytics tool result");
        }
        return SourceLessTerminalSchema.parse({
          action: "release",
          answer: formatAnalyticsAnswer(artifacts.analyticsOutput, {
            ...artifacts.analyticsRequest,
            language: detectReplyLanguage(input.question),
          }),
          sourceIds: [],
          reasonCode: "ANALYTICS_TOOL",
        });
      }

      const intent = artifacts.intent ?? failClosed("Completion requires trusted intent output");
      if (intent.route === "assistant") {
        const kind = intent.assistantKind ?? failClosed("Assistant completion requires a trusted assistant kind");
        return SourceLessTerminalSchema.parse({
          action: "release",
          answer: assistantReplyFor(intent.language, kind),
          sourceIds: [],
          reasonCode: "ASSISTANT_INTENT",
        });
      }
      if (intent.route === "social") {
        return SourceLessTerminalSchema.parse({
          action: "release",
          answer: socialReplyFor(intent.language, intent.socialSubtype ?? "acknowledgement"),
          sourceIds: [],
          reasonCode: "SOCIAL_INTENT",
        });
      }

      if (!artifacts.complianceRequested || !artifacts.compliance) {
        failClosed("Completion requires the latest Compliance output");
      }
      const terminal = ComplianceAgentOutputSchema.parse(artifacts.compliance);
      if (terminal.sourceIds.length > 0) {
        const verifier = artifacts.verifier ?? failClosed("Compliance sources require verified citations");
        if (
          !verifier.verified ||
          !isSubset(terminal.sourceIds, verifier.validatedCitationIds) ||
          !isSubset(terminal.sourceIds, artifacts.approvedEvidenceIds)
        ) {
          failClosed("Compliance sources exceed this run's verified evidence chain");
        }
      }
      return terminal;
    },
  };

  // Chat stage transitions are fully determined by request-local, validated
  // artifacts above. Ask the same resolver for the trusted decision before
  // the runtime calls a probabilistic supervisor model. The legacy
  // resolveDecision hook remains available for unit-level policy tests and
  // non-chat SupervisorRuntime consumers keep their existing model path.
  hooks.resolveDecisionBeforeModel = (args) =>
    hooks.resolveDecision!({
      ...args,
      proposedDecision: {
        action: "complete",
        currentAgent: args.currentAgent as ChatAgentId,
        nextAgent: null,
        result: {},
        reasonCode: "TRUSTED_STAGE_RESOLUTION",
      },
    });

  return { hooks, artifacts };
}

export class ChatWorkflowService {
  constructor(private readonly deps: ChatWorkflowServiceDependencies) {}

  async execute(
    rawInput: unknown,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatResponse> {
    const input = this.validateInput(rawInput);
    const actor = await this.deps.authorize(context);
    const tenantId = actor.tenantId.toString();
    const actorId = actor.actorId.toString();
    const requestId = actor.requestId?.trim() || randomUUID();
    const traceId = actor.traceId?.trim() || requestId;

    const persistedActor = await this.deps.loadPersistedActor(tenantId, actorId);
    if (
      !persistedActor ||
      persistedActor.tenantId !== tenantId ||
      persistedActor.actorId !== actorId ||
      persistedActor.status !== "active"
    ) {
      throw new AppError(403, "PERMISSION_REQUIRED", "Permission denied");
    }
    const permissions = await this.resolveEffectivePermissions(persistedActor);
    if (!permissions.permissions.has(Permission.CHAT_CREATE)) {
      throw new AppError(403, "PERMISSION_REQUIRED", "Permission denied");
    }

    const conversationId = await this.resolveConversation(input, tenantId, actorId);
    const sequenceNumber = await this.deps.repository.countMessages(tenantId, conversationId);
    await this.deps.repository.addMessage(
      tenantId,
      conversationId,
      "user",
      input.message,
      sequenceNumber,
    );

    let settings = { citationsEnabled: true, maxTokens: DEFAULT_MAX_TOKENS };
    try {
      settings = await this.deps.loadSettings(tenantId);
    } catch {
      // Preserve the legacy availability policy: settings failure uses safe defaults.
    }

    const { hooks, artifacts } = createChatRuntimePolicy({
      question: input.message,
      conversationId,
      citationsEnabled: settings.citationsEnabled,
      maxTokens: settings.maxTokens,
      onStage: context.onStage,
    });

    const run = await this.deps.createRun({
      tenantId,
      actorId,
      workflowName: this.deps.composition.workflow.id,
      agentName: "chat-supervisor",
      input: { conversationId, question: input.message },
      modelProvider: this.deps.runMetadata.modelProvider,
      modelName: this.deps.runMetadata.modelName,
      promptVersion: null,
      promptVersionId: null,
      toolVersionSnapshot: null,
      traceId,
      requestId,
    });

    const runtimeResult = await this.deps.composition.runtime.execute(
      {
        runId: run.id,
        workflowId: this.deps.composition.workflow.id,
        context: {
          tenantId,
          actorId,
          actorRole: permissions.baseRole,
          actorEmail: actor.actorEmail,
          permissions: [...permissions.permissions],
          traceId,
          requestId,
          conversationId,
          workflowId: this.deps.composition.workflow.id,
          ...(context.locale ? { locale: context.locale } : {}),
        },
        input: { conversationId, question: input.message },
      },
      hooks,
    );

    if (runtimeResult.status !== "completed" || !runtimeResult.output) {
      const providerError = safeRuntimeProviderError(runtimeResult.error?.code);
      if (providerError) throw providerError;
      throw new AppError(502, "CHAT_WORKFLOW_FAILED", "Controlled chat workflow failed");
    }
    const terminal = this.validateTerminal(runtimeResult.output, artifacts);
    let materialized: { persisted: MessageSource[]; response: ChatSource[] };
    try {
      materialized = await this.materializeSources(
        terminal,
        artifacts,
        tenantId,
        actorId,
      );
    } catch (error) {
      this.observeExecution(artifacts, terminal, runtimeResult, [], false);
      throw error;
    }
    const { persisted, response } = materialized;
    this.observeExecution(artifacts, terminal, runtimeResult, response, true);
    const assistant = await this.deps.repository.addMessage(
      tenantId,
      conversationId,
      "assistant",
      terminal.answer,
      sequenceNumber + 1,
      persisted,
    );

    if (
      terminal.reasonCode === "INSUFFICIENT_EVIDENCE" ||
      terminal.reasonCode === "UNVERIFIED_GROUNDED_RESPONSE"
    ) {
      await this.deps.reportKnowledgeGap?.({
        tenantId,
        actorId,
        traceId,
        requestId,
        conversationId,
        messageId: idOf(assistant),
        question: input.message,
      }).catch(() => undefined);
    }

    if (artifacts.searchBatches.length > 0) {
      await this.deps.auditWriter?.write({
        action: "RETRIEVAL_SEARCH",
        resourceType: "Retrieval",
        resourceId: conversationId,
        outcome: "SUCCESS",
        tenantId,
        actorId,
        actorEmail: actor.actorEmail,
        actorRole: permissions.baseRole,
        metadata: {
          conversationId,
          sourceCount: persisted.length,
          reasonCode: terminal.reasonCode,
          isFollowUp: artifacts.intent?.isFollowUp ?? false,
          conversationContextUsed:
            artifacts.intent?.conversationContextUsed ?? false,
          historyMessagesSuppliedToWriter: 0,
          retrievalUsedNormalizedQuestion: true,
          runId: run.id,
          traceId,
          requestId,
        },
      });
    }

    return {
      messageId: idOf(assistant),
      answer: terminal.answer,
      sources:
        terminal.reasonCode === "ASSISTANT_INTENT"
          ? []
          : settings.citationsEnabled ? response : undefined,
      conversationId,
    };
  }

  private observeExecution(
    artifacts: ChatRunArtifacts,
    terminal: TrustedTerminal,
    runtime: SupervisorRunResult,
    sources: readonly ChatSource[],
    finalSourceAuthorizationPassed: boolean,
  ): void {
    const batch = artifacts.evidenceSearchBatch ?? artifacts.activeSearchBatch;
    const retrievalCandidates = batch
      ? [...batch.candidates.values()].map((candidate, index) => ({
          rank: index + 1,
          chunkId: candidate.chunkId,
          documentId: candidate.documentId,
          score: candidate.score,
          ...(candidate.retrievalMethod
            ? { retrievalMethod: candidate.retrievalMethod }
            : {}),
        }))
      : [];
    const candidateById = new Map(
      retrievalCandidates.map((candidate) => [candidate.chunkId, candidate]),
    );
    const evidenceSelectedCandidates = artifacts.approvedEvidenceIds.flatMap(
      (chunkId, index) => {
        const candidate = candidateById.get(chunkId);
        return candidate ? [{ ...candidate, rank: index + 1 }] : [];
      },
    );
    try {
      this.deps.onExecutionArtifacts?.({
        intent: artifacts.intent
          ? { route: artifacts.intent.route, intent: artifacts.intent.intent, reasonCode: artifacts.intent.reasonCode }
          : null,
        compliance:
          terminal.reasonCode === "ASSISTANT_INTENT" ||
          terminal.reasonCode === "SOCIAL_INTENT" ||
          terminal.reasonCode === "ANALYTICS_TOOL"
            ? null
            : artifacts.compliance
              ? { action: artifacts.compliance.action, reasonCode: artifacts.compliance.reasonCode }
              : null,
        retrievalCandidates,
        evidenceSelectedCandidates,
        evidenceSufficiency: artifacts.evidenceSufficiency,
        approvedEvidenceIds: [...artifacts.approvedEvidenceIds],
        rejectedEvidenceIds: [...artifacts.rejectedEvidenceIds],
        evidenceReasonCode: artifacts.evidenceReasonCode,
        finalSourceChunkIds: [...terminal.sourceIds],
        finalSourceDocumentIds: unique(sources.map((source) => source.documentId)),
        finalSourceAuthorizationPassed,
        runtime: {
          totalTokensUsed: runtime.totalTokensUsed,
          estimatedCost: runtime.estimatedCost,
          latencyMs: runtime.latencyMs,
        },
      });
    } catch {
      // Observation is non-authoritative and cannot change workflow behavior.
    }
  }

  private validateInput(rawInput: unknown): ChatSendBody {
    const parsed = ChatSendBodySchema.safeParse(rawInput);
    if (parsed.success) return parsed.data;
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", parsed.error.issues);
  }

  private async resolveEffectivePermissions(actor: PermissionActor): Promise<ResolvedPermissions> {
    const permissionActor: PermissionActor = {
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      baseRole: actor.baseRole,
      customRoleId: actor.customRoleId,
    };
    const resolved = await this.deps.permissionEvaluator.resolve(permissionActor);
    const expectedCustomRoleState = actor.customRoleId ? "active" : "none";
    if (
      resolved.customRoleId !== actor.customRoleId ||
      resolved.customRoleState !== expectedCustomRoleState
    ) {
      throw new AppError(403, "PERMISSION_REQUIRED", "Permission denied");
    }
    return resolved;
  }

  private async resolveConversation(
    input: ChatSendBody,
    tenantId: string,
    actorId: string,
  ): Promise<string> {
    if (!input.conversationId) {
      const title = input.message.length > 120
        ? `${input.message.slice(0, 117)}...`
        : input.message;
      return idOf(await this.deps.repository.createConversation(tenantId, actorId, title));
    }
    const existing = await this.deps.repository.getConversationById(
      tenantId,
      input.conversationId,
    );
    if (!existing || existing.userId.toString() !== actorId) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    }
    return input.conversationId;
  }

  private validateTerminal(
    output: Record<string, unknown>,
    artifacts: ChatRunArtifacts,
  ): TrustedTerminal {
    if (artifacts.analyticsRequest || artifacts.intent?.route === "assistant" || artifacts.intent?.route === "social") {
      return SourceLessTerminalSchema.parse(output);
    }
    const terminal = ComplianceAgentOutputSchema.parse(output);
    if (!artifacts.compliance || JSON.stringify(terminal) !== JSON.stringify(artifacts.compliance)) {
      return failClosed("Runtime output does not equal this run's Compliance authority");
    }
    return terminal;
  }

  private async materializeSources(
    terminal: TrustedTerminal,
    artifacts: ChatRunArtifacts,
    tenantId: string,
    actorId: string,
  ): Promise<{ persisted: MessageSource[]; response: ChatSource[] }> {
    if (terminal.sourceIds.length === 0) return { persisted: [], response: [] };
    const batch = artifacts.evidenceSearchBatch ?? failClosed("Final sources have no search batch");
    if (
      !isSubset(terminal.sourceIds, artifacts.approvedEvidenceIds) ||
      !isSubset(terminal.sourceIds, artifacts.verifier?.validatedCitationIds ?? [])
    ) {
      failClosed("Final sources do not have complete same-run provenance");
    }

    const catalog = terminal.sourceIds.map((sourceId) => {
      const candidate = batch.candidates.get(sourceId);
      return candidate ?? failClosed("Final source is absent from its authorized search catalog");
    });
    const loaded = await this.deps.authorizedRetrieval.loadChunksByIds(
      tenantId,
      terminal.sourceIds,
    );
    const loadedById = new Map(loaded.map((chunk) => [chunk.chunkId, chunk]));
    const documentIds = unique(catalog.map((candidate) => candidate.documentId));
    const eligibleIds = new Set(
      await this.deps.authorizedRetrieval.loadEligibleDocumentIds(tenantId, documentIds),
    );
    if (documentIds.some((documentId) => !eligibleIds.has(documentId))) {
      failClosed("Final source document is no longer eligible");
    }
    for (const documentId of documentIds) {
      await this.deps.authorizedRetrieval.authorization.authorizeDocumentAction(
        { tenantId, actorId },
        documentId,
        "use_in_ai",
      );
    }
    const titles = await this.deps.loadDocumentTitles(tenantId, documentIds);

    const response: ChatSource[] = catalog.map((candidate) => {
      const chunk = loadedById.get(candidate.chunkId);
      if (!chunk || !this.isCanonicalChunk(chunk, candidate, tenantId)) {
        return failClosed("Final source chunk metadata cannot be resolved securely");
      }
      const documentTitle = titles.get(candidate.documentId);
      if (!documentTitle) failClosed("Final source document title is unavailable");
      return {
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        documentVersionId: candidate.documentVersionId,
        text: chunk.text,
        pageNumber: candidate.pageNumber,
        sectionTitle: candidate.sectionTitle,
        score: candidate.score,
        documentTitle,
      };
    });
    const persisted: MessageSource[] = response.map((source) => ({
      chunkId: source.chunkId,
      documentId: source.documentId,
      documentTitle:
        source.documentTitle ?? failClosed("Final source title is unavailable"),
      sectionTitle: source.sectionTitle,
      pageNumber: source.pageNumber,
      score: source.score,
    }));
    return { persisted, response };
  }

  private isCanonicalChunk(
    chunk: LoadedChunkCandidate,
    candidate: CatalogCandidate,
    tenantId: string,
  ): boolean {
    return (
      chunk.tenantId === tenantId &&
      chunk.documentId === candidate.documentId &&
      chunk.documentVersionId === candidate.documentVersionId &&
      RETRIEVABLE_CHUNK_STATUSES.includes(
        chunk.status as (typeof RETRIEVABLE_CHUNK_STATUSES)[number],
      )
    );
  }
}

export function createProductionChatWorkflowService(
  deps: ProductionChatSupervisorDependencies,
): ChatWorkflowService {
  const composition: ProductionChatSupervisorComposition =
    createProductionChatSupervisorComposition(deps);
  const knowledgeGapTool = createKnowledgeGapTool();
  const modelName =
    (deps.model as typeof deps.model & { model?: string }).model ??
    deps.model.providerKey;

  return new ChatWorkflowService({
    composition,
    repository: chatRepo,
    authorize: (context) => authorizeTenantOperation(context, Permission.CHAT_CREATE),
    permissionEvaluator: getPermissionEvaluator(),
    loadPersistedActor: async (tenantId, actorId) => {
      const user = await findUserDocumentByTenantAndId(tenantId, actorId);
      if (!user) return null;
      return {
        tenantId: user.tenantId.toString(),
        actorId: user._id.toString(),
        baseRole: user.role,
        customRoleId: user.customRoleId?.toString() ?? null,
        status: user.status,
      };
    },
    loadSettings: async (tenantId) => {
      const result = await getTenantSettings(tenantId);
      return {
        citationsEnabled: result.settings.aiRuntimePreferences.citationsEnabled,
        maxTokens: result.settings.aiRuntimePreferences.maxTokens,
      };
    },
    createRun,
    authorizedRetrieval: deps.authorizedRetrieval,
    loadDocumentTitles: async (tenantId, documentIds) => {
      if (documentIds.length === 0) return new Map();
      const documents = await DocumentModel.find({
        _id: { $in: documentIds.map((id) => new mongoose.Types.ObjectId(id)) },
        tenantId,
      })
        .select("_id metadata.title fileName")
        .lean()
        .exec();
      return new Map(
        documents
          .map((document) => [
            document._id.toString(),
            document.metadata?.title ?? document.fileName,
          ] as const)
          .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
      );
    },
    reportKnowledgeGap: async (input) => {
      await knowledgeGapTool.handler(
        {
          tenantId: input.tenantId,
          actorId: input.actorId,
          traceId: input.traceId,
          requestId: input.requestId,
          workflowName: WORKFLOW_ID,
          agentName: "chat-supervisor",
          conversationId: input.conversationId,
          messageId: input.messageId,
        },
        { question: input.question, outcome: "unanswered", confidence: 0.4 },
      );
    },
    auditWriter: getAuditWriter(),
    runMetadata: {
      modelProvider: deps.model.providerKey,
      modelName,
    },
  });
}
