import type { AdapterFilter } from "../../providers/embedding/adapterFilter.types.js";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import type { AccessContext, RetrievalFilter } from "./retrieval.types.js";

/**
 * Default classification visibility per base role.
 * SUPER_ADMIN sees everything (undefined = no restriction).
 * COMPANY_ADMIN sees all three levels.
 * EMPLOYEE sees only public and internal.
 */
const DEFAULT_ROLE_CLASSIFICATIONS: Record<BaseRole, string[] | undefined> = {
  SUPER_ADMIN: undefined,
  COMPANY_ADMIN: ["public", "internal", "confidential"],
  EMPLOYEE: ["public", "internal"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function intersectArrays<T>(a: readonly T[], b: readonly T[]): T[] {
  return a.filter((item) => b.includes(item));
}

function unionArrays<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])];
}

/**
 * Resolves the effective classification list from auth context.
 *
 * Priority:
 * 1. Explicit permission scopes (`documentClassifications`), if non-empty.
 * 2. Role-based defaults.
 */
function resolveClassifications(context: AccessContext): string[] | undefined {
  const documentClassifications =
    context.permissionScopes?.documentClassifications;

  if (documentClassifications !== undefined && documentClassifications.length > 0) {
    return documentClassifications;
  }

  return DEFAULT_ROLE_CLASSIFICATIONS[context.baseRole];
}

/**
 * Merges two optional `{ $in }` filter segments.
 * Returns the intersection when both are present, the present one when only one
 * exists, or `undefined` when neither is set.
 */
function mergeInField(
  mandatory?: { $in: string[] },
  query?: { $in: string[] },
): { $in: string[] } | undefined {
  if (mandatory !== undefined && query !== undefined) {
    return { $in: intersectArrays(mandatory.$in, query.$in) };
  }
  return mandatory ?? query;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derives **mandatory** datastore filters from the access context.
 *
 * These filters are ALWAYS applied and MUST NEVER be overridden by request
 * input. They enforce tenant isolation, classification visibility, department
 * and category scopes, and AI-use policy.
 */
export function compileAccessFilters(context: AccessContext): AdapterFilter {
  const classifications = resolveClassifications(context);

  const filter: AdapterFilter = {
    tenantId: context.tenantId,
    allowAiUse: true,
  };

  // Classification restriction — undefined means no restriction (SUPER_ADMIN).
  if (classifications !== undefined) {
    filter.classification = { $in: classifications };
  }

  // Department scope — only restrict when non-empty scopes are present.
  const departmentIds = context.permissionScopes?.departmentIds;
  if (departmentIds !== undefined && departmentIds.length > 0) {
    filter.department = { $in: departmentIds };
  }

  // Category scope — only restrict when non-empty scopes are present.
  const documentCategories = context.permissionScopes?.documentCategories;
  if (documentCategories !== undefined && documentCategories.length > 0) {
    filter.category = { $in: documentCategories };
  }

  // selfOnly is handled at the query layer (appended as ownerId) — not a
  // datastore adapter filter field. Flagged here for auditability.
  if (context.permissionScopes?.selfOnly) {
    // The caller may only access their own documents; the retrieval service
    // injects an ownerId equality check at the query level.
  }

  return filter;
}

/**
 * Converts an optional query-level `RetrievalFilter` into the adapter filter
 * shape. These represent the caller's explicit narrowing preferences and are
 * intersected with (or unioned against) the mandatory access filters.
 *
 * Returns an empty object when no query filter is provided.
 */
export function compileQueryFilters(
  queryFilter?: RetrievalFilter,
): Partial<AdapterFilter> {
  if (queryFilter === undefined) {
    return {};
  }

  const result: Partial<AdapterFilter> = {};

  if (queryFilter.documentIds !== undefined && queryFilter.documentIds.length > 0) {
    result.documentIds = queryFilter.documentIds;
  }

  if (queryFilter.classifications !== undefined && queryFilter.classifications.length > 0) {
    result.classification = { $in: queryFilter.classifications };
  }

  if (queryFilter.departments !== undefined && queryFilter.departments.length > 0) {
    result.department = { $in: queryFilter.departments };
  }

  if (queryFilter.categories !== undefined && queryFilter.categories.length > 0) {
    result.category = { $in: queryFilter.categories };
  }

  return result;
}

/**
 * Merges mandatory access filters with query-level filters.
 *
 * Rules:
 * - `tenantId`          — ALWAYS from mandatory (never overridden).
 * - `allowAiUse`        — mandatory wins.
 * - `documentVersionId` — mandatory wins when present.
 * - `classification`,
 *   `department`,
 *   `category`          — INTERSECT (narrow) when both sides are present.
 * - `documentIds`       — UNION (widen) when both sides are present.
 */
export function mergeFilters(
  mandatory: AdapterFilter,
  query: Partial<AdapterFilter>,
): AdapterFilter {
  const merged: AdapterFilter = {
    tenantId: mandatory.tenantId,
    allowAiUse: mandatory.allowAiUse ?? query.allowAiUse,
    documentVersionId: mandatory.documentVersionId ?? query.documentVersionId,
  };

  merged.classification = mergeInField(mandatory.classification, query.classification);
  merged.department = mergeInField(mandatory.department, query.department);
  merged.category = mergeInField(mandatory.category, query.category);

  // documentIds — union so the query can widen the set beyond mandatory scope.
  if (mandatory.documentIds !== undefined && query.documentIds !== undefined) {
    merged.documentIds = unionArrays(mandatory.documentIds, query.documentIds);
  } else if (mandatory.documentIds !== undefined) {
    merged.documentIds = mandatory.documentIds;
  } else if (query.documentIds !== undefined) {
    merged.documentIds = query.documentIds;
  }

  return merged;
}

export type FilterCompiler = {
  compileAccessFilters: typeof compileAccessFilters;
  compileQueryFilters: typeof compileQueryFilters;
  mergeFilters: typeof mergeFilters;
};
