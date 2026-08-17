import type { QueryLanguageValue } from "../intent-query/intentQuery.types.js";

/**
 * A single authorized conflicting position used by the deterministic
 * unresolved-conflict renderer. Text comes from server-loaded, reauthorized
 * chunks — never from model output.
 */
export interface ConflictAnswerSource {
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly sectionTitle?: string;
  readonly pageNumber?: number;
  readonly text: string;
}

/** Deterministic excerpt bound; the renderer never emits full chunk text. */
export const CONFLICT_EXCERPT_MAX_CHARS = 400;

function isArabic(language: QueryLanguageValue): boolean {
  return language === "ar" || language === "mixed";
}

function excerpt(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= CONFLICT_EXCERPT_MAX_CHARS) return normalized;
  const cut = normalized.slice(0, CONFLICT_EXCERPT_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > CONFLICT_EXCERPT_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function sourceLabel(source: ConflictAnswerSource, arabic: boolean): string {
  const parts: string[] = [source.documentTitle];
  if (source.sectionTitle) parts.push(source.sectionTitle);
  if (typeof source.pageNumber === "number" && source.pageNumber > 0) {
    parts.push(arabic ? `صفحة ${source.pageNumber}` : `page ${source.pageNumber}`);
  }
  return parts.join(" — ");
}

/**
 * Deterministic, code-enforced unresolved-conflict answer.
 *
 * This renderer is the release authority for conflict runs: it is built only
 * from validated, reauthorized conflict evidence, presents every position
 * separately with its citation, and by construction never selects, prefers,
 * or implies a winner. Prompt compliance is irrelevant to its safety — the
 * answer-writer's free text is never released on the conflict path.
 */
export function renderUnresolvedConflictAnswer(input: {
  language: QueryLanguageValue;
  sources: readonly ConflictAnswerSource[];
}): string {
  if (input.sources.length === 0) {
    throw new Error("Unresolved-conflict answer requires at least one source");
  }
  const arabic = isArabic(input.language);
  const header = arabic
    ? "تذكر مستندات الشركة المصرح بها مواقف مختلفة بشأن هذا السؤال، ولا يمكن تأكيد إجابة واحدة منها."
    : "The authorized company documents state different positions for this question, so a single answer cannot be confirmed.";
  const lines = input.sources.map(
    (source) =>
      `• ${sourceLabel(source, arabic)}: ${arabic ? "«" : "\u201C"}${excerpt(source.text)}${arabic ? "»" : "\u201D"}`,
  );
  // Single atomic sentences: claim-level verification must never split these
  // and silently drop the no-resolution clause. Number words are avoided so
  // deterministic numeric-consistency checks cannot flag the framing text.
  const footer = arabic
    ? "كلا الموقفين معروضان مع مصدره ولا تحدد المستندات المتاحة الموقف المنطبق."
    : "Both positions are shown with their sources and the documents do not resolve which position applies.";
  return [header, "", ...lines, "", footer].join("\n");
}
