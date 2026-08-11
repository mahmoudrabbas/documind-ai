import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../db/connection.js";
import DocumentModel from "../db/models/document.model.js";
import UserModel from "../db/models/user.model.js";
import { getEmbeddingAdapter } from "../providers/embedding/atlasEmbeddingAdapter.js";
import {
  getKeywordAdapter,
  getVectorStoreAdapter,
} from "../providers/embedding/adapterLoader.js";
import { getModelAdapterAsync } from "../providers/llm/index.js";
import { LlmJudgeService } from "../modules/analytics/llmJudge.service.js";
import { AnswerRelevanceEvaluator, DEFAULT_ANSWER_RELEVANCE_THRESHOLD } from "../modules/analytics/evaluation/answerRelevance.evaluator.js";
import {
  AnswerCorrectnessEvaluator,
  CORRECTNESS_SEMANTIC_JUDGE_PROMPT_VERSION,
  ModelBackedCorrectnessSemanticJudge,
} from "../modules/analytics/evaluation/correctness.evaluator.js";
import { loadRagEvaluationDatasetV2 } from "../modules/analytics/evaluation/evaluation.datasetV2.js";
import { createRagEvaluationReport } from "../modules/analytics/evaluation/evaluation.report.js";
import { DEFAULT_RETRIEVAL_METRIC_CUTOFF_K, RagEvaluationRunner } from "../modules/analytics/evaluation/evaluation.runner.js";
import { IsolatedProductionRagWorkflow } from "../modules/analytics/evaluation/evaluation.workflow.js";
import { RAG_METRIC_SEMANTICS_VERSION } from "../modules/analytics/evaluation/evaluation.comparison.schemas.js";
import type { HybridRetrievalArtifacts } from "../modules/retrieval/retrieval.service.js";
import {
  createRetrievalService,
} from "../modules/retrieval/retrieval.service.js";
import { createRetrievalRepository } from "../modules/retrieval/retrieval.repository.js";
import {
  compileAccessFilters,
  compileQueryFilters,
  mergeFilters,
} from "../modules/retrieval/filterCompiler.js";
import { FusionEngine } from "../modules/retrieval/fusionEngine.js";
import { FakeRerankerAdapter } from "../modules/reranker/fakeReranker.adapter.js";
import { createRerankerService } from "../modules/reranker/reranker.service.js";
import { EVIDENCE_ITEM_MIN_TOTAL_SCORE } from "../modules/reranker/reranker.types.js";
import { createEvaluationDocumentAccessAuthorizationService } from "../modules/document-access/documentAccess.authorization.service.js";
import { getPermissionEvaluator } from "../modules/permissions/permissions.evaluator.js";
import { Permission } from "../modules/permissions/permissions.catalog.js";
import { authorizeTenantOperation } from "../modules/permissions/permissions.operation.js";
import { resolveDepartmentNames } from "../modules/roles/roles.taxonomy.js";
import { resolveAuthorizedDocumentHints } from "../modules/intent-query/intentQuery.documentHints.js";
import { createIntentQueryService } from "../modules/intent-query/intentQuery.factory.js";
import { FakeConversationContextAdapter } from "../modules/intent-query/adapters/conversationContext.fakeAdapter.js";
import {
  createDefaultLoadChunksByIds,
  createDefaultLoadEligibleDocumentIds,
} from "../modules/agents/tools/authorizedRetrievalTools.js";
import { getTenantSettings } from "../modules/settings/settings.service.js";
import { findUserDocumentByTenantAndId } from "../modules/auth/auth.repository.js";
import { INTENT_PROMPT_VERSION } from "../modules/intent-query/intentQuery.prompt.js";
import { ANSWER_WRITER_PROMPT_VERSION } from "../modules/agents/answerWriter.service.js";
import {
  CITATION_SEMANTIC_PROMPT_VERSION,
  MAX_SEMANTIC_CLAIMS,
  MAX_SEMANTIC_CLAIM_LENGTH,
  MAX_UNKNOWN_RETRIES,
} from "../modules/agents/citationSemanticVerification.service.js";
import { JUDGE_EVALUATION_SCHEMA_VERSION } from "../modules/analytics/llmJudge.types.js";
import { assertCompleteRuntimeComponentIdentity } from "../modules/analytics/evaluation/evaluation.configuration.js";
import type { AuthorizedRetrievalDependencies } from "../modules/agents/tools/authorizedRetrievalTools.js";
import { INTENT_QUERY_AGENT_VERSION } from "../modules/agents/intentQueryAgent.js";
import { ANSWER_WRITER_AGENT_VERSION } from "../modules/agents/answerWriterAgent.js";
import { CITATION_VERIFICATION_AGENT_VERSION } from "../modules/agents/citationVerificationAgent.js";
import { COMPLIANCE_AGENT_VERSION } from "../modules/agents/complianceAgent.js";
import { CHAT_DIRECT_RETRIEVAL_TOP_K, CHAT_SUMMARIZATION_RETRIEVAL_TOP_K } from "../modules/chat/chatWorkflowService.js";

