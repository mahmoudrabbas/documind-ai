import mongoose from "mongoose";
import DocumentModel from "../../db/models/document.model.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  getDocumentAccessAuthorizationService,
  type DocumentAccessAuthorizationService,
} from "../document-access/documentAccess.authorization.service.js";
import { normalizeArabic } from "./intentQuery.languageDetector.js";

export interface DocumentHintResolution {
  referencedDocumentIds: string[];
  referencedDocumentTitles: string[];
  /** True when a title hint matched more than one authorized document. */
  ambiguousTitleMatches: boolean;
  /** Title hints that matched no authorized, retrievable document. */
  unresolvedTitleHints: string[];
}

export interface DocumentHintContext {
  tenantId: string;
  actorId: string;
  tenantObjectId: mongoose.Types.ObjectId;
}

export interface DocumentHintResolutionOptions {
  authorizationService?: DocumentAccessAuthorizationService;
}

/** Hard bound matching QueryPlanSchema.referencedDocumentTitles (max 20 × 500). */
const MAX_TITLE_HINTS = 20;
const MAX_TITLE_HINT_LENGTH = 500;

const RETRIEVABLE_DOCUMENT_STATUSES: Array<
  "uploading" | "uploaded" | "processing" | "processed" | "reprocessing"
> = [
  "uploading",
  "uploaded",
  "processing",
  "processed",
  "reprocessing",
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForComparison(text: string): string {
  const trimmed = String(text ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!trimmed) return "";
  const withArabicNormalization = normalizeArabic(trimmed);
  return withArabicNormalization.toLowerCase();
}

function validTitleHints(raw: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  const hints: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const hint = value.trim().replace(/\s+/g, " ");
    if (!hint) continue;
    if (hint.length > MAX_TITLE_HINT_LENGTH) continue;
    hints.push(hint);
    if (hints.length >= MAX_TITLE_HINTS) break;
  }
  return hints;
}

interface HintCandidateDoc {
  _id: mongoose.Types.ObjectId;
  fileName: string;
  metadata: { title: string | null } | null;
}

interface RankedHintCandidate {
  document: HintCandidateDoc;
  rank: number;
}

const FILE_EXTENSIONS = /\.(?:pdf|docx?|pptx?|xlsx?|txt)$/iu;
const LEADING_TITLE_WRAPPERS = /^(?:the|file|document|pdf|presentation|ملف|وثيقة|مستند|عرض)\s+/iu;
const TRAILING_TITLE_WRAPPERS = /\s+(?:file|document|pdf|presentation)$/iu;
const NATURAL_DOCUMENT_MARKER =
  /(?:\s+(?:file|document|pdf|presentation|ملف|وثيقة|مستند|عرض)|\.(?:pdf|docx?|pptx?|xlsx?|txt))$/iu;

/**
 * Extracts only explicit natural-language document references. This is not a
 * fuzzy title detector: a candidate must end in a known document wrapper or
 * file extension, and the authorized exact/wrapper resolver below remains the
 * authority.
 */
export function extractNaturalDocumentTitleHints(question: string): string[] {
  const normalized = String(question ?? "")
    .trim()
    .replace(/[?!.،؛]+$/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s+in\s+\d+\s+lines?$/iu, "")
    .trim();
  if (!normalized) return [];

  const candidates: string[] = [];
  const summary = normalized.match(
    /^(?:please\s+)?(?:can you|could you|would you|will you)?\s*(?:summarize|give\s+(?:me\s+)?(?:a\s+)?summary\s+of|لخ[ّ]?ص|تلخيص)\s+(?:the\s+)?(.+)$/iu,
  );
  if (summary?.[1]) candidates.push(summary[1]);

  const relationPattern =
    /(?:^|\s)(?:in|from|about|of|في|من)\s+(?:the\s+)?(.{1,160}?(?:\s+(?:file|document|pdf|presentation|ملف|وثيقة|مستند|عرض)|\.(?:pdf|docx?|pptx?|xlsx?|txt)))(?=$|[,،;؛])/giu;
  for (const match of normalized.matchAll(relationPattern)) {
    if (match[1]) candidates.push(match[1]);
  }

  return validTitleHints(
    candidates
      .map((candidate) => candidate.trim())
      .filter(
        (candidate) =>
          NATURAL_DOCUMENT_MARKER.test(candidate) &&
          candidate.split(/\s+/u).length <= 20,
      ),
  ).slice(0, 1);
}

function withoutFileExtension(value: string): string {
  return value.replace(FILE_EXTENSIONS, "").trim();
}

