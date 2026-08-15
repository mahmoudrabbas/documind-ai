import mongoose from "mongoose";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import type { DocumentDocument } from "../../db/models/document.model.js";
import type { PermissionResourceContext } from "../permissions/permissions.types.js";

type ScopedDocument = Pick<
  DocumentDocument,
  "owner" | "departmentId" | "category" | "classification" | "classificationId"
>;

/**
 * Permission classification scopes are canonical normalized taxonomy names.
 * The document's `classification` field is only a sensitivity level and must
 * never be used as the identity of a referenced classification record.
 */
export async function resolveCanonicalDocumentClassification(
  tenantId: string,
  document: Pick<DocumentDocument, "classification" | "classificationId">,
): Promise<string | undefined> {
  const classificationId = document.classificationId?.toString();
  if (!classificationId) return document.classification?.trim().toLowerCase() || undefined;
  if (!mongoose.isObjectIdOrHexString(classificationId)) return undefined;

  const classification = await DocumentClassificationModel.findOne({
    _id: classificationId,
    tenantId,
    status: "active",
  }).select("normalizedName").lean().exec();
  return classification?.normalizedName;
}

export async function buildDocumentPermissionResource(
  tenantId: string,
  document: ScopedDocument,
): Promise<PermissionResourceContext> {
  const classificationName = await resolveCanonicalDocumentClassification(tenantId, document);
  return {
    tenantId,
    ...(document.owner ? { ownerId: document.owner.toString() } : {}),
    ...(document.departmentId ? { departmentId: document.departmentId.toString() } : {}),
    ...(document.category ? { documentCategory: document.category } : {}),
    ...(classificationName ? { documentClassification: classificationName } : {}),
  };
}

export async function resolveClassificationScopeIds(
  tenantId: string,
  normalizedNames: readonly string[],
): Promise<mongoose.Types.ObjectId[]> {
  if (normalizedNames.length === 0) return [];
  const records = await DocumentClassificationModel.find({
    tenantId,
    normalizedName: { $in: normalizedNames },
    status: "active",
  }).select("_id").lean().exec();
  return records.map((record) => record._id);
}