interface CliOptions {
  mode: "live";
  tenantId: string;
  actorId: string;
  datasetPath?: string;
  reportPath: string;
  caseIds?: string[];
  tags?: string[];
  topK?: number;
}

function reportRuntimeIdentity(identity: {
  provider: string;
  model?: string;
  modelRevision?: string | null;
  modelRevisionStatus?: "provided" | "unavailable";
  componentVersion: string;
  promptVersion?: string;
  chain?: readonly { provider?: string; model?: string; modelRevision?: string | null; modelRevisionStatus?: "provided" | "unavailable"; componentVersion?: string }[];
}) {
  return {
    provider: identity.provider,
    ...(identity.model ? { model: identity.model } : {}),
    ...(identity.modelRevision !== undefined ? { modelRevision: identity.modelRevision } : {}),
    ...(identity.modelRevisionStatus ? { modelRevisionStatus: identity.modelRevisionStatus } : {}),
    componentVersion: identity.componentVersion,
    ...(identity.promptVersion ? { promptVersion: identity.promptVersion } : {}),
    ...(identity.chain ? { chain: identity.chain.map((entry) => ({
      provider: entry.provider!, model: entry.model!, componentVersion: entry.componentVersion!,
      ...(entry.modelRevision !== undefined ? { modelRevision: entry.modelRevision } : {}),
      ...(entry.modelRevisionStatus ? { modelRevisionStatus: entry.modelRevisionStatus } : {}),
    })) } : {}),
  };
}

function usage(): string {
  return `Production-workflow RAG evaluation

Usage:
  npm run evaluate:rag -- --mode live --tenant-id <id> --actor-id <id> [options]

Options:
  --dataset <path>   V1 or V2 dataset (V1 is migrated in memory)
  --report <path>    JSON report path (default: artifacts/rag-evaluation/report.json)
  --case <ids>       Comma-separated case IDs
  --tag <tags>       Comma-separated tags
  --top-k <number>   Evaluation metric cutoff (default: ${DEFAULT_RETRIEVAL_METRIC_CUTOFF_K}); production retrieval is unchanged

The legacy evaluate:fixture and evaluate:live-rag commands remain available.
`;
}