function withoutNaturalLanguageWrappers(value: string): string {
  let result = value.replace(LEADING_TITLE_WRAPPERS, "").trim();
  let previous = "";
  while (result !== previous) {
    previous = result;
    result = result.replace(TRAILING_TITLE_WRAPPERS, "").trim();
  }
  return result;
}

function compactTitle(value: string): string {
  return value.replace(/[\p{P}\p{S}\p{Z}_]+/gu, "");
}

function hintAliases(hint: string): string[] {
  const normalized = normalizeForComparison(hint);
  const extensionless = withoutFileExtension(normalized);
  const unwrapped = withoutNaturalLanguageWrappers(normalized);
  const unwrappedExtensionless = withoutFileExtension(unwrapped);
  return [...new Set([
    normalized,
    extensionless,
    unwrapped,
    unwrappedExtensionless,
  ].filter(Boolean))];
}

/**
 * Exact normalized title/filename matches are strongest. Lower ranks only
 * remove a known file extension or harmless document wrapper; the final
 * compact comparison handles spacing/separator differences but still requires
 * complete equality, never substring or edit-distance fuzzy matching.
 */
function candidateMatchRank(hint: string, document: HintCandidateDoc): number | null {
  const target = normalizeForComparison(hint);
  const targetExtensionless = withoutFileExtension(target);
  const targetUnwrapped = withoutNaturalLanguageWrappers(target);
  const targetCanonical = withoutFileExtension(targetUnwrapped);
  const documentValues = [
    normalizeForComparison(document.metadata?.title ?? ""),
    normalizeForComparison(document.fileName),
  ].filter(Boolean);

  if (documentValues.includes(target)) return 0;
  if (documentValues.some((value) => withoutFileExtension(value) === targetExtensionless)) return 1;
  if (documentValues.some((value) => {
    const canonical = withoutFileExtension(withoutNaturalLanguageWrappers(value));
    return canonical === targetCanonical;
  })) return 2;

  const compactTarget = compactTitle(targetCanonical);
  if (
    compactTarget.length >= 4 &&
    documentValues.some((value) =>
      compactTitle(withoutFileExtension(withoutNaturalLanguageWrappers(value))) === compactTarget,
    )
  ) return 3;
  return null;
}

/**
 * Builds a case-insensitive search pattern that tolerates Arabic variant
 * forms (أ/إ/آ/ا, ة/ه, ى/ي) and strips harakat/kashida, so a hint matches a
 * stored title regardless of which variant either side uses. Exact equality is
 * still enforced in JS via normalized comparison.
 */
function buildSearchPattern(hint: string): string {
  const normalized = normalizeArabic(hint);
  const stripped = normalized.replace(/\s+/g, " ").trim();
  const escaped = escapeRegExp(stripped);
  return escaped
    .replace(/ا/g, "(?:أ|إ|آ|ا)")
    .replace(/[هة]/g, "(?:ة|ه)")
    .replace(/[ىي]/g, "(?:ى|ي)");
}

async function findDocumentsByHint(
  context: DocumentHintContext,
  hint: string,
): Promise<RankedHintCandidate[]> {
  const patterns = hintAliases(hint).map(buildSearchPattern).filter(Boolean);
  if (patterns.length === 0) return [];

  const docs = await DocumentModel.find({
    tenantId: context.tenantObjectId,
    deletedAt: null,
    isArchived: false,
    status: { $in: RETRIEVABLE_DOCUMENT_STATUSES },
    $or: patterns.flatMap((pattern) => [
      { "metadata.title": { $regex: pattern, $options: "i" } },
      { fileName: { $regex: pattern, $options: "i" } },
    ]),
  })
    .select("_id fileName metadata.title")
    .lean()
    .exec();

  return docs.flatMap((document) => {
    const rank = candidateMatchRank(hint, document);
    return rank === null ? [] : [{ document, rank }];
  });
}

/**
 * Resolves document hints deterministically and safely.
 *
 * Steps:
 * 1. Drop malformed IDs and bound/normalize title hints.
 * 2. Tenant-scope: only documents owned by the tenant are considered.
 * 3. Filter archived / deleted / non-retrievable documents per existing rules.
 * 4. Actor/`use_in_ai` authorization: inaccessible documents are silently
 *    dropped — model-generated IDs and titles are never trusted.
 * 5. Resolve display titles (metadata.title ?? fileName) in hint order.
 * 6. Title hints resolve by exact normalized `metadata.title` or `fileName`.
 *    One match constrains retrieval; multiple authorized matches are flagged
 *    as ambiguous; zero matches are reported as unresolved — never fabricated.
 */
