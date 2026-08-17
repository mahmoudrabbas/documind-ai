import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import DepartmentModel, { DepartmentDocument } from "../../db/models/department.model.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import { normalizeTaxonomyName } from "../document-taxonomy/documentTaxonomy.normalization.js";
import type { PermissionGrant } from "../permissions/permissions.types.js";

export interface RoleScopeOption {
  id: string;
  name: string;
  normalizedName: string;
  status: "active" | "archived";
}

export interface RoleScopeOptions {
  departments: RoleScopeOption[];
  categories: RoleScopeOption[];
  classifications: RoleScopeOption[];
  archived: {
    departments: RoleScopeOption[];
    categories: RoleScopeOption[];
    classifications: RoleScopeOption[];
  };
}

export interface RoleScopeOptionsInput {
  departments: string[];
  categories: string[];
  classifications: string[];
}

export interface ExistingScopeValues {
  departmentIds: Set<string>;
  documentCategories: Set<string>;
  documentClassifications: Set<string>;
}

interface ScopeOptionSource {
  _id: { toString(): string };
  name: string;
  normalizedName: string;
  status: "active" | "archived";
}

const MAX_RESOLVE_VALUES = 200;

function toScopeOption(record: ScopeOptionSource): RoleScopeOption {
  return {
    id: record._id.toString(),
    name: record.name,
    normalizedName: record.normalizedName,
    status: record.status,
  };
}

/**
 * Loads the taxonomy options the role editor needs in a single request:
 * every active department/category/classification, plus the archived records
 * referenced by already-saved scope values so existing roles render correctly.
 */
export async function fetchRoleScopeOptions(
  tenantId: string,
  input: RoleScopeOptionsInput,
): Promise<RoleScopeOptions> {
  const departments = input.departments.slice(0, MAX_RESOLVE_VALUES);
  const categories = input.categories
    .slice(0, MAX_RESOLVE_VALUES)
    .map(normalizeTaxonomyName);
  const classifications = input.classifications
    .slice(0, MAX_RESOLVE_VALUES)
    .map(normalizeTaxonomyName);

  const [activeDepartments, activeCategories, activeClassifications] = await Promise.all([
    DepartmentModel.find({ tenantId, status: "active" }).sort({ name: 1 }).lean().exec(),
    DocumentCategoryModel.find({ tenantId, status: "active" }).sort({ name: 1 }).lean().exec(),
    DocumentClassificationModel.find({ tenantId, status: "active" }).sort({ name: 1 }).lean().exec(),
  ]);

  const [archivedDepartments, archivedCategories, archivedClassifications] = await Promise.all([
    departments.length > 0
      ? DepartmentModel.find({ tenantId, _id: { $in: departments }, status: "archived" }).lean().exec()
      : Promise.resolve([]),
    categories.length > 0
      ? DocumentCategoryModel.find({ tenantId, normalizedName: { $in: categories }, status: "archived" }).lean().exec()
      : Promise.resolve([]),
    classifications.length > 0
      ? DocumentClassificationModel.find({ tenantId, normalizedName: { $in: classifications }, status: "archived" }).lean().exec()
      : Promise.resolve([]),
  ]);

  return {
    departments: (activeDepartments as unknown as ScopeOptionSource[]).map(toScopeOption),
    categories: (activeCategories as unknown as ScopeOptionSource[]).map(toScopeOption),
    classifications: (activeClassifications as unknown as ScopeOptionSource[]).map(toScopeOption),
    archived: {
      departments: dedupeById(archivedDepartments as unknown as ScopeOptionSource[]).map(toScopeOption),
      categories: dedupeByName(archivedCategories as unknown as ScopeOptionSource[]).map(toScopeOption),
      classifications: dedupeByName(archivedClassifications as unknown as ScopeOptionSource[]).map(toScopeOption),
    },
  };
}

/**
 * Collects every taxonomy-backed scope value already present on a role so that
 * updates can preserve archived values without allowing new archived ones.
 */
export function collectExistingScopeValues(
  grants: readonly PermissionGrant[],
): ExistingScopeValues {
  const values: ExistingScopeValues = {
    departmentIds: new Set(),
    documentCategories: new Set(),
    documentClassifications: new Set(),
  };
  for (const grant of grants) {
    if (!grant.scopes) continue;
    for (const id of grant.scopes.departmentIds) values.departmentIds.add(id);
    for (const name of grant.scopes.documentCategories) {
      values.documentCategories.add(normalizeTaxonomyName(name));
    }
    for (const name of grant.scopes.documentClassifications) {
      values.documentClassifications.add(normalizeTaxonomyName(name));
    }
  }
  return values;
}

/**
 * Rejects taxonomy-backed scope values that do not exist in the tenant or that
 * are archived and not already present on the role being edited. Pre-existing
 * archived values are preserved so historical assignments keep working.
 */
