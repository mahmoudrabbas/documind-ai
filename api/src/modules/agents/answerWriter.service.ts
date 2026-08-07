import { z } from "zod";
import { logger } from "../../common/logger/logger.js";
import { mapLlmProviderError } from "../../providers/llm/providerError.js";
import {
  hasUnclosedReasoningBlock,
  sanitizeAssistantOutput,
} from "../../providers/llm/outputSanitizer.js";
import type { ModelAdapter, ModelCompletionResponse } from "./agents.types.js";
import { AnswerWriterOutputSchema } from "./chatAgentIO.js";
import { buildAnswerWriterDiagnostics } from "./generationDiagnostics.js";
import type { ChatAnswerDecisionValue } from "./chatWorkflowContracts.js";
import type { ChatSource } from "../chat/chat.types.js";
import type { QueryLanguageValue } from "../intent-query/intentQuery.types.js";

// ── Answer task classification ─────────────────────────────────────────────

/**
 * Answer-task classification separates the *retrieval route* (social | rag |
 * clarification | unsupported | unsafe) from the *answer style* the generator
 * should produce. Summary requests must not be forced into the concise style
 * used for direct questions.
 */
export type AnswerTask = "direct_question" | "document_summary";

const RAG_SYSTEM_PROMPT = `You are DocuMind AI, an assistant that answers ONLY from the provided document context. Return JSON ONLY (no prose) with the exact keys: {"decision","answer","citedChunkIds"}. decision must be one of: "grounded_answer","insufficient_evidence","clarification","unsupported","unsafe". answer must be a concise string in the user's language. citedChunkIds must be an array of chunkId strings (may be empty for non-grounded decisions). Do NOT include any other keys, citations, or markdown fences.`;
const RAG_SYSTEM_PROMPT_NO_CITATIONS = `You are DocuMind AI, an intelligent assistant that answers questions based on company documents. You must ONLY answer using the provided context from the company's knowledge base. If the context does not contain enough information to answer the question, say so clearly. Never make up information. Be concise and helpful. Do not include any citations, source references, footnotes, document titles, or page numbers in your answer.`;
const RAG_SUMMARY_SYSTEM_PROMPT = `You are DocuMind AI, an assistant that answers ONLY from the provided document context. Return JSON ONLY (no prose) with the exact keys: {"decision","answer","citedChunkIds"}. decision must be one of: "grounded_answer","insufficient_evidence","clarification","unsupported","unsafe". answer must be a structured summary in the user's language written ONLY from the provided context: a short opening statement, then several distinct evidence-grounded points organized as paragraphs or bullet points, and a brief conclusion when the context supports one. Do not invent facts, figures, or points that are not present in the context. If the evidence supports only one point, give a short summary of that point rather than padding with fabricated content. If the context is insufficient, set decision to "insufficient_evidence" and answer a short message explaining that no evidence supports a summary. citedChunkIds must be an array of chunkId strings for the sources you actually used (may be empty for non-grounded decisions). Do NOT include any other keys, citations, or markdown fences.`;
const RAG_SUMMARY_SYSTEM_PROMPT_NO_CITATIONS = `You are DocuMind AI, an intelligent assistant that answers based on company documents. You must ONLY answer using the provided context from the company's knowledge base. Write a structured summary in the user's language: a short opening, then several distinct points grounded in the context organized as paragraphs or bullet points, and a brief conclusion when supported. Never make up information or points that are not present in the context. If the context does not contain enough information for a summary, say so clearly. Do not include any citations, source references, footnotes, document titles, or page numbers in your answer.`;
const RAG_SYSTEM_PROMPT_AR = `أنت DocuMind AI، مساعد ذكي يجيب على الأسئلة بناءً على مستندات الشركة فقط. يجب أن تجيب باستخدام السياق المقدم من قاعدة المعرفة فقط. إذا لم يكن السياق كافياً للإجابة، قل ذلك بوضوح. لا تختلق معلومات. كن موجزاً ومفيداً. عند الاستشهاد بمعلومات، اذكر المستند الذي جاءت منه.

قاعدة اللغة الصارمة: يجب أن تكون إجابتك بالكامل باللغة العربية فقط. لا تستخدم أي لغة أخرى (لا صينية، لا يابانية، لا كورية، لا أي لغة غير العربية أو الإنجليزية). المصطلحات التقنية الإنجليزية المتعارف عليها مقبولة فقط.`;
const RAG_SYSTEM_PROMPT_NO_CITATIONS_AR = `أنت DocuMind AI، مساعد ذكي يجيب على الأسئلة بناءً على مستندات الشركة فقط. يجب أن تجيب باستخدام السياق المقدم من قاعدة المعرفة فقط. إذا لم يكن السياق كافياً للإجابة، قل ذلك بوضوح. لا تختلق معلومات. كن موجزاً ومفيداً. لا تضمن أي استشهادات، أو مراجع للمصادر، أو حواشي سفلى، أو عناوين مستندات، أو أرقام صفحات في إجابتك.

قاعدة اللغة الصارمة: يجب أن تكون إجابتك بالكامل باللغة العربية فقط. لا تستخدم أي لغة أخرى (لا صينية، لا يابانية، لا كورية، لا أي لغة غير العربية أو الإنجليزية). المصطلحات التقنية الإنجليزية المتعارف عليها مقبولة فقط.`;

