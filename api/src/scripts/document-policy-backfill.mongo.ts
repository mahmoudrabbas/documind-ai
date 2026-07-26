import mongoose, { type Model } from "mongoose";
import { AppError } from "../common/errors/AppError.js";
import { DOCUMENT_POLICY_MIGRATION_TRANSACTION_REQUIRED } from "../common/errors/errorCodes.js";
import DocumentAccessPolicyModel from "../db/models/documentAccessPolicy.model.js";
import DocumentCategoryModel from "../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../db/models/documentClassification.model.js";
import DepartmentModel from "../db/models/department.model.js";
import DocumentModel from "../db/models/document.model.js";
import UserModel from "../db/models/user.model.js";
import { createDefaultDocumentAccessPolicy } from "../modules/document-access/documentAccess.defaultPolicy.js";
import type { ClassificationLevel, TaxonomyKind } from "../modules/document-taxonomy/documentTaxonomy.types.js";
import type { BackfillPersistence } from "./document-policy-backfill.service.js";
import type { BackfillPlan, BackfillResult, SourceDocument, TaxonomyDecision, TaxonomyIdentity } from "./document-policy-backfill.contracts.js";

interface TaxonomyDoc extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  normalizedName: string;
  status: "active" | "archived";
  level?: ClassificationLevel;
}

class SourceChanged extends Error {}
class PolicyConflict extends Error {}

export class MongoDocumentPolicyBackfillPersistence implements BackfillPersistence {
  async scan(tenantId: string, afterId: string | undefined, limit: number): Promise<SourceDocument[]> {
    const records = await DocumentModel.find({ tenantId, ...(afterId ? { _id: { $gt: afterId } } : {}) })
      .select("tenantId updatedAt owner uploadedBy category department classification categoryId departmentId classificationId activePolicyId activePolicyVersion")
      .sort({ _id: 1 }).limit(limit).lean().exec();
    return records.map((record) => ({
      id: record._id.toString(), tenantId: record.tenantId.toString(), updatedAt: record.updatedAt,
      ownerId: record.owner?.toString() ?? null, uploadedBy: record.uploadedBy.toString(),
      category: record.category ?? null, department: record.department ?? null, classification: record.classification,
      categoryId: record.categoryId?.toString() ?? null, departmentId: record.departmentId?.toString() ?? null,
      classificationId: record.classificationId?.toString() ?? null,
      activePolicyId: record.activePolicyId?.toString() ?? null, activePolicyVersion: record.activePolicyVersion ?? null,
    }));
  }

  async userEligible(tenantId: string, userId: string): Promise<boolean> {
    return Boolean(await UserModel.exists({ _id: userId, tenantId, status: "active" }));
  }

  async taxonomyByName(tenantId: string, kind: TaxonomyKind, normalizedName: string): Promise<TaxonomyIdentity | null> {
    const record = await taxonomyModel(kind).findOne({ tenantId, normalizedName })
      .select("normalizedName status level").lean().exec();
    return record ? { id: record._id.toString(), kind, normalizedName: record.normalizedName, status: record.status, ...(record.level ? { level: record.level } : {}) } : null;
  }