export async function assertTaxonomyScopeValues(
  context: { tenantId: string },
  grants: readonly PermissionGrant[],
  existing: ExistingScopeValues,
): Promise<void> {
  const departmentIds = new Set<string>();
  const categories = new Set<string>();
  const classifications = new Set<string>();

  for (const grant of grants) {
    if (!grant.scopes) continue;
    for (const id of grant.scopes.departmentIds) departmentIds.add(id);
    for (const name of grant.scopes.documentCategories) {
      categories.add(normalizeTaxonomyName(name));
    }
    for (const name of grant.scopes.documentClassifications) {
      classifications.add(normalizeTaxonomyName(name));
    }
  }
  if (departmentIds.size === 0 && categories.size === 0 && classifications.size === 0) {
    return;
  }

  const [departments, categoryRecords, classificationRecords] = await Promise.all([
    departmentIds.size > 0
      ? DepartmentModel.find({ tenantId: context.tenantId, _id: { $in: [...departmentIds] } }).select("_id status").lean().exec()
      : Promise.resolve([]),
    categories.size > 0
      ? DocumentCategoryModel.find({ tenantId: context.tenantId, normalizedName: { $in: [...categories] } }).select("normalizedName status").lean().exec()
      : Promise.resolve([]),
    classifications.size > 0
      ? DocumentClassificationModel.find({ tenantId: context.tenantId, normalizedName: { $in: [...classifications] } }).select("normalizedName status").lean().exec()
      : Promise.resolve([]),
  ]);

  const departmentByKey = new Map(
    (departments as unknown as Array<{ _id: { toString(): string }; status: "active" | "archived" }>)
      .map((department) => [department._id.toString(), department]),
  );
  for (const id of departmentIds) {
    const department = departmentByKey.get(id);
    if (!department) {
      throw scopeError(`Department ${id} does not exist in this tenant`);
    }
    if (department.status !== "active" && !existing.departmentIds.has(id)) {
      throw scopeError(`Department ${id} is archived and cannot be newly assigned`);
    }
  }

  const categoryByKey = new Map(
    (categoryRecords as unknown as Array<{ normalizedName: string; status: "active" | "archived" }>)
      .map((record) => [record.normalizedName, record]),
  );
  for (const name of categories) {
    const record = categoryByKey.get(name);
    if (!record) {
      throw scopeError(`Document category "${name}" does not exist in this tenant`);
    }
    if (record.status !== "active" && !existing.documentCategories.has(name)) {
      throw scopeError(`Document category "${name}" is archived and cannot be newly assigned`);
    }
  }

  const classificationByKey = new Map(
    (classificationRecords as unknown as Array<{ normalizedName: string; status: "active" | "archived" }>)
      .map((record) => [record.normalizedName, record]),
  );
  for (const name of classifications) {
    const record = classificationByKey.get(name);
    if (!record) {
      throw scopeError(`Document classification "${name}" does not exist in this tenant`);
    }
    if (record.status !== "active" && !existing.documentClassifications.has(name)) {
      throw scopeError(`Document classification "${name}" is archived and cannot be newly assigned`);
    }
  }
}

function scopeError(message: string): AppError {
  return new AppError(400, VALIDATION_ERROR, "Invalid role grant scope", [
    { field: "grants", message },
  ]);
}