export function isArabicContext(language: QueryLanguageValue): boolean {
  return language === "ar" || language === "mixed";
}

/**
 * Localized fail-closed message. Same text the legacy ChatService path uses
 * when no authorized evidence reaches the generator; the agent reuses it so
 * Case A (no valid evidence) and Case B (invalid generation output) produce
 * one consistent user-facing message.
 */
export const INSUFFICIENT_AUTHORIZED_EVIDENCE =
  "I don't have sufficient authorized evidence to answer that question.";
export const INSUFFICIENT_AUTHORIZED_EVIDENCE_AR =
  "عذراً، لم أتمكن من العثور على معلومات كافية في المستندات المتاحة للإجابة على سؤالك. يرجى التأكد من رفع المستندات ذات الصلة أو إعادة صياغة سؤالك.";

export function insufficientEvidenceMessage(
  language: QueryLanguageValue = "en",
): string {
  return isArabicContext(language)
    ? INSUFFICIENT_AUTHORIZED_EVIDENCE_AR
    : INSUFFICIENT_AUTHORIZED_EVIDENCE;
}

function systemPromptFor(task: AnswerTask, citationsEnabled: boolean): string {
  if (task === "document_summary") {
    return citationsEnabled
      ? RAG_SUMMARY_SYSTEM_PROMPT
      : RAG_SUMMARY_SYSTEM_PROMPT_NO_CITATIONS;
  }
  return citationsEnabled ? RAG_SYSTEM_PROMPT : RAG_SYSTEM_PROMPT_NO_CITATIONS;
}

function ragContextInstruction(
  citationsEnabled: boolean,
  language: QueryLanguageValue = "en",
): string {
  if (isArabicContext(language)) {
    return citationsEnabled
      ? "استخدم السياق التالي للإجابة على السؤال. اذكر دائماً مصادرك."
      : "استخدم السياق التالي للإجابة على السؤال. لا تذكر أو تستشهد بمصادرك أو المستندات أو أرقام الصفحات في الإجابة.";
  }
  return citationsEnabled
    ? "Use the following context to answer the question. Always cite your sources."
    : "Use the following context to answer the question. Do not mention or cite your sources, documents, or page numbers in the answer.";
}

