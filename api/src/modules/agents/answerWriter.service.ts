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
import { formatThresholdComparisons } from "./thresholdSemantics.js";

// ── Answer task classification ─────────────────────────────────────────────

/**
 * Answer-task classification separates the *retrieval route* (social | rag |
 * clarification | unsupported | unsafe) from the *answer style* the generator
 * should produce. Summary requests must not be forced into the concise style
 * used for direct questions.
 */
export type AnswerTask = "direct_question" | "document_summary";

const ANSWER_WRITER_JSON_CONTRACT = `Return JSON ONLY with the exact keys: {"decision","answer","citedChunkIds"}. decision must be one of: "grounded_answer","insufficient_evidence","clarification","unsupported","unsafe". answer must be a string. citedChunkIds must be an array containing only supplied chunkId strings actually used for the answer (and may be empty for non-grounded decisions). Do NOT include any other keys, markdown fences, conversational preamble, or prose outside the JSON object.`;

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

function systemPromptFor(
  task: AnswerTask,
  citationsEnabled: boolean,
  language: QueryLanguageValue,
): string {
  const useAr = isArabicContext(language);
  const groundingInstruction = useAr
    ? "أنت DocuMind AI، مساعد يجيب فقط من سياق مستندات الشركة المقدم. لا تختلق معلومات، وإذا لم يكن السياق كافياً فاستخدم القرار insufficient_evidence."
    : "You are DocuMind AI, an assistant that answers ONLY from the provided company-document context. Never invent information; when the context is insufficient, use the insufficient_evidence decision.";
  const taskInstruction =
    task === "document_summary"
      ? useAr
        ? "يجب أن تكون قيمة answer ملخصاً منظماً: مقدمة قصيرة، ثم نقاط مختلفة مدعومة بالسياق، وخاتمة قصيرة عندما يدعمها السياق. لا تضف نقاطاً غير موجودة في الأدلة."
        : "The answer value must be a structured summary: a short opening, distinct evidence-grounded points, and a brief conclusion when supported. Do not add points absent from the evidence."
      : useAr
        ? "يجب أن تكون قيمة answer موجزة ومفيدة وتجيب عن السؤال الحالي فقط."
        : "The answer value must be concise, helpful, and answer only the current question.";
  const languageInstruction = useAr
    ? "يجب أن تكون قيمة answer بالكامل باللغة العربية، باستثناء المصطلحات التقنية الإنجليزية المتعارف عليها عند الضرورة."
    : "The answer value must use the user's language.";
  const citationInstruction = citationsEnabled
    ? useAr
      ? "ضع في citedChunkIds فقط معرفات المقاطع المقدمة التي استُخدمت فعلياً لدعم الإجابة."
      : "Put only the supplied chunk IDs actually used to support the answer in citedChunkIds."
    : useAr
      ? "لا تضع داخل قيمة answer أي استشهادات ظاهرة أو مراجع مصادر أو حواشي أو عناوين مستندات أو أرقام صفحات. تبقى citedChunkIds مطلوبة للتتبع الداخلي ويجب أن تحتوي فقط على معرفات المقاطع المقدمة المستخدمة فعلياً."
      : "Do not put visible citations, source references, footnotes, document titles, or page numbers in the answer value. citedChunkIds remains required for internal provenance and must contain only supplied chunk IDs actually used.";

  return [
    groundingInstruction,
    ANSWER_WRITER_JSON_CONTRACT,
    taskInstruction,
    languageInstruction,
    citationInstruction,
  ].join(" ");
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
  sources: ChatSource[];
  userMessage: string;
  task?: AnswerTask;
  language?: QueryLanguageValue;
}): { role: "system" | "user" | "assistant"; content: string }[] {
  const { citationsEnabled, sources, userMessage, task = "direct_question", language = "en" } = options;

  const systemPrompt = systemPromptFor(task, citationsEnabled, language);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

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

    const thresholdComparisons = formatThresholdComparisons(
      userMessage,
      sources.map((source) => ({ chunkId: source.chunkId, text: source.text })),
    );
    if (thresholdComparisons) {
      messages.push({
        role: "system",
        content:
          "Bounded threshold comparisons derived only from the current question and cited context follow. " +
          "Use them only when the cited rule is relevant to the question. A satisfied:false result is present evidence for a negative answer; do not discard it or change it to insufficient evidence. " +
          "Answer only the current threshold question and do not add related eligibility conditions, durations, limits, or equivalences unless they are necessary and explicitly documented by a cited source. " +
          "Preserve the documented operator and unit, cite the smallest sufficient set of source chunks supporting released claims, and do not introduce any value absent from the question or evidence. " +
          thresholdComparisons,
      });
    }
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
