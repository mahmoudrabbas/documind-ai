import mongoose from "mongoose";

/** Document lifecycle statuses currently accepted by production chat retrieval. */
export const RETRIEVABLE_DOCUMENT_STATUSES = [
  "uploading",
  "uploaded",
  "processing",
  "processed",
  "reprocessing",
] as const;

/** Search-index statuses currently rejected by production chat retrieval. */
export const EXCLUDED_SEARCH_STATUSES = ["FAILED", "STALE"] as const;

/**
 * Canonical tenant-scoped parent-document filter for AI retrieval eligibility.
 * Document policy authorization remains a separate, additional requirement.
 */
export function buildRetrievableDocumentFilter(
  tenantId: string,
  documentIds: readonly string[],
): Record<string, unknown> {
  const validIds = [...new Set(documentIds)]
    .filter((id) => mongoose.isObjectIdOrHexString(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  return {
    _id: { $in: validIds },
    tenantId: new mongoose.Types.ObjectId(tenantId),
    deletedAt: null,
    isArchived: false,
    status: { $in: [...RETRIEVABLE_DOCUMENT_STATUSES] },
    searchStatus: { $nin: [...EXCLUDED_SEARCH_STATUSES] },
  };
}