export function buildRagMessages(options: {
  citationsEnabled: boolean;
  historyFromDb: Array<{ role: "user" | "assistant"; content: string }>;
  sources: ChatSource[];
  userMessage: string;
  task?: AnswerTask;
  language?: QueryLanguageValue;
}): { role: "system" | "user" | "assistant"; content: string }[] {
  const { citationsEnabled, historyFromDb, sources, userMessage, task = "direct_question", language = "en" } = options;

  let systemPrompt: string;
  if (isArabicContext(language) && task !== "document_summary") {
    systemPrompt = citationsEnabled
      ? RAG_SYSTEM_PROMPT_AR
      : RAG_SYSTEM_PROMPT_NO_CITATIONS_AR;
  } else {
    systemPrompt = systemPromptFor(task, citationsEnabled);
  }

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

  if (historyFromDb.length > 0) {
    for (const msg of historyFromDb.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  if (sources.length > 0) {
    const useAr = isArabicContext(language);
    const contextHeader = useAr ? "السياق:" : "Context:";
    const contextBlock = sources
      .map(
        (s, i) =>
          useAr
            ? `[المصدر ${i + 1}: id:${s.chunkId} doc:${s.documentId} العنوان:${s.documentTitle}${s.sectionTitle ? ` — ${s.sectionTitle}` : ""}${s.pageNumber ? ` (صفحة ${s.pageNumber})` : ""}]\n${s.text}`
            : `[Source ${i + 1}: id:${s.chunkId} doc:${s.documentId} title:${s.documentTitle}${s.sectionTitle ? ` — ${s.sectionTitle}` : ""}${s.pageNumber ? ` (p.${s.pageNumber})` : ""}]\n${s.text}`,
      )
      .join("\n\n");

    messages.push({
      role: "system",
      content: `${ragContextInstruction(citationsEnabled, language)}\n\n${contextHeader}\n${contextBlock}`,
    });
  }

  messages.push({ role: "user", content: userMessage });
  return messages;
}

// ── Reusable AnswerWriter service ──────────────────────────────────────────

export interface AnswerWriterEvidenceItem {
  chunkId: string;
  documentId: string;
  documentVersionId?: string;
  text: string;
  pageNumber?: number;
  sectionTitle?: string;
  documentTitle?: string;
}

export interface AnswerWriterServiceOptions {
  conversationId: string;
  question: string;
  language?: QueryLanguageValue;
  task?: AnswerTask;
  citationsEnabled: boolean;
  historyFromDb?: Array<{ role: "user" | "assistant"; content: string }>;
  evidence: readonly AnswerWriterEvidenceItem[];
  maxTokens: number;
}

interface AnswerWriterServiceCommon {
  rawContent: string;
  sanitizedContent: string;
  providerKey: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCost: number;
}

export type AnswerWriterServiceResult =
  | (AnswerWriterServiceCommon & {
      outcome: "usable";
      /**
       * true iff the model output parsed as a valid contract JSON object with a
       * known decision. false for the parse-failure fallback, where `answer`
       * carries the localized fail-closed message and the raw provider output
       * is never surfaced.
       */
      structured: boolean;
      /**
       * The decision the model actually declared, before normalization. The
       * service downgrades `grounded_answer` with zero citations to
       * `insufficient_evidence` for the legacy ChatService path; consumers that
       * fail closed (the agent) need the pre-normalization value to distinguish
       * "model claimed grounded with no support" from a genuine declaration.
       */
      parsedDecision: ChatAnswerDecisionValue;
      decision: ChatAnswerDecisionValue;
      answer: string;
      citedChunkIds: string[];
    })
  | (AnswerWriterServiceCommon & { outcome: "unusable" });

type AnswerParseResult =
  | { ok: true; data: z.infer<typeof AnswerWriterOutputSchema> }
  | { ok: false; error: unknown };

function parseAnswerWriterJson(rawContent: string): AnswerParseResult {
  let body = rawContent.trim();
  if (body.startsWith("```")) {
    body = body.replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
  }
  if (!body.startsWith("{")) {
    return { ok: false, error: new Error("No JSON object present") };
  }
  try {
    const obj = JSON.parse(body);
    const parsed = AnswerWriterOutputSchema.safeParse(obj as unknown);
    if (parsed.success) return { ok: true, data: parsed.data };
    return { ok: false, error: parsed.error };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Provider-neutral, reusable answer-generation service. Builds the RAG
 * messages, invokes the injected model adapter, and normalizes the structured
 * output fail-closed into the canonical {decision, answer, citedChunkIds}
 * contract shared by the legacy ChatService path and the answer-writer-agent.
 * The service is pure: it never loads evidence, never resolves identity, and
 * never persists anything.
 */
export class AnswerWriterService {
  constructor(private readonly modelAdapter: ModelAdapter) {}

  /**
   * Issue 6 observability: emit one metadata-only log per generation. The
   * payload is built by buildAnswerWriterDiagnostics and contains decisions
   * and counts only — never answer text, raw model output, document text,
   * chunk ids, or document ids. Exactly one log is emitted per generate()
   * because exactly one branch returns.
   */
  private emitGeneration(
    result: AnswerWriterServiceResult,
  ): AnswerWriterServiceResult {
    logger.info(
      buildAnswerWriterDiagnostics(result),
      "answer writer generation outcome",
    );
    return result;
  }

  async generate(
    options: AnswerWriterServiceOptions,
  ): Promise<AnswerWriterServiceResult> {
    const {
      question,
      language = "en",
      task = "direct_question",
      citationsEnabled,
      historyFromDb = [],
      evidence,
      maxTokens,
    } = options;

    const sources: ChatSource[] = evidence.map((item) => ({
      chunkId: item.chunkId,
      documentId: item.documentId,
      text: item.text,
      pageNumber: item.pageNumber,
      sectionTitle: item.sectionTitle,
      score: 0,
      documentTitle: item.documentTitle ?? "Unknown Document",
    }));

    const messages = buildRagMessages({
      citationsEnabled,
      historyFromDb,
      sources,
      userMessage: question,
      task,
      language,
    });

    let response: ModelCompletionResponse;
    try {
      response = await this.modelAdapter.complete({
        messages,
        temperature: 0.3,
        maxTokens,
        // Enforce structured output at the provider boundary: the strict
        // AnswerWriter contract requires a JSON object, so request JSON mode
        // instead of relying on the system prompt alone. The provider returns
        // syntactically valid JSON, but server-side JSON.parse + strict Zod
        // validation remain the security boundary (see parseAnswerWriterJson).
        structuredOutput: { type: "json_object" },
      });
    } catch (error) {
      throw mapLlmProviderError(error);
    }

    const rawContent = response.choices[0]?.message?.content ?? "";
    const sanitizedContent = sanitizeAssistantOutput(rawContent);

    const common: AnswerWriterServiceCommon = {
      rawContent,
      sanitizedContent,
      providerKey: this.modelAdapter.providerKey,
      modelName: response.model || this.modelAdapter.providerKey,
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
      totalTokens: response.usage?.totalTokens ?? 0,
      latencyMs: response.latencyMs,
      estimatedCost: response.estimatedCost,
    };

    if (!sanitizedContent) {
      return this.emitGeneration({ outcome: "unusable", ...common });
    }

    const parsed = parseAnswerWriterJson(rawContent);
    if (!parsed.ok) {
      // The raw provider output must never become user-facing text: it may be
      // malformed JSON, JSON wrapped in prose/markdown, or schema-rejected
      // (unknown keys, invalid decision, bad citedChunkIds). Fail closed with
      // the same localized refusal the legacy chat already uses when no
      // authorized evidence reaches the generator. Consumers that need the
      // model text branch on `structured` and produce their own safe message.
      return this.emitGeneration({
        outcome: "usable",
        structured: false,
        parsedDecision: "insufficient_evidence",
        decision: "insufficient_evidence",
        answer: insufficientEvidenceMessage(language),
        citedChunkIds: [],
        ...common,
      });
    }

    const structuredAnswer = parsed.data.answer;
    const cleanStructured = hasUnclosedReasoningBlock(structuredAnswer)
      ? ""
      : sanitizeAssistantOutput(structuredAnswer);
    if (!cleanStructured) {
      return this.emitGeneration({ outcome: "unusable", ...common });
    }

    const evidenceIdSet = new Set(evidence.map((item) => item.chunkId));
    const citedChunkIds = parsed.data.citedChunkIds.filter((id) =>
      evidenceIdSet.has(id),
    );

    let decision: ChatAnswerDecisionValue = parsed.data.decision;
    if (decision === "grounded_answer" && citedChunkIds.length === 0) {
      decision = "insufficient_evidence";
    }

    return this.emitGeneration({
      outcome: "usable",
      structured: true,
      parsedDecision: parsed.data.decision,
      decision,
      answer: cleanStructured,
      citedChunkIds,
      ...common,
    });
  }
}
