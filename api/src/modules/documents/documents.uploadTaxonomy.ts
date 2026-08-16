import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  MALFORMED_OBJECT_ID,
  TAXONOMY_RECORD_ARCHIVED,
  TAXONOMY_RECORD_NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DepartmentModel from "../../db/models/department.model.js";
import type { DocumentClassification } from "../../db/models/document.model.js";

export interface UploadTaxonomySelection {
  categoryId?: string | null;
  departmentId?: string | null;
  classificationId?: string | null;
}

export interface ResolvedUploadTaxonomy {
  /** Taxonomy record display names, stored denormalized on the document. */
  category: string | null;
  department: string | null;
  /** Sensitivity level of the selected classification record, or null when the default applies. */
  classification: DocumentClassification | null;
  /** Canonical normalized taxonomy identity used by permission scopes. */
  classificationName: string | null;
  categoryId: mongoose.Types.ObjectId | null;
  departmentId: mongoose.Types.ObjectId | null;
  classificationId: mongoose.Types.ObjectId | null;
}

function assertObjectId(value: string | null | undefined): asserts value is string {
  if (value && !mongoose.isObjectIdOrHexString(value)) {
    throw new AppError(400, MALFORMED_OBJECT_ID, `Invalid taxonomy id "${value}"`);
  }
}

type ActiveTaxonomyRecord = { _id: unknown; status: string; name?: string; level?: string };

/**
 * Fetch a tenant-scoped taxonomy record and require it to be active.
 * Returns null when no id was supplied. Throws a scoped AppError when the
 * record does not exist (or belongs to another tenant) or is archived.
 */
async function resolveActiveRecord<T extends ActiveTaxonomyRecord>(
  label: string,
  id: string | null | undefined,
  find: (id: string) => Promise<T | null>,
): Promise<T | null> {
  if (!id) return null;
  assertObjectId(id);
  const record = await find(id);
  if (!record) {
    throw new AppError(400, TAXONOMY_RECORD_NOT_FOUND, `Selected ${label} no longer exists`);
  }
  if (record.status !== "active") {
    throw new AppError(400, TAXONOMY_RECORD_ARCHIVED, `Selected ${label} is archived and cannot be used`);
  }
  return record;
}

/**
 * Resolve and validate the optional taxonomy selection submitted with a
 * document upload. Each reference must be tenant-scoped and active, so a
 * caller cannot attach a record from another tenant or an archived one.
 *
 * All ids are optional: when a classification is not supplied the upload
 * falls back to the tenant's "Internal" classification at the repository
 * layer, matching the historical default.
 */
export async function resolveUploadTaxonomy(
  tenantId: string,
  selection: UploadTaxonomySelection,
): Promise<ResolvedUploadTaxonomy> {
  const [category, department, classification] = await Promise.all([
    resolveActiveRecord("category", selection.categoryId, (id) =>
      DocumentCategoryModel.findOne({ _id: id, tenantId }).select("name status").lean().exec()),
    resolveActiveRecord("department", selection.departmentId, (id) =>
      DepartmentModel.findOne({ _id: id, tenantId }).select("name status").lean().exec()),
    resolveActiveRecord("classification", selection.classificationId, (id) =>
      DocumentClassificationModel.findOne({ _id: id, tenantId }).select("name normalizedName level status").lean().exec()),
  ]);

  return {
    category: category?.name ?? null,
    department: department?.name ?? null,
    classification: (classification?.level ?? null) as DocumentClassification | null,
    classificationName: classification?.normalizedName ?? null,
    categoryId: category ? new mongoose.Types.ObjectId(String(category._id)) : null,
    departmentId: department ? new mongoose.Types.ObjectId(String(department._id)) : null,
    classificationId: classification ? new mongoose.Types.ObjectId(String(classification._id)) : null,
  };
}