  async apply(plan: BackfillPlan): Promise<BackfillResult> {
    const current = await DocumentModel.findOne({ _id: plan.document.id, tenantId: plan.document.tenantId })
      .select("activePolicyId activePolicyVersion").lean().exec();
    if (current?.activePolicyId && current.activePolicyVersion) {
      return result(plan, "already_migrated", "ALREADY_MIGRATED");
    }
    if (await DocumentAccessPolicyModel.exists({ tenantId: plan.document.tenantId, documentId: plan.document.id })) {
      return result(plan, "quarantined", "POLICY_CONFLICT");
    }
    const taxonomyIds = new Map<TaxonomyKind, string>();
    for (const decision of plan.taxonomy) {
      const resolved = await this.ensureTaxonomy(plan.document.tenantId, plan.ownerId as string, decision);
      if (!resolved) return result(plan, "quarantined", "TAXONOMY_ARCHIVED_CONFLICT");
      taxonomyIds.set(decision.kind, resolved);
    }
    const classificationId = taxonomyIds.get("classification");
    if (!classificationId) return result(plan, "failed", "TRANSACTION_FAILED");
    const policyId = new mongoose.Types.ObjectId().toHexString();
    const createdAt = new Date();
    const policy = createDefaultDocumentAccessPolicy({
      tenantId: plan.document.tenantId, documentId: plan.document.id, policyId,
      ownerId: plan.ownerId as string, classificationId,
      categoryId: taxonomyIds.get("category") ?? null, departmentId: taxonomyIds.get("department") ?? null,
      createdAt: createdAt.toISOString(), reason: "document-access-policy-backfill-v1",
    });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (!await UserModel.exists({ _id: plan.ownerId, tenantId: plan.document.tenantId, status: "active" }).session(session)) throw new SourceChanged();
        if (await DocumentAccessPolicyModel.exists({ tenantId: plan.document.tenantId, documentId: plan.document.id }).session(session)) throw new PolicyConflict();
        const changed = await DocumentModel.updateOne(sourceFilter(plan.document), { $set: {
          owner: plan.ownerId, categoryId: taxonomyIds.get("category") ?? null,
          departmentId: taxonomyIds.get("department") ?? null, classificationId,
          activePolicyId: policyId, activePolicyVersion: 1, policyChangedAt: createdAt,
        } }, { session, runValidators: true });
        if (changed.modifiedCount !== 1) throw new SourceChanged();
        const snapshot = new DocumentAccessPolicyModel({
          ...policy, effectiveFrom: createdAt, effectiveUntil: null,
          rules: policy.rules.map((rule) => ({ ...rule, subject: { ...rule.subject }, actions: [...rule.actions] })),
          provenance: { ...policy.provenance, createdAt }, createdAt,
        });
        await snapshot.save({ session });
      });
      return { ...result(plan, "migrated", plan.reason),
        categoryId: taxonomyIds.get("category") ?? null, departmentId: taxonomyIds.get("department") ?? null,
        classificationId, policyId, policyVersion: 1 };
    } catch (error) {
      if (error instanceof SourceChanged) {
        const current = await DocumentModel.findOne({ _id: plan.document.id, tenantId: plan.document.tenantId }).select("activePolicyId activePolicyVersion").lean().exec();
        return current?.activePolicyId && current.activePolicyVersion ? result(plan, "already_migrated", "ALREADY_MIGRATED") : result(plan, "source_changed", "SOURCE_CHANGED");
      }
      if (error instanceof PolicyConflict) return result(plan, "quarantined", "POLICY_CONFLICT");
      if (isDuplicateKey(error)) return result(plan, "already_migrated", "POLICY_CONFLICT");
      if (isTransactionUnsupported(error)) throw new AppError(500, DOCUMENT_POLICY_MIGRATION_TRANSACTION_REQUIRED, "A transaction-capable MongoDB replica set is required");
      return result(plan, "failed", "TRANSACTION_FAILED");
    } finally { await session.endSession(); }
  }

  private async ensureTaxonomy(tenantId: string, actorId: string, decision: TaxonomyDecision): Promise<string | null> {
    const model = taxonomyModel(decision.kind);
    const existing = await model.findOne({ tenantId, normalizedName: decision.normalizedName }).select("status level").lean().exec();
    if (existing) return existing.status === "active" && (!decision.level || existing.level === decision.level) ? existing._id.toString() : null;
    try {
      const created = new model({ tenantId, name: decision.displayName, normalizedName: decision.normalizedName,
        description: null, status: "active", version: 1, createdBy: actorId, updatedBy: actorId,
        ...(decision.level ? { level: decision.level } : {}) });
      await created.save();
      return created._id.toString();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const raced = await model.findOne({ tenantId, normalizedName: decision.normalizedName }).select("status level").lean().exec();
      return raced?.status === "active" && (!decision.level || raced.level === decision.level) ? raced._id.toString() : null;
    }
  }
}

function taxonomyModel(kind: TaxonomyKind): Model<TaxonomyDoc> {
  if (kind === "category") return DocumentCategoryModel as unknown as Model<TaxonomyDoc>;
  if (kind === "department") return DepartmentModel as unknown as Model<TaxonomyDoc>;
  return DocumentClassificationModel as unknown as Model<TaxonomyDoc>;
}

function sourceFilter(document: SourceDocument): Record<string, unknown> {
  const values: Record<string, unknown> = {
    updatedAt: document.updatedAt, owner: document.ownerId, uploadedBy: document.uploadedBy,
    category: document.category, department: document.department, classification: document.classification,
    categoryId: document.categoryId, departmentId: document.departmentId, classificationId: document.classificationId,
    activePolicyId: null, activePolicyVersion: null,
  };
  return { _id: document.id, tenantId: document.tenantId, $and: Object.entries(values).map(([field, value]) => value === null
    ? { $or: [{ [field]: null }, { [field]: { $exists: false } }] } : { [field]: value }) };
}

function result(plan: BackfillPlan, status: BackfillResult["status"], reasonCode: BackfillResult["reasonCode"]): BackfillResult {
  return { tenantId: plan.document.tenantId, documentId: plan.document.id, status, reasonCode, checkpoint: plan.document.id };
}
function isDuplicateKey(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000); }
function isTransactionUnsupported(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? (error as { code?: number }).code : undefined;
  return code === 20 || code === 251;
}