export async function resolveAuthorizedDocumentHints(
  rawIds: readonly string[],
  context: DocumentHintContext,
  rawTitles: readonly string[] | undefined = [],
  options: DocumentHintResolutionOptions = {},
): Promise<DocumentHintResolution> {
  const empty: DocumentHintResolution = {
    referencedDocumentIds: [],
    referencedDocumentTitles: [],
    ambiguousTitleMatches: false,
    unresolvedTitleHints: [],
  };

  const validIds = rawIds.filter(
    (id): id is string =>
      typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
  );
  const uniqueIds = [...new Set(validIds)];
  const titleHints = validTitleHints(rawTitles);
  if (uniqueIds.length === 0 && titleHints.length === 0) return empty;

  const authorizationService =
    options.authorizationService ?? getDocumentAccessAuthorizationService();

  const authorize = async (documentId: string): Promise<boolean> => {
    try {
      await authorizationService.authorizeDocumentAction(
        { tenantId: context.tenantId, actorId: context.actorId },
        documentId,
        "use_in_ai",
      );
      return true;
    } catch (error) {
      // Authorization denials are logged as DOCUMENT_ACCESS_DENIED audit
      // events by the service — swallow them and drop the hint.
      if (error instanceof AppError) return false;
      throw error;
    }
  };

  const resolvedIds: string[] = [];
  const resolvedTitles: string[] = [];
  const resolvedIdSet = new Set<string>();

  // ── ID hints ──────────────────────────────────────────────────────────
  if (uniqueIds.length > 0) {
    const tenantOwned = await DocumentModel.find({
      _id: { $in: uniqueIds },
      tenantId: context.tenantObjectId,
      deletedAt: null,
      isArchived: false,
      status: { $in: RETRIEVABLE_DOCUMENT_STATUSES },
    })
      .select("_id fileName metadata.title")
      .lean()
      .exec();
    const byId = new Map(
      tenantOwned.map((d) => [d._id.toString(), d]),
    );

    for (const documentId of uniqueIds) {
      const doc = byId.get(documentId);
      if (!doc) continue;
      if (!(await authorize(documentId))) continue;
      if (resolvedIdSet.has(documentId)) continue;
      resolvedIdSet.add(documentId);
      resolvedIds.push(documentId);
      const title = doc.metadata?.title?.trim();
      resolvedTitles.push(
        title && title.length > 0 ? title : (doc.fileName ?? ""),
      );
    }
  }

  // ── Title hints ───────────────────────────────────────────────────────
  let ambiguousTitleMatches = false;
  const unresolvedTitleHints: string[] = [];
  const seenTitleHints = new Set<string>();

  for (const hint of titleHints) {
    const target = normalizeForComparison(hint);
    if (!target || seenTitleHints.has(target)) continue;
    seenTitleHints.add(target);

    const candidates = await findDocumentsByHint(context, hint);
    const candidatesNotAlreadyResolved = candidates.filter(
      (candidate) => !resolvedIdSet.has(candidate.document._id.toString()),
    );
    if (candidatesNotAlreadyResolved.length === 0) {
      // No candidates at all means the hint matches no retrievable document;
      // every candidate already resolved means it is a dedup of an earlier hint.
      if (candidates.length === 0) unresolvedTitleHints.push(hint);
      continue;
    }

    const authorizedMatches: RankedHintCandidate[] = [];
    for (const candidate of candidatesNotAlreadyResolved) {
      const candidateId = candidate.document._id.toString();
      if (!(await authorize(candidateId))) continue;
      authorizedMatches.push(candidate);
    }

    if (authorizedMatches.length === 0) {
      unresolvedTitleHints.push(hint);
      continue;
    }
    const bestRank = Math.min(...authorizedMatches.map((candidate) => candidate.rank));
    const bestAuthorizedMatches = authorizedMatches.filter(
      (candidate) => candidate.rank === bestRank,
    );
    if (bestAuthorizedMatches.length > 1) {
      ambiguousTitleMatches = true;
      continue;
    }

    const match = bestAuthorizedMatches[0]!.document;
    const matchId = match._id.toString();
    resolvedIdSet.add(matchId);
    resolvedIds.push(matchId);
    const title = match.metadata?.title?.trim();
    resolvedTitles.push(
      title && title.length > 0 ? title : (match.fileName ?? ""),
    );
  }

  return {
    referencedDocumentIds: resolvedIds,
    referencedDocumentTitles: resolvedTitles,
    ambiguousTitleMatches,
    unresolvedTitleHints,
  };
}