function dedupeById(records: ScopeOptionSource[]): ScopeOptionSource[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = record._id.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeByName(records: ScopeOptionSource[]): ScopeOptionSource[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = record.normalizedName;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Resolves a list of department ObjectIds to their human-readable names
 * (the `DepartmentModel.name` field), so they can be compared against
 * the text values stored on document/chunk records.
 *
 * The lookup is a strict AND: `_id IN requestedIds AND tenantId == currentTenant
 * AND status == active`. There is no `$or` between _id and tenantId.
 *
 * **Fails closed:**
 * - If `tenantId` is missing or invalid, returns `[]` (no departments match).
 * - If any department id is not a valid ObjectId, returns `[]`.
 * - If any department id resolves to an archived department or belongs to a
 *   different tenant (or simply does not exist), returns `[]`.
 *
 * The caller must treat an empty array as "no departments are allowed",
 * never as "all departments are allowed".
 *
 * @param departmentIds   Canonical department ObjectIds from a permission grant.
 * @param tenantId        Tenant context used to confirm each department belongs to the tenant.
 * @returns               `undefined` when no ids were provided (no restriction),
 *                        a non-empty array of `DepartmentModel.name` strings on success,
 *                        or `[]` on any resolution failure (fail-closed).
 */
export async function resolveDepartmentNames(
  departmentIds: string[] | undefined,
  tenantId: string | undefined,
): Promise<string[] | undefined> {
  if (!departmentIds?.length) return undefined;

  const ids = departmentIds.map((id) => {
    try {
      return new Types.ObjectId(id);
    } catch {
      return null;
    }
  });
  if (ids.some((id) => !id)) return [];

  // Fail closed if tenantId is missing or invalid — a strict AND query
  // requiring _id IN [...] AND tenantId == currentTenant AND status == active.
  if (!tenantId) return [];

  let tenantObjectId: Types.ObjectId;
  try {
    tenantObjectId = new Types.ObjectId(tenantId);
  } catch {
    return [];
  }

  const query: { _id: { $in: Types.ObjectId[] }; status: "active"; tenantId: Types.ObjectId } = {
    _id: { $in: ids as Types.ObjectId[] },
    status: "active",
    tenantId: tenantObjectId,
  };

  const records: DepartmentDocument[] = await DepartmentModel.find(query).select("name").lean();

  if (records.length !== ids.length) return [];

  return records.map((rec) => rec.name).filter(Boolean);
}

export interface ResolvedCategoryScopeValues {
  /** Canonical DocumentCategory ObjectIds (strings) that the scope names resolved to. */
  ids: string[];
  /** Display names (`DocumentCategoryModel.name`) for matching persisted text metadata. */
  names: string[];
  /** Canonical normalized taxonomy names (`DocumentCategoryModel.normalizedName`). */
  normalizedNames: string[];
}

/**
 * Resolves document category scope names (canonical taxonomy names from a role
 * grant's `documentCategories`) to the tenant-scoped active DocumentCategory
 * records they refer to.
 *
 * Mirrors `resolveDepartmentNames` but returns the canonical ids as well as the
 * display and normalized names, so callers can authorize via canonical
 * taxonomy identity when it is available and via text metadata otherwise.
 *
 * **Fails closed:**
 * - If `tenantId` is missing or invalid, returns an empty result
 *   (`{ ids: [], names: [], normalizedNames: [] }`).
 * - If ANY scope name does not normalize, or does not resolve to an active
 *   DocumentCategory record in the SAME tenant (including archived or
 *   foreign-tenant categories), returns an empty result.
 *
 * The caller must treat an empty result as "no categories are allowed",
 * never as "all categories are allowed".
 *
 * @param documentCategories Canonical category names from a permission grant.
 * @param tenantId           Tenant context used to confirm each category belongs to the tenant.
 * @returns                  `undefined` when no names were provided (no restriction),
 *                           a resolved result on success,
 *                           or an empty result on any resolution failure (fail-closed).
 */
export async function resolveCategoryScopeValues(
  documentCategories: string[] | undefined,
  tenantId: string | undefined,
): Promise<ResolvedCategoryScopeValues | undefined> {
  if (!documentCategories?.length) return undefined;
  if (!tenantId) return { ids: [], names: [], normalizedNames: [] };

  let tenantObjectId: Types.ObjectId;
  try {
    tenantObjectId = new Types.ObjectId(tenantId);
  } catch {
    return { ids: [], names: [], normalizedNames: [] };
  }

  const normalizedNames = [
    ...new Set(documentCategories.map(normalizeTaxonomyName).filter(Boolean)),
  ];
  if (normalizedNames.length === 0) return { ids: [], names: [], normalizedNames: [] };

  const records = await DocumentCategoryModel.find({
    tenantId: tenantObjectId,
    normalizedName: { $in: normalizedNames },
    status: "active",
  })
    .select("name normalizedName")
    .lean();

  if (records.length !== normalizedNames.length) {
    return { ids: [], names: [], normalizedNames: [] };
  }

  return {
    ids: records.map((rec) => rec._id.toString()).sort(),
    names: records.map((rec) => rec.name).filter(Boolean).sort(),
    normalizedNames: records.map((rec) => rec.normalizedName).sort(),
  };
}

export interface ResolvedClassificationScopeValues {
  ids: string[];
  names: string[];
  normalizedNames: string[];
  levels: string[];
}

/** Resolve canonical classification scope names to same-tenant active records. */
export async function resolveClassificationScopeValues(
  documentClassifications: string[] | undefined,
  tenantId: string | undefined,
): Promise<ResolvedClassificationScopeValues | undefined> {
  if (!documentClassifications?.length) return undefined;
  const empty = { ids: [], names: [], normalizedNames: [], levels: [] };
  if (!tenantId) return empty;
  let tenantObjectId: Types.ObjectId;
  try {
    tenantObjectId = new Types.ObjectId(tenantId);
  } catch {
    return empty;
  }
  const normalizedNames = [
    ...new Set(documentClassifications.map(normalizeTaxonomyName).filter(Boolean)),
  ];
  if (normalizedNames.length === 0) return empty;
  const records = await DocumentClassificationModel.find({
    tenantId: tenantObjectId,
    normalizedName: { $in: normalizedNames },
    status: "active",
  }).select("name normalizedName level").lean();
  if (records.length !== normalizedNames.length) return empty;
  return {
    ids: records.map((record) => record._id.toString()).sort(),
    names: records.map((record) => record.name).sort(),
    normalizedNames: records.map((record) => record.normalizedName).sort(),
    levels: [...new Set(records.map((record) => record.level))].sort(),
  };
}
