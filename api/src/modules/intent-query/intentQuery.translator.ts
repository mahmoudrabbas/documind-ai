import type { ModelCompletionResponse, ModelCompletionMessage } from "../agents/agents.types.js";
import type { QueryLanguageValue } from "./intentQuery.types.js";

export type CompleteFn = (params: {
  messages: ModelCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
}) => Promise<ModelCompletionResponse>;

/**
 * Bilingual (Arabic-English) query translation used to make retrieval
 * cross-lingual: a question asked in English can be searched against Arabic
 * content and vice versa. Common words and descriptive terms are translated;
 * identifiers (file names with extensions, URLs, IDs, clause/article numbers,
 * dates, quoted phrases) are preserved verbatim.
 */
const TRANSLATION_SYSTEM_PROMPT = `You are a professional bilingual (Arabic-English) translator for enterprise document search.
Translate the user's question into BOTH Arabic and English so it can be searched against documents in either language.

Rules:
- Translate ordinary words and descriptive terms faithfully into the target language.
- Preserve verbatim (do NOT translate): file names (e.g. "policy.pdf", "Noor-Book.com محاط بالحمقى.pdf"), URLs, identifiers, clause/article numbers (e.g. "المادة 5", "Article 5"), dates, and quoted phrases.
- Do NOT preserve ordinary words just because they are capitalized; translate them normally.
- Keep the meaning and structure of the question intact.

Output ONLY a valid JSON object with this exact shape:
{
  "ar": "the question in Arabic",
  "en": "the question in English"
}
If the source is already in Arabic, "ar" equals the original. If the source is already in English, "en" equals the original.
Do not include markdown code fences or any preamble. Return only the raw JSON.`;

export interface TranslatedQuery {
  ar?: string;
  en?: string;
}

function stripCodeFence(content: string): string {
  return content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s,?.؛،/\\\-_()"'«»:]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

/**
 * Translates a question into the complementary language(s) via the model
 * adapter. Fail-open: any parsing/provider failure returns an empty result so
 * retrieval falls back to the original query only.
 */
export async function translateQuery(
  complete: CompleteFn,
  question: string,
  sourceLanguage: QueryLanguageValue,
): Promise<TranslatedQuery> {
  const trimmed = question.trim();
  if (!trimmed) return {};

  try {
    const response = await complete({
      messages: [
        { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
        { role: "user", content: trimmed },
      ],
      temperature: 0,
      maxTokens: 400,
    });

    const content = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(stripCodeFence(content)) as Partial<TranslatedQuery>;

    const result: TranslatedQuery = {};
    if (typeof parsed.en === "string" && parsed.en.trim()) {
      result.en = parsed.en.trim();
    }
    if (typeof parsed.ar === "string" && parsed.ar.trim()) {
      result.ar = parsed.ar.trim();
    }

    // The model must never drop the source-language form of the question.
    if (sourceLanguage === "ar" || sourceLanguage === "mixed") {
      result.ar = result.ar ?? trimmed;
    }
    if (sourceLanguage === "en" || sourceLanguage === "mixed") {
      result.en = result.en ?? trimmed;
    }

    return result;
  } catch (_error) {
    return {};
  }
}

/**
 * Builds the extra semantic and keyword queries that let retrieval search the
 * translated question in the complementary language. `sourceLanguage` decides
 * which counterpart(s) are added; the source question itself is always kept
 * as the primary query by the caller.
 */
export function buildTranslatedQueries(
  question: string,
  sourceLanguage: QueryLanguageValue,
  translated: TranslatedQuery,
): { semanticTexts: string[]; keywordTerms: string[][] } {
  const semanticTexts: string[] = [];
  const keywordTerms: string[][] = [];

  const push = (text: string): void => {
    const candidate = text.trim();
    if (!candidate) return;
    if (normalizeForCompare(candidate) === normalizeForCompare(question)) return;
    semanticTexts.push(candidate);
    const terms = tokenize(candidate).slice(0, 30);
    if (terms.length > 0) keywordTerms.push(terms);
  };

  if (sourceLanguage === "en" && translated.ar) {
    push(translated.ar);
  } else if (sourceLanguage === "ar" && translated.en) {
    push(translated.en);
  } else if (sourceLanguage === "mixed") {
    if (translated.ar) push(translated.ar);
    if (translated.en) push(translated.en);
  }

  return { semanticTexts, keywordTerms };
}

function normalizeForCompare(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
