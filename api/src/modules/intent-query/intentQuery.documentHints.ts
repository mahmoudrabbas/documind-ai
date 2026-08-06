import mongoose from "mongoose";
import DocumentModel from "../../db/models/document.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { getDocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
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
): Promise<HintCandidateDoc[]> {
  const pattern = buildSearchPattern(hint);
  if (!pattern) return [];

  const docs = await DocumentModel.find({
    tenantId: context.tenantObjectId,
    deletedAt: null,
    isArchived: false,
    status: { $in: RETRIEVABLE_DOCUMENT_STATUSES },
    $or: [
      { "metadata.title": { $regex: pattern, $options: "i" } },
      { fileName: { $regex: pattern, $options: "i" } },
    ],
  })
    .select("_id fileName metadata.title")
    .lean()
    .exec();

  return docs.filter((doc) => {
    const normalizedFileName = normalizeForComparison(doc.fileName);
    const normalizedTitle = normalizeForComparison(doc.metadata?.title ?? "");
    const target = normalizeForComparison(hint);
    return normalizedFileName === target || normalizedTitle === target;
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

  const authorizationService = getDocumentAccessAuthorizationService();

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
      (candidate) => !resolvedIdSet.has(candidate._id.toString()),
    );
    if (candidatesNotAlreadyResolved.length === 0) {
      // No candidates at all means the hint matches no retrievable document;
      // every candidate already resolved means it is a dedup of an earlier hint.
      if (candidates.length === 0) unresolvedTitleHints.push(hint);
      continue;
    }

    const authorizedMatches: HintCandidateDoc[] = [];
    for (const candidate of candidatesNotAlreadyResolved) {
      const candidateId = candidate._id.toString();
      if (!(await authorize(candidateId))) continue;
      authorizedMatches.push(candidate);
    }

    if (authorizedMatches.length === 0) {
      unresolvedTitleHints.push(hint);
      continue;
    }
    if (authorizedMatches.length > 1) {
      ambiguousTitleMatches = true;
      continue;
    }

    const match = authorizedMatches[0]!;
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
