import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_ACCESS_AUTHORIZATION_FAILED } from "../../common/errors/errorCodes.js";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DocumentModel, { type DocumentDocument } from "../../db/models/document.model.js";
import DocumentVersionModel, { type DocumentVersionDocument } from "../../db/models/documentVersion.model.js";
import UserModel from "../../db/models/user.model.js";
import { createDefaultDocumentAccessPolicy } from "../document-access/documentAccess.defaultPolicy.js";
import { normalizeTaxonomyName } from "../document-taxonomy/documentTaxonomy.normalization.js";

export async function createDocumentWithPrivatePolicy(
  documentData: Omit<DocumentDocument, "_id" | "createdAt" | "updatedAt">,
  versionData: Omit<DocumentVersionDocument, "_id" | "documentId" | "createdAt">,
): Promise<DocumentDocument> {
  const tenantId = documentData.tenantId.toString();
  const ownerId = documentData.uploadedBy.toString();
  const classificationId = await ensureRestrictedClassification(tenantId, ownerId);
  const documentId = new mongoose.Types.ObjectId();
  const policyId = new mongoose.Types.ObjectId();
  const createdAt = new Date();
  const policy = createDefaultDocumentAccessPolicy({ tenantId, documentId: documentId.toString(), policyId: policyId.toString(),
    ownerId, classificationId: classificationId.toString(), createdAt: createdAt.toISOString(), reason: "upload-private-default" });
  const session = await mongoose.startSession();
  try {
    let created: DocumentDocument | null = null;
    await session.withTransaction(async () => {
      if (!await UserModel.exists({ _id: ownerId, tenantId, status: "active" }).session(session)) {
        throw new Error("UPLOAD_OWNER_INELIGIBLE");
      }
      [created] = await DocumentModel.create([{ ...documentData, _id: documentId, owner: documentData.uploadedBy,
        classification: "restricted", classificationId, activePolicyId: policyId, activePolicyVersion: 1, policyChangedAt: createdAt }], { session });
      const snapshot = new DocumentAccessPolicyModel({ ...policy, rules: policy.rules.map((rule) => ({ ...rule, subject: { ...rule.subject }, actions: [...rule.actions] })),
        effectiveFrom: createdAt, effectiveUntil: null, provenance: { ...policy.provenance, createdAt }, createdAt });
      await snapshot.save({ session });
      await DocumentVersionModel.create([{ ...versionData, documentId, tenantId: documentData.tenantId }], { session });
    });
    if (!created) throw new Error("UPLOAD_TRANSACTION_INCOMPLETE");
    return created;
  } catch {
    throw new AppError(500, DOCUMENT_ACCESS_AUTHORIZATION_FAILED, "Document upload could not be committed safely");
  } finally { await session.endSession(); }
}

async function ensureRestrictedClassification(tenantId: string, actorId: string): Promise<mongoose.Types.ObjectId> {
  const normalizedName = normalizeTaxonomyName("Restricted");
  const existing = await DocumentClassificationModel.findOne({ tenantId, normalizedName }).select("status level").exec();
  if (existing) {
    if (existing.status !== "active" || existing.level !== "restricted") throw new AppError(409, DOCUMENT_ACCESS_AUTHORIZATION_FAILED, "Restricted classification is unavailable");
    return existing._id;
  }
  try {
    const created = await DocumentClassificationModel.create({ tenantId, name: "Restricted", normalizedName, level: "restricted",
      description: null, status: "active", version: 1, createdBy: actorId, updatedBy: actorId });
    return created._id;
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    const raced = await DocumentClassificationModel.findOne({ tenantId, normalizedName, status: "active", level: "restricted" }).select("_id").exec();
    if (!raced) throw new AppError(409, DOCUMENT_ACCESS_AUTHORIZATION_FAILED, "Restricted classification is unavailable");
    return raced._id;
  }
}

function isDuplicate(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000); }
