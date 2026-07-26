import mongoose, { type PipelineStage } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_NOT_FOUND } from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import DepartmentModel from "../../db/models/department.model.js";
import DocumentModel from "../../db/models/document.model.js";
import UserModel from "../../db/models/user.model.js";
import { normalizeTaxonomyName } from "../document-taxonomy/documentTaxonomy.normalization.js";
import { getPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { Permission } from "../permissions/permissions.catalog.js";
import type { PermissionScopes } from "../permissions/permissions.types.js";
import { PermissionEvaluatorDocumentCapabilityAdapter } from "./documentAccess.capability.js";
import { InMemoryDocumentAccessPolicyEvaluator } from "./documentAccess.evaluator.inMemory.js";
import { MongoDocumentAccessPolicyRepository } from "./documentAccess.policy.repository.mongo.js";
import type { DocumentAccessAction } from "./documentAccess.actions.js";
import type { DocumentAccessActorContext, DocumentAccessResourceContext } from "./documentAccess.types.js";

export interface DocumentAuthorizationContext { tenantId: string; actorId: string }

export class DocumentAccessAuthorizationService {
  private readonly policies = new MongoDocumentAccessPolicyRepository();

  async authorizeDocumentAction(context: DocumentAuthorizationContext, documentId: string, action: DocumentAccessAction): Promise<void> {
    try {
      const [actor, document] = await Promise.all([this.loadActor(context).catch(() => null), this.loadDocument(context.tenantId, documentId)]);
      if (!actor) return this.deny(context, documentId, action, "MALFORMED_AUTHORIZATION_CONTEXT");
      if (!document) return this.deny(context, documentId, action, "DOCUMENT_MISSING");
      const resource = resourceContext(document);
      if (!resource.activePolicyId || !resource.activePolicyVersion) return this.deny(context, documentId, action, "POLICY_MISSING");
      const policy = await this.policies.findExact(context.tenantId, documentId, resource.activePolicyId, resource.activePolicyVersion);
      if (!policy) return this.deny(context, documentId, action, "STALE_POLICY_CONTEXT");
      if ((policy.indexMetadata.categoryId ?? null) !== (resource.categoryId ?? null) ||
          (policy.indexMetadata.departmentId ?? null) !== (resource.departmentId ?? null) ||
          (policy.indexMetadata.classificationId ?? null) !== (resource.classificationId ?? null)) return this.deny(context, documentId, action, "STALE_POLICY_CONTEXT");
      const inherited = policy.inherits
        ? await this.policies.findExact(context.tenantId, documentId, policy.inherits.policyId, policy.inherits.policyVersion)
        : null;
      if (policy.inherits && !inherited) return this.deny(context, documentId, action, "INVALID_INHERITED_POLICY");
      const evaluator = new InMemoryDocumentAccessPolicyEvaluator(
        new PermissionEvaluatorDocumentCapabilityAdapter(getPermissionEvaluator()),
      );
      const decision = await evaluator.evaluate({ actor, resource, action, policy, inheritedPolicy: inherited, evaluatedAt: new Date().toISOString() });
      if (!decision.allowed) return this.deny(context, documentId, action, decision.reasonCode);
    } catch (error) {
      if (error instanceof AppError) throw error;
      return this.deny(context, documentId, action, "MALFORMED_AUTHORIZATION_CONTEXT");
    }
  }

  async authorizeDocumentsAction(context: DocumentAuthorizationContext, documentIds: readonly string[], action: DocumentAccessAction): Promise<void> {
    for (const documentId of [...new Set(documentIds)]) await this.authorizeDocumentAction(context, documentId, action);
  }

  async buildDiscoverPipeline(context: DocumentAuthorizationContext): Promise<PipelineStage[]> {
    const actor = await this.loadActor(context);
    const resolved = await getPermissionEvaluator().resolve({ tenantId: actor.tenantId, actorId: actor.actorId, baseRole: actor.baseRole, customRoleId: actor.customRoleId });
    const grant = resolved.grants.get(Permission.DOCUMENTS_READ);
    if (!grant) return [{ $match: { _id: { $exists: false } } }];
    return buildDiscoverPolicyPipeline(actor, grant.scope);
  }

  private async loadActor(context: DocumentAuthorizationContext): Promise<DocumentAccessActorContext> {
    if (!mongoose.isObjectIdOrHexString(context.tenantId) || !mongoose.isObjectIdOrHexString(context.actorId)) return hidden();
    const user = await UserModel.findOne({ _id: context.actorId, tenantId: context.tenantId, status: "active" })
      .select("role customRoleId employeeProfile.department").lean().exec();
    if (!user) return hidden();
    const resolved = await getPermissionEvaluator().resolve({ tenantId: context.tenantId, actorId: context.actorId, baseRole: user.role, customRoleId: user.customRoleId?.toString() });
    if (resolved.customRoleState === "invalid" || resolved.customRoleState === "missing" || resolved.customRoleState === "archived") return hidden();
    const departmentIds: string[] = [];
    const legacyDepartment = user.employeeProfile?.department;
    if (legacyDepartment) {
      const department = await DepartmentModel.findOne({ tenantId: context.tenantId, normalizedName: normalizeTaxonomyName(legacyDepartment), status: "active" }).select("_id").lean().exec();
      if (department) departmentIds.push(department._id.toString());
    }
    return { tenantId: context.tenantId, actorId: context.actorId, baseRole: resolved.baseRole, customRoleId: resolved.customRoleId, departmentIds };
  }

  private async loadDocument(tenantId: string, documentId: string) {
    if (!mongoose.isObjectIdOrHexString(documentId)) return null;
    return DocumentModel.findOne({ _id: documentId, tenantId }).select("tenantId owner uploadedBy category department classification categoryId departmentId classificationId status isArchived deletedAt activePolicyId activePolicyVersion").lean().exec();
  }

  private async deny(context: DocumentAuthorizationContext, documentId: string, action: DocumentAccessAction, reasonCode: string): Promise<never> {
    await getAuditWriter().write({ action: "DOCUMENT_ACCESS_DENIED", resourceType: "Document", resourceId: documentId,
      tenantId: context.tenantId, actorId: context.actorId, outcome: "DENIED", metadata: { documentId, action, reasonCode } });
    return hidden();
  }
}

function resourceContext(document: NonNullable<Awaited<ReturnType<DocumentAccessAuthorizationService["loadDocument"]>>>): DocumentAccessResourceContext {
  return { tenantId: document.tenantId.toString(), documentId: document._id.toString(), ownerId: document.owner?.toString() ?? null,
    categoryId: document.categoryId?.toString() ?? null, departmentId: document.departmentId?.toString() ?? null,
    classificationId: document.classificationId?.toString() ?? null, classification: document.classification,
    legacyCategory: document.category ?? null, legacyDepartment: document.department ?? null,
    lifecycleStatus: document.deletedAt ? "deleted" : document.isArchived ? "archived" : document.status,
    activePolicyId: document.activePolicyId?.toString() ?? null, activePolicyVersion: document.activePolicyVersion ?? null };
}

export function buildDiscoverPolicyPipeline(actor: DocumentAccessActorContext, scopes: PermissionScopes | null): PipelineStage[] {
  const now = new Date();
  const subject = (rule: string): Record<string, unknown> => ({ $or: [
    { $and: [{ $eq: [`${rule}.subject.type`, "user"] }, { $eq: [`${rule}.subject.id`, actor.actorId] }] },
    { $and: [{ $eq: [`${rule}.subject.type`, "custom_role"] }, { $eq: [`${rule}.subject.id`, actor.customRoleId ?? null] }] },
    { $and: [{ $eq: [`${rule}.subject.type`, "department"] }, { $in: [`${rule}.subject.id`, actor.departmentIds ?? []] }] },
    { $and: [{ $eq: [`${rule}.subject.type`, "owner"] }, { $eq: ["$owner", new mongoose.Types.ObjectId(actor.actorId)] }] },
    { $eq: [`${rule}.subject.type`, "tenant_member"] },
  ] });
  const scopeMatch: Record<string, unknown>[] = [];
  if (scopes?.selfOnly) scopeMatch.push({ owner: new mongoose.Types.ObjectId(actor.actorId) });
  if (scopes?.departmentIds.length) scopeMatch.push({ departmentId: { $in: scopes.departmentIds.map((id) => new mongoose.Types.ObjectId(id)) } });
  if (scopes?.documentCategories.length) scopeMatch.push({ $or: [{ categoryId: { $in: scopes.documentCategories.filter(mongoose.isObjectIdOrHexString).map((id) => new mongoose.Types.ObjectId(id)) } }, { category: { $in: scopes.documentCategories } }] });
  if (scopes?.documentClassifications.length) scopeMatch.push({ $or: [{ classificationId: { $in: scopes.documentClassifications.filter(mongoose.isObjectIdOrHexString).map((id) => new mongoose.Types.ObjectId(id)) } }, { classification: { $in: scopes.documentClassifications } }] });
  return [
    ...(scopeMatch.length ? [{ $match: { $and: scopeMatch } } as PipelineStage] : []),
    { $lookup: { from: "documentaccesspolicies", let: { tenant: "$tenantId", doc: "$_id", policy: "$activePolicyId", version: "$activePolicyVersion" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$tenantId", "$$tenant"] }, { $eq: ["$documentId", "$$doc"] }, { $eq: ["$policyId", "$$policy"] }, { $eq: ["$policyVersion", "$$version"] }] } } }], as: "_accessPolicy" } },
    { $unwind: "$_accessPolicy" },
    { $match: { $expr: { $and: [
      { $eq: [{ $ifNull: ["$_accessPolicy.indexMetadata.categoryId", null] }, { $ifNull: ["$categoryId", null] }] },
      { $eq: [{ $ifNull: ["$_accessPolicy.indexMetadata.departmentId", null] }, { $ifNull: ["$departmentId", null] }] },
      { $eq: [{ $ifNull: ["$_accessPolicy.indexMetadata.classificationId", null] }, { $ifNull: ["$classificationId", null] }] },
    ] } } },
    { $lookup: { from: "documentaccesspolicies", let: { tenant: "$tenantId", doc: "$_id", inherit: "$_accessPolicy.inherits" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$tenantId", "$$tenant"] }, { $eq: ["$documentId", "$$doc"] }, { $eq: ["$policyId", "$$inherit.policyId"] }, { $eq: ["$policyVersion", "$$inherit.policyVersion"] }] } } }], as: "_inheritedPolicy" } },
    { $set: { _parent: { $arrayElemAt: ["$_inheritedPolicy", 0] }, _rules: { $concatArrays: ["$_accessPolicy.rules", { $ifNull: [{ $arrayElemAt: ["$_inheritedPolicy.rules", 0] }, []] }] } } },
    { $set: { _inheritValid: { $or: [{ $eq: ["$_accessPolicy.inherits", null] }, { $and: [
      { $eq: [{ $size: "$_inheritedPolicy" }, 1] }, { $eq: ["$_parent.contractVersion", 1] }, { $eq: ["$_parent.status", "active"] },
      { $eq: ["$_parent.indexMetadata.policyId", "$_parent.policyId"] }, { $eq: ["$_parent.indexMetadata.policyVersion", "$_parent.policyVersion"] },
      { $lte: ["$_parent.effectiveFrom", now] }, { $or: [{ $eq: ["$_parent.effectiveUntil", null] }, { $gt: ["$_parent.effectiveUntil", now] }] },
    ] }] } } },
    { $match: { "_accessPolicy.contractVersion": 1, "_accessPolicy.status": "active", "_accessPolicy.effectiveFrom": { $lte: now }, $and: [
      { $expr: { $and: [{ $eq: ["$_accessPolicy.indexMetadata.policyId", "$_accessPolicy.policyId"] }, { $eq: ["$_accessPolicy.indexMetadata.policyVersion", "$_accessPolicy.policyVersion"] }] } },
      { $or: [{ "_accessPolicy.effectiveUntil": null }, { "_accessPolicy.effectiveUntil": { $gt: now } }] }, { _inheritValid: true },
    ] } },
    { $set: { _matchingRules: { $filter: { input: "$_rules", as: "rule", cond: { $and: [{ $in: ["discover", "$$rule.actions"] }, subject("$$rule")] } } } } },
    { $match: { $expr: { $and: [{ $gt: [{ $size: { $filter: { input: "$_matchingRules", as: "rule", cond: { $eq: ["$$rule.effect", "allow"] } } } }, 0] }, { $eq: [{ $size: { $filter: { input: "$_matchingRules", as: "rule", cond: { $eq: ["$$rule.effect", "deny"] } } } }, 0] }] } } },
    { $unset: ["_accessPolicy", "_inheritedPolicy", "_parent", "_inheritValid", "_rules", "_matchingRules"] },
  ];
}

function hidden(): never { throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found"); }

let singleton: DocumentAccessAuthorizationService | null = null;
export function getDocumentAccessAuthorizationService(): DocumentAccessAuthorizationService { singleton ??= new DocumentAccessAuthorizationService(); return singleton; }
