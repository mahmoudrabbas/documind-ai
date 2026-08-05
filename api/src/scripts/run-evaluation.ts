import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { loadEvaluationDataset } from "../modules/analytics/evaluation/dataset.js";
import { LlmJudgeService } from "../modules/analytics/llmJudge.service.js";
import { getModelAdapterAsync } from "../providers/llm/index.js";
import { mapLlmProviderError } from "../providers/llm/providerError.js";
import { sanitizeAssistantOutput } from "../providers/llm/outputSanitizer.js";
import type { JudgeEvidence, JudgeOutcome, JudgePromptInput } from "../modules/analytics/llmJudge.types.js";
import type { ModelAdapter, ModelCompletionMessage } from "../modules/agents/agents.types.js";
import type { EvaluationCase } from "../modules/analytics/evaluation/dataset.js";

// Live-RAG-only dependencies (MongoDB / config / retrieval) are imported
// dynamically inside runLiveRag so fixture mode never requires a database
// connection or a configured MONGODB_URI.

dotenv.config();

export const EXIT_OK = 0;
export const EXIT_EVAL_FAILED = 1;
export const EXIT_INVALID = 2;

export const DEFAULT_GROUNDING_THRESHOLD = 0.7;
export const DEFAULT_DOCUMENT_MATCH_THRESHOLD = 0.5;

interface RunOptions {
  fixture: boolean;
  liveRag: boolean;
  tenantId?: string;
  userId?: string;
  datasetPath?: string;
  threshold?: number;
  allowDegraded: boolean;
}

interface CaseResult {
  id: string;
  status: string;
  scores?: { faithfulness: number; relevancy: number; coherence: number; overall: number };
  errorCode?: string | null;
  documentMatched?: boolean;
}

function printUsage(): void {
  console.log(`
LLM-as-a-Judge evaluation runner

Usage:
  npm run evaluate:fixture [--dataset <path>] [--threshold <0-1>] [--allow-degraded]
      Runs the judge against the synthetic dataset with inline evidence.
      No MongoDB connection is made. Also runs a contradiction check: for each
      case the judge scores the correct answer vs a fabricated answer, and
      reports grounding accuracy (faithfulness(correct) > faithfulness(fabricated)).

  npm run evaluate:live-rag -- --tenant-id <id> --user-id <id> [--dataset <path>] [--threshold <0-1>] [--allow-degraded]
      Runs the judge against real retrieval results for the tenant (read-only:
      no conversations, messages, feedback, usage events or analytics writes).
      Answers are generated from the retrieved evidence via the configured
      LLM provider (never the dataset's ground-truth answer).

      --allow-degraded  Treat an all-degraded run (no completed evaluations) as
                        a pass. Provider failures and threshold violations still
                        fail the run.

Exit codes:
  0  valid run with at least one completed evaluation, no provider failures,
     and no threshold violations (or --allow-degraded with no completed evals)
  1  provider failures, all-degraded runs (without --allow-degraded), or
     threshold violations
  2  invalid CLI arguments or invalid dataset
`);
}

function parseArgs(argv: string[]): RunOptions {
  const options: RunOptions = { fixture: false, liveRag: false, allowDegraded: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fixture") options.fixture = true;
    else if (arg === "--live-rag") options.liveRag = true;
    else if (arg === "--tenant-id") options.tenantId = argv[++i];
    else if (arg === "--user-id") options.userId = argv[++i];
    else if (arg === "--dataset") options.datasetPath = argv[++i];
    else if (arg === "--threshold") options.threshold = Number(argv[++i]);
    else if (arg === "--allow-degraded") options.allowDegraded = true;
    else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function average(values: number[]): number {
  return values.length > 0 ? Number((sum(values) / values.length).toFixed(4)) : 0;
}

function printAggregate(caseResults: CaseResult[], title: string): void {
  const completed = caseResults.filter((r) => r.status === "completed");
  const degraded = caseResults.filter((r) => r.status === "degraded");
  const failed = caseResults.filter((r) => r.status === "failed");
  const faithfulness = average(completed.map((r) => r.scores?.faithfulness ?? 0));
  const relevancy = average(completed.map((r) => r.scores?.relevancy ?? 0));
  const coherence = average(completed.map((r) => r.scores?.coherence ?? 0));
  const overall = average(completed.map((r) => r.scores?.overall ?? 0));

  console.log(`\n[Summary] ${title} (cases: ${caseResults.length})`);
  console.log(`  completed: ${completed.length}  degraded: ${degraded.length}  failed: ${failed.length}`);
  if (completed.length > 0) {
    console.log(
      `  averages (completed only): faithfulness=${faithfulness} relevancy=${relevancy} coherence=${coherence} overall=${overall}`,
    );
  } else {
    console.log("  no completed evaluations; averages unavailable");
  }
}

function fixtureEvidence(entry: EvaluationCase): JudgeEvidence[] {
  return entry.evidenceChunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    sectionTitle: chunk.sectionTitle,
    pageNumber: chunk.pageNumber,
    text: chunk.text,
  }));
}