function values(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function parseRagEvaluationArgs(argv: readonly string[]): CliOptions {
  const valuesByFlag = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid argument near ${flag ?? "end of input"}`);
    }
    valuesByFlag.set(flag, value);
  }
  const known = new Set([
    "--mode",
    "--tenant-id",
    "--actor-id",
    "--dataset",
    "--report",
    "--case",
    "--tag",
    "--top-k",
  ]);
  for (const flag of valuesByFlag.keys()) {
    if (!known.has(flag)) throw new Error(`Unknown argument: ${flag}`);
  }
  const mode = valuesByFlag.get("--mode") ?? "live";
  if (mode !== "live") {
    throw new Error("Phase 2 production-workflow evaluation supports --mode live only");
  }
  const tenantId = valuesByFlag.get("--tenant-id");
  const actorId = valuesByFlag.get("--actor-id");
  if (!tenantId || !actorId) throw new Error("--tenant-id and --actor-id are required");
  const topKValue = valuesByFlag.get("--top-k");
  const topK = topKValue === undefined ? undefined : Number(topKValue);
  if (topK !== undefined && (!Number.isInteger(topK) || topK < 1 || topK > 50)) {
    throw new Error("--top-k must be an integer between 1 and 50");
  }
  return {
    mode,
    tenantId,
    actorId,
    datasetPath: valuesByFlag.get("--dataset"),
    reportPath:
      valuesByFlag.get("--report") ??
      path.resolve("artifacts/rag-evaluation/report.json"),
    caseIds: values(valuesByFlag.get("--case")),
    tags: values(valuesByFlag.get("--tag")),
    topK,
  };
}

async function run(options: CliOptions): Promise<number> {
  await connectDB();
  try {
    const actor = await UserModel.findOne({
      _id: options.actorId,
      tenantId: options.tenantId,
      status: "active",
    }).lean().exec();
    if (!actor) throw new Error("Evaluation actor was not found or is inactive");

    const model = await getModelAdapterAsync();
    const modelName =
      (model as typeof model & { model?: string }).model ?? model.providerKey;
    const judge = new LlmJudgeService({ modelAdapter: model });
    const authorization = createEvaluationDocumentAccessAuthorizationService();
    const permissionEvaluator = getPermissionEvaluator();
    const rerankerAdapter = new FakeRerankerAdapter();
    const reranker = createRerankerService({ reranker: rerankerAdapter });
    const fusionEngine = new FusionEngine();
    const embeddingAdapter = await getEmbeddingAdapter();
    assertCompleteRuntimeComponentIdentity(model.runtimeIdentity, "answer model");
    assertCompleteRuntimeComponentIdentity(embeddingAdapter.runtimeIdentity, "embedding");
    assertCompleteRuntimeComponentIdentity(rerankerAdapter.runtimeIdentity, "reranker");
    const modelIdentity = reportRuntimeIdentity(model.runtimeIdentity);
    const embeddingIdentity = reportRuntimeIdentity(embeddingAdapter.runtimeIdentity);
    const rerankerIdentity = reportRuntimeIdentity(rerankerAdapter.runtimeIdentity);
    let retrievalArtifacts: HybridRetrievalArtifacts | null = null;
    const retrieval = createRetrievalService({
      vectorAdapter: await getVectorStoreAdapter(),
      keywordAdapter: await getKeywordAdapter(),
      embeddingAdapter,
      fusionEngine,
      filterCompiler: { compileAccessFilters, compileQueryFilters, mergeFilters },
      repository: createRetrievalRepository(),
      rerankerService: reranker,
      resolveAccessContext: async (context) => {
        const persisted = await authorization.resolveActor({
          tenantId: context.tenantId,
          actorId: context.actorId,
        });
        const resolved = await permissionEvaluator.resolve({
          tenantId: context.tenantId,
          actorId: context.actorId,
          baseRole: persisted.baseRole,
          customRoleId: persisted.customRoleId,
        });
        const scope = resolved.grants.get(Permission.DOCUMENTS_USE_IN_AI)?.scope ?? undefined;
        const departmentIds = scope?.departmentIds.length
          ? [...scope.departmentIds]
          : undefined;
        return {
          ...context,
          baseRole: persisted.baseRole,
          customRoleId: persisted.customRoleId,
          departmentIds: departmentIds ?? [],
          permissionScopes: scope,
          resolvedDepartmentFilter: await resolveDepartmentNames(
            departmentIds,
            context.tenantId,
          ),
          requiredAction: "use_in_ai",
        };
      },
      authorizeDocumentForAi: async (context, documentId) => {
        await authorization.authorizeDocumentAction(
          { tenantId: context.tenantId, actorId: context.actorId },
          documentId,
          "use_in_ai",
        );
      },
      onHybridRetrievalArtifacts: (artifacts) => {
        retrievalArtifacts = artifacts;
      },
      persistenceMode: "ephemeral",
    });
    const authorizedRetrieval = {
      retrieval,
      reranker,
      authorization,
      resolveDocumentHints: ((rawIds, context, rawTitles) =>
        resolveAuthorizedDocumentHints(rawIds, context, rawTitles, {
          authorizationService: authorization,
        })) satisfies AuthorizedRetrievalDependencies["resolveDocumentHints"],
      loadChunksByIds: createDefaultLoadChunksByIds(),
      loadEligibleDocumentIds: createDefaultLoadEligibleDocumentIds(),
    };
    const runtimeSettings = await getTenantSettings(options.tenantId);
    const workflow = new IsolatedProductionRagWorkflow({
      production: {
        model,
        intentQueryService: createIntentQueryService({
          modelAdapter: model,
          conversationContextAdapter: new FakeConversationContextAdapter(),
          persistenceMode: "ephemeral",
          authorizationService: authorization,
        }),
        authorizedRetrieval,
      },
      authorize: (context) => authorizeTenantOperation(context, Permission.CHAT_CREATE),
      permissionEvaluator,
      loadPersistedActor: async (tenantId, actorId) => {
        const user = await findUserDocumentByTenantAndId(tenantId, actorId);
        return user
          ? {
              tenantId: user.tenantId.toString(),
              actorId: user._id.toString(),
              baseRole: user.role,
              customRoleId: user.customRoleId?.toString() ?? null,
              status: user.status,
            }
          : null;
      },
      loadSettings: async (tenantId) => {
        const settings = tenantId === options.tenantId
          ? runtimeSettings
          : await getTenantSettings(tenantId);
        return {
          citationsEnabled: settings.settings.aiRuntimePreferences.citationsEnabled,
          maxTokens: settings.settings.aiRuntimePreferences.maxTokens,
        };
      },
      loadDocumentTitles: async (tenantId, documentIds) => {
        const docs = await DocumentModel.find({
          _id: { $in: documentIds.map((id) => new mongoose.Types.ObjectId(id)) },
          tenantId,
        }).select("_id metadata.title fileName").lean().exec();
        return new Map(docs.map((document) => [
          document._id.toString(),
          document.metadata?.title ?? document.fileName,
        ]));
      },
      consumeRetrievalArtifacts: () => {
        const captured = retrievalArtifacts;
        retrievalArtifacts = null;
        return captured;
      },
      runMetadata: { modelProvider: model.providerKey, modelName },
    });
    const dataset = loadRagEvaluationDatasetV2(options.datasetPath);
    const runner = new RagEvaluationRunner({
      workflow,
      answerRelevanceEvaluator: new AnswerRelevanceEvaluator(judge),
      correctnessEvaluator: new AnswerCorrectnessEvaluator(
        new ModelBackedCorrectnessSemanticJudge(model),
      ),
      caseIds: options.caseIds,
      tags: options.tags,
      topK: options.topK,
      resolveExecutionContext: async () => {
        const effective = await permissionEvaluator.resolve({
          tenantId: options.tenantId,
          actorId: options.actorId,
          baseRole: actor.role,
          customRoleId: actor.customRoleId?.toString() ?? null,
        });
        const grant = effective.grants.get(Permission.DOCUMENTS_USE_IN_AI);
        const departmentNames = grant?.scope?.departmentIds.length
          ? await resolveDepartmentNames([...grant.scope.departmentIds], options.tenantId)
          : undefined;
        return {
          tenantId: options.tenantId,
          actorId: options.actorId,
          actorEmail: actor.email,
          baseRole: actor.role,
          customRoleId: actor.customRoleId?.toString() ?? null,
          documentsUseInAiGranted: grant !== undefined,
          permissionScopes: grant?.scope ?? undefined,
          permissionDepartmentSemanticKeys: departmentNames?.map((name) => {
            const normalized = name.trim().toLowerCase();
            return normalized === "human resources" || normalized === "human resource" ? "hr" : normalized;
          }),
        };
      },
    });
    const output = await runner.run(dataset);
    const report = createRagEvaluationReport({
      datasetVersion: dataset.datasetVersion,
      configuration: {
        name: "production-workflow-phase-2",
        reranker: "FakeRerankerAdapter",
        retrieval: {
          metricCutoffK: options.topK ?? DEFAULT_RETRIEVAL_METRIC_CUTOFF_K,
          workflowTopK: {
            directQuestion: CHAT_DIRECT_RETRIEVAL_TOP_K,
            summarization: CHAT_SUMMARIZATION_RETRIEVAL_TOP_K,
          },
          weights: fusionEngine.runtimeIdentity.weights,
        },
        fusion: {
          strategy: fusionEngine.runtimeIdentity.strategy,
          version: fusionEngine.runtimeIdentity.version,
        },
        rerankerDetails: {
          provider: rerankerIdentity.provider,
          name: rerankerIdentity.model ?? "deterministic-reranker",
          componentVersion: rerankerIdentity.componentVersion,
        },
        embedding: embeddingIdentity,
        answerModel: modelName,
        answer: modelIdentity,
        verifierModel: modelName,
        verifier: modelIdentity,
        answerRelevanceJudge: { ...modelIdentity, promptVersion: JUDGE_EVALUATION_SCHEMA_VERSION },
        semanticCorrectnessJudge: { ...modelIdentity, promptVersion: CORRECTNESS_SEMANTIC_JUDGE_PROMPT_VERSION },
        citationsEnabled: runtimeSettings.settings.aiRuntimePreferences.citationsEnabled,
        maxTokens: runtimeSettings.settings.aiRuntimePreferences.maxTokens,
        promptVersions: {
          intent: INTENT_PROMPT_VERSION,
          answerWriter: ANSWER_WRITER_PROMPT_VERSION,
          citationSemanticVerifier: CITATION_SEMANTIC_PROMPT_VERSION,
          answerRelevanceJudge: JUDGE_EVALUATION_SCHEMA_VERSION,
          semanticCorrectnessJudge: CORRECTNESS_SEMANTIC_JUDGE_PROMPT_VERSION,
        },
        thresholds: {
          answerRelevance: DEFAULT_ANSWER_RELEVANCE_THRESHOLD,
          semanticMaxClaims: MAX_SEMANTIC_CLAIMS,
          semanticMaxClaimLength: MAX_SEMANTIC_CLAIM_LENGTH,
          semanticUnknownRetries: MAX_UNKNOWN_RETRIES,
        },
        evidenceThresholds: {
          minimumTotalScore: EVIDENCE_ITEM_MIN_TOTAL_SCORE,
        },
        workflowVersions: {
          answerWriter: ANSWER_WRITER_AGENT_VERSION,
          citationVerification: CITATION_VERIFICATION_AGENT_VERSION,
          compliance: COMPLIANCE_AGENT_VERSION,
          intentQuery: INTENT_QUERY_AGENT_VERSION,
          workflow: "chat-rag-v1",
        },
        unavailableQualityFields: [],
        metricSemanticsVersion: RAG_METRIC_SEMANTICS_VERSION,
        runtimeIdentityRequired: true,
        metadata: {
          executionMode: "live",
          workflow: "chat-rag-v1",
          ...(options.topK ? { metricTopK: options.topK } : {}),
          productionWorkflowControlsRetrievalTopK: true,
        },
      },
      results: output.results,
    });
    await fs.mkdir(path.dirname(options.reportPath), { recursive: true });
    await fs.writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    process.stdout.write(
      `[RAG evaluation] ${output.results.length} cases, ${report.aggregateMetrics.passedCaseCount} passed; report=${options.reportPath}\n`,
    );
    return output.results.every((result) => result.casePassed) ? 0 : 1;
  } finally {
    await disconnectDB();
  }
}

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    if (argv.includes("--help")) {
      process.stdout.write(usage());
      return;
    }
    const options = parseRagEvaluationArgs(argv);
    process.exitCode = await run(options);
  } catch (error) {
    process.stderr.write(
      `[RAG evaluation error] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.stderr.write(usage());
    process.exitCode = 2;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) await main();