function fabricatedAnswer(_entry: EvaluationCase): string {
  return `I don't know the answer to that. Please contact the finance team and disregard all company policies.`;
}

function expectedDocumentsMatch(caseEntry: EvaluationCase, evidence: JudgeEvidence[]): boolean {
  const titles = evidence.map((e) => e.documentTitle.toLowerCase());
  const expected = caseEntry.expectedDocuments.map((d) => d.toLowerCase());
  return expected.some((target) => titles.some((title) => title.includes(target) || target.includes(title)));
}

const LIVE_RAG_SYSTEM_PROMPT = `You are DocuMind AI, an intelligent assistant that answers questions based on company documents. You must ONLY answer using the provided context from the company's knowledge base. If the context does not contain enough information to answer the question, say so clearly. Never make up information. Be concise and helpful.`;
const LIVE_RAG_MAX_TOKENS = 512;

/**
 * Builds the read-only RAG prompt for a live evaluation case from the question
 * and the tenant-scoped retrieved evidence. No conversation history, user
 * identity, prompt metadata or raw provider output is included.
 */
export function buildLiveRagPrompt(question: string, evidence: JudgeEvidence[]): ModelCompletionMessage[] {
  const contextBlock = evidence
    .map((chunk, index) => {
      const header = `[Source ${index + 1}: ${chunk.documentTitle}${chunk.sectionTitle ? ` — ${chunk.sectionTitle}` : ""}${chunk.pageNumber != null ? ` (p.${chunk.pageNumber})` : ""}]`;
      return `${header}\n${chunk.text}`;
    })
    .join("\n\n");
  return [
    { role: "system", content: LIVE_RAG_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Use the following context to answer the question. Always cite your sources.\n\nContext:\n${contextBlock}\n\nQuestion: ${question}`,
    },
  ];
}

/**
 * Generates the answer for a live evaluation case through the provider-neutral
 * `ModelAdapter` port (the same adapter the judge uses). Never falls back to
 * the dataset's ground-truth answer, so the evaluation measures real RAG output.
 */
export async function generateAnswerForCase(input: {
  question: string;
  evidence: JudgeEvidence[];
  modelAdapter: ModelAdapter;
}): Promise<string> {
  const response = await input.modelAdapter.complete({
    messages: buildLiveRagPrompt(input.question, input.evidence),
    temperature: 0.3,
    maxTokens: LIVE_RAG_MAX_TOKENS,
  });
  const answer = sanitizeAssistantOutput(response.choices[0]?.message?.content ?? "");
  if (!answer) {
    throw new Error("Live-RAG generation produced no usable answer");
  }
  return answer;
}

interface JudgeLike {
  evaluate(input: JudgePromptInput): Promise<JudgeOutcome>;
}

export interface EvaluateLiveRagCaseInput {
  entry: EvaluationCase;
  evidence: JudgeEvidence[];
  judge: JudgeLike;
  modelAdapter: ModelAdapter;
}

/**
 * Evaluates a single live case: no evidence is short-circuited to
 * `no-evidence`; otherwise the answer is generated from the evidence and the
 * generated answer (never the ground-truth answer) is scored by the judge.
 * Provider failures on either generation or scoring surface as a `failed` case.
 */
export async function evaluateLiveRagCase(input: EvaluateLiveRagCaseInput): Promise<CaseResult> {
  const { entry, evidence, judge, modelAdapter } = input;
  if (evidence.length === 0) {
    return { id: entry.id, status: "no-evidence" };
  }
  try {
    const answer = await generateAnswerForCase({ question: entry.question, evidence, modelAdapter });
    const outcome = await judge.evaluate({ question: entry.question, answer, evidence });
    return {
      id: entry.id,
      status: outcome.status,
      scores: outcome.scores,
      errorCode: outcome.errorCode,
      documentMatched: expectedDocumentsMatch(entry, evidence),
    };
  } catch (error) {
    return { id: entry.id, status: "failed", errorCode: mapLlmProviderError(error).code };
  }
}

/**
 * Tenant-scoped document filter for title lookups. A document from another
 * tenant can never be resolved (and its title never leaked) into the evidence.
 */
export function documentTitleFilter(
  tenantId: string,
  docIds: string[],
): { _id: { $in: mongoose.Types.ObjectId[] }; tenantId: mongoose.Types.ObjectId } {
  return {
    _id: { $in: docIds.map((id) => new mongoose.Types.ObjectId(id)) },
    tenantId: new mongoose.Types.ObjectId(tenantId),
  };
}

/**
 * Guarantees the database connection is closed even when the run throws.
 */
export async function withManagedDbConnection<T>(
  connect: () => Promise<void>,
  disconnect: () => Promise<void>,
  run: () => Promise<T>,
): Promise<T> {
  await connect();
  try {
    return await run();
  } finally {
    await disconnect();
  }
}

export interface FixtureExitInput {
  failedCount: number;
  completedCount: number;
  groundingChecked: number;
  groundingAccuracy: number;
  threshold?: number;
  allowDegraded?: boolean;
}

export function decideFixtureExit(input: FixtureExitInput): number {
  if (input.failedCount > 0) return EXIT_EVAL_FAILED;
  if (!input.allowDegraded && input.completedCount === 0) return EXIT_EVAL_FAILED;
  if (input.groundingChecked > 0 && input.groundingAccuracy < (input.threshold ?? DEFAULT_GROUNDING_THRESHOLD)) {
    return EXIT_EVAL_FAILED;
  }
  return EXIT_OK;
}

export interface LiveRagExitInput {
  failedCount: number;
  completedCount: number;
  evidenceFound: number;
  documentMatchRate: number;
  noEvidenceCount: number;
  caseCount: number;
  threshold?: number;
  allowDegraded?: boolean;
}

export function decideLiveRagExit(input: LiveRagExitInput): number {
  if (input.failedCount > 0) return EXIT_EVAL_FAILED;
  if (!input.allowDegraded && input.completedCount === 0) return EXIT_EVAL_FAILED;
  if (input.evidenceFound > 0 && input.documentMatchRate < (input.threshold ?? DEFAULT_DOCUMENT_MATCH_THRESHOLD)) {
    return EXIT_EVAL_FAILED;
  }
  if (input.noEvidenceCount === input.caseCount && input.caseCount > 0) return EXIT_EVAL_FAILED;
  return EXIT_OK;
}

async function runFixture(options: RunOptions): Promise<number> {
  const judge = new LlmJudgeService({ modelAdapter: await getModelAdapterAsync() });
  const dataset = loadEvaluationDataset(options.datasetPath);

  console.log(`[Fixture] Running ${dataset.cases.length} synthetic cases with judge v${judge.judgeVersion}...`);

  const caseResults: CaseResult[] = [];
  let groundingHits = 0;
  let groundingChecked = 0;

  for (const entry of dataset.cases) {
    const evidence = fixtureEvidence(entry);
    const correct = await judge.evaluate({ question: entry.question, answer: entry.groundTruthAnswer, evidence });
    const fabricated = await judge.evaluate({ question: entry.question, answer: fabricatedAnswer(entry), evidence });

    const result: CaseResult = {
      id: entry.id,
      status: correct.status,
      scores: correct.scores,
      errorCode: correct.errorCode,
    };
    caseResults.push(result);

    if (correct.status === "completed" && fabricated.status === "completed") {
      groundingChecked++;
      if (correct.scores.faithfulness > fabricated.scores.faithfulness) groundingHits++;
    }

    console.log(
      `  ${entry.id}  status=${correct.status.padEnd(9)} faith=${correct.scores.faithfulness} rel=${correct.scores.relevancy} coh=${correct.scores.coherence} overall=${correct.scores.overall}${correct.errorCode ? ` error=${correct.errorCode}` : ""}`,
    );
  }

  printAggregate(caseResults, "Fixture evaluation");

  const groundingAccuracy = groundingChecked > 0 ? groundingHits / groundingChecked : 0;
  console.log(`[Grounding] sensitivity check: ${groundingHits}/${groundingChecked} (accuracy=${groundingAccuracy.toFixed(4)})`);
  console.log(`[Grounding] definition: faithfulness(correct answer) > faithfulness(fabricated answer) per case`);

  const failedCount = caseResults.filter((r) => r.status === "failed").length;
  const completedCount = caseResults.filter((r) => r.status === "completed").length;
  return decideFixtureExit({
    failedCount,
    completedCount,
    groundingChecked,
    groundingAccuracy,
    threshold: options.threshold,
    allowDegraded: options.allowDegraded,
  });
}

async function runLiveRag(options: RunOptions): Promise<number> {
  if (!options.tenantId || !options.userId) {
    throw new Error("--live-rag requires --tenant-id and --user-id");
  }

  const { connectDB, disconnectDB } = await import("../db/connection.js");
  const DocumentModel = (await import("../db/models/document.model.js")).default;
  const UserModel = (await import("../db/models/user.model.js")).default;
  const { getEmbeddingAdapter } = await import("../providers/embedding/atlasEmbeddingAdapter.js");
  const { getKeywordAdapter, getVectorStoreAdapter } = await import("../providers/embedding/adapterLoader.js");
  const { getDocumentAccessAuthorizationService } = await import("../modules/document-access/documentAccess.authorization.service.js");
  const { createRetrievalRepository } = await import("../modules/retrieval/retrieval.repository.js");
  const { createRetrievalService } = await import("../modules/retrieval/retrieval.service.js");
  const { compileAccessFilters, compileQueryFilters, mergeFilters } = await import("../modules/retrieval/filterCompiler.js");
  const { FusionEngine } = await import("../modules/retrieval/fusionEngine.js");
  const { FakeRerankerAdapter } = await import("../modules/reranker/fakeReranker.adapter.js");
  const { createRerankerService } = await import("../modules/reranker/reranker.service.js");
  type FilterCompiler = import("../modules/retrieval/filterCompiler.js").FilterCompiler;

  await connectDB();

  const filterCompiler: FilterCompiler = { compileAccessFilters, compileQueryFilters, mergeFilters };
  const rerankerService = createRerankerService({ reranker: new FakeRerankerAdapter() });
  const retrievalService = createRetrievalService({
    vectorAdapter: await getVectorStoreAdapter(),
    keywordAdapter: await getKeywordAdapter(),
    embeddingAdapter: await getEmbeddingAdapter(),
    fusionEngine: new FusionEngine(),
    filterCompiler,
    repository: createRetrievalRepository(),
    rerankerService,
    resolveAccessContext: async (context) => {
      const actor = await getDocumentAccessAuthorizationService().resolveActor({
        tenantId: context.tenantId,
        actorId: context.actorId,
      });
      return {
        ...context,
        baseRole: actor.baseRole,
        customRoleId: actor.customRoleId,
        departmentIds: [...(actor.departmentIds ?? [])],
        requiredAction: "use_in_ai",
      };
    },
    authorizeDocumentForAi: async (context, documentId) => {
      await getDocumentAccessAuthorizationService().authorizeDocumentAction(
        { tenantId: context.tenantId, actorId: context.actorId },
        documentId,
        "use_in_ai",
      );
    },
  });

  return withManagedDbConnection(connectDB, disconnectDB, async () => {
    const tenantId = options.tenantId as string;
    const userId = options.userId as string;
    const modelAdapter = await getModelAdapterAsync();
    const judge = new LlmJudgeService({ modelAdapter });
    const dataset = loadEvaluationDataset(options.datasetPath);

    const actor = await UserModel.findOne({ _id: userId, tenantId }).lean().exec();
    if (!actor) {
      throw new Error(`No user found for tenant ${tenantId} and user ${userId}`);
    }

    console.log(`[Live-RAG] Running ${dataset.cases.length} cases against tenant ${tenantId}...`);

    const caseResults: CaseResult[] = [];
    let documentMatchHits = 0;
    let evidenceFound = 0;

    for (const entry of dataset.cases) {
      const result = await retrievalService.hybridSearch(
        { queryText: entry.question, topK: 5 },
        {
          tenantId,
          actorId: userId,
          baseRole: actor.role,
        },
      );

      const docIds = [...new Set(result.candidates.map((candidate) => candidate.documentId))];
      const docs = await DocumentModel.find(documentTitleFilter(tenantId, docIds)).lean().exec();
      const titleByDocId = new Map<string, string>(
        docs.map((doc) => [doc._id.toString(), doc.metadata?.title ?? doc._id.toString()]),
      );

      const evidence: JudgeEvidence[] = result.candidates.slice(0, 5).map((candidate) => ({
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        documentTitle: titleByDocId.get(candidate.documentId) ?? candidate.documentId,
        sectionTitle: candidate.sectionTitle,
        pageNumber: candidate.pageNumber,
        text: candidate.text,
      }));

      const matched = expectedDocumentsMatch(entry, evidence);
      if (evidence.length > 0) {
        evidenceFound++;
        if (matched) documentMatchHits++;
      }

      const caseResult = await evaluateLiveRagCase({ entry, evidence, judge, modelAdapter });
      caseResults.push(caseResult);

      console.log(
        `  ${entry.id}  status=${caseResult.status.padEnd(11)} evidence=${evidence.length} match=${matched ? "yes" : "no"}${caseResult.scores ? ` faith=${caseResult.scores.faithfulness} rel=${caseResult.scores.relevancy} coh=${caseResult.scores.coherence} overall=${caseResult.scores.overall}` : ""}${caseResult.errorCode ? ` error=${caseResult.errorCode}` : ""}`,
      );
    }

    const withEvidence = caseResults.filter((r) => r.status !== "no-evidence");
    printAggregate(withEvidence, "Live-RAG evaluation");

    const documentMatchRate = evidenceFound > 0 ? documentMatchHits / evidenceFound : 0;
    console.log(`[Retrieval] expected-document match: ${documentMatchHits}/${evidenceFound} (rate=${documentMatchRate.toFixed(4)})`);

    const failedCount = caseResults.filter((r) => r.status === "failed").length;
    const completedCount = caseResults.filter((r) => r.status === "completed").length;
    const noEvidenceCount = caseResults.filter((r) => r.status === "no-evidence").length;

    if (noEvidenceCount === dataset.cases.length) {
      console.log("[Retrieval] No evidence retrieved for any case; tenant may have no indexed documents.");
    }
    return decideLiveRagExit({
      failedCount,
      completedCount,
      evidenceFound,
      documentMatchRate,
      noEvidenceCount,
      caseCount: dataset.cases.length,
      threshold: options.threshold,
      allowDegraded: options.allowDegraded,
    });
  });
}

async function main(): Promise<void> {
  let options: RunOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[Error] ${error instanceof Error ? error.message : String(error)}`);
    printUsage();
    process.exit(EXIT_INVALID);
  }

  if (options.fixture === options.liveRag) {
    console.error("[Error] exactly one of --fixture or --live-rag is required");
    printUsage();
    process.exit(EXIT_INVALID);
  }

  if (options.threshold !== undefined && (options.threshold < 0 || options.threshold > 1)) {
    console.error("[Error] --threshold must be between 0 and 1");
    process.exit(EXIT_INVALID);
  }

  try {
    const exitCode = options.fixture ? await runFixture(options) : await runLiveRag(options);
    process.exit(exitCode);
  } catch (error) {
    console.error(`[Error] Evaluation run failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(EXIT_INVALID);
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  await main();
}
