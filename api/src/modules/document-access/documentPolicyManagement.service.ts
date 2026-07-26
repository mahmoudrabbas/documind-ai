import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import { getAuditWriter } from "../../common/observability/index.js";
import {
  DOCUMENT_NOT_FOUND, DOCUMENT_POLICY_BATCH_LIMIT_EXCEEDED, DOCUMENT_POLICY_DRAFT_INVALID,
  DOCUMENT_POLICY_IDEMPOTENCY_CONFLICT, DOCUMENT_POLICY_INHERITANCE_INVALID, DOCUMENT_POLICY_OWNER_RULE_INVALID,
  DOCUMENT_POLICY_OWNER_RULE_PROTECTED, DOCUMENT_POLICY_TAXONOMY_PROTECTED,
  DOCUMENT_POLICY_PREVIEW_MISMATCH,
  DOCUMENT_POLICY_REFERENCE_INVALID, DOCUMENT_POLICY_SENSITIVE_CONFIRMATION_REQUIRED, DOCUMENT_POLICY_VERSION_CONFLICT,
} from "../../common/errors/errorCodes.js";
import DepartmentModel from "../../db/models/department.model.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DocumentModel from "../../db/models/document.model.js";
import RoleModel from "../../db/models/role.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentPolicyBatchIdempotencyModel from "../../db/models/documentPolicyBatchIdempotency.model.js";
import DocumentPolicyIdempotencyModel from "../../db/models/documentPolicyIdempotency.model.js";
import DocumentPolicyGenerationModel from "../../db/models/documentPolicyGeneration.model.js";
import { getPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { normalizeTaxonomyName } from "../document-taxonomy/documentTaxonomy.normalization.js";
import type { ClassificationLevel } from "../document-taxonomy/documentTaxonomy.types.js";
import { PermissionEvaluatorDocumentCapabilityAdapter } from "./documentAccess.capability.js";
import { getDocumentAccessAuthorizationService } from "./documentAccess.authorization.service.js";
import { InMemoryDocumentAccessPolicyEvaluator } from "./documentAccess.evaluator.inMemory.js";
import { MongoDocumentAccessPolicyRepository } from "./documentAccess.policy.repository.mongo.js";
import { normalizeDocumentAccessPolicy } from "./documentAccess.policy.validator.js";
import type { DocumentAccessAction } from "./documentAccess.actions.js";
import type { DocumentAccessActorContext, DocumentAccessPolicy, DocumentAccessResourceContext, DocumentAccessPolicyRule } from "./documentAccess.types.js";
import { applyManagedPolicy } from "./documentPolicyManagement.persistence.js";
import { draftFingerprint, normalizePolicyDraft, semanticDraftFingerprint, stable } from "./documentPolicyManagement.draft.js";
import { createPolicyPreviewArtifact, verifyPolicyPreviewArtifact } from "./documentPolicyManagement.previewArtifact.js";
import { POLICY_BATCH_MAX_DOCUMENTS, POLICY_IMPACT_ACTIONS, POLICY_PREVIEW_MAX_USERS, type NormalizedPolicyDraft, type PolicyImpact, type PolicyTaxonomySelection, type PreviewArtifactEntry } from "./documentPolicyManagement.types.js";
import { aggregateBatchImpact, classifyPolicyImpact, emptyActionImpact, requiresSensitiveBroadeningConfirmation } from "./documentPolicyManagement.impact.js";
import { delegatedPolicyApprovalRequired } from "./documentPolicyManagement.authorization.js";
import { schedulePolicyPropagationDispatch } from "./documentPolicyPropagation.dispatcher.js";

export interface PolicyManagementContext { tenantId: string; actorId: string }
const OWNER_MINIMUM_ACTIONS: readonly DocumentAccessAction[] = ["discover", "read", "download"];
type ResolvedPolicyTaxonomy = PolicyTaxonomySelection & {
  classificationName: string; classificationLevel: ClassificationLevel;
  categoryName: string | null; departmentName: string | null;
};

export class DocumentPolicyManagementService {
  private readonly policies = new MongoDocumentAccessPolicyRepository();

  async getActive(documentId: string, context: PolicyManagementContext) {
    const state = await this.managedState(documentId, context);
    const taxonomy = await resolveTaxonomySelection(undefined, state.policy, context.tenantId);
    return { policy: state.policy, taxonomy: taxonomySummary(taxonomy), mayManage: true, documentOwnerId: state.resource.ownerId ?? null };
  }

  async history(documentId: string, input: unknown, context: PolicyManagementContext) {
    const state = await this.managedState(documentId, context); const query = object(input);
    const limit = query.limit === undefined ? 20 : parseHistoryQueryInteger(query.limit, 1, 100);
    const cursor = query.cursor === undefined ? null : parseHistoryQueryInteger(query.cursor, 1, Number.MAX_SAFE_INTEGER);
    const page = await this.policies.listFamilyHistory(context.tenantId, documentId, state.policy.policyId, cursor, limit);
    return { policies: page.policies.map(summary), nextCursor: page.nextCursor, activeVersion: state.policy.policyVersion };
  }

  async assignments(documentId: string, context: PolicyManagementContext) {
    const state = await this.managedState(documentId, context);
    const inherited = await this.inheritedPolicy(state.policy, context.tenantId, documentId);
    const rows = [...state.policy.rules.map((rule) => ({ rule, inherited: false })), ...(inherited?.rules ?? []).map((rule) => ({ rule, inherited: true }))];
    const assignments = [];
    for (const row of rows) assignments.push(await this.assignment(context.tenantId, row.rule, row.inherited));
    return { assignments };
  }

  async propagationStatus(documentId: string, context: PolicyManagementContext) {
    const state = await this.managedState(documentId, context);
    const generation = await DocumentPolicyGenerationModel.findOne({ tenantId: context.tenantId, documentId,
      documentVersion: state.document.version }).select("desiredPolicyVersion appliedPolicyVersion status reindexRequired attemptCount requestedAt completedAt failureCode").lean().exec();
    return generation ? { desiredPolicyVersion: generation.desiredPolicyVersion, appliedPolicyVersion: generation.appliedPolicyVersion,
      status: generation.status, reindexRequired: generation.reindexRequired, attempts: generation.attemptCount,
      requestedAt: generation.requestedAt, completedAt: generation.completedAt, failureCode: generation.failureCode,
      retryAvailable: generation.status === "failed" || generation.status === "dead_letter" } : {
      desiredPolicyVersion: state.policy.policyVersion, appliedPolicyVersion: null, status: "pending", reindexRequired: false,
      attempts: 0, requestedAt: null, completedAt: null, failureCode: null, retryAvailable: false,
    };
  }

  async effectiveAccess(documentId: string, input: unknown, context: PolicyManagementContext) {
    const state = await this.managedState(documentId, context); const value = object(input);
    const ids = idList(value.userIds, POLICY_PREVIEW_MAX_USERS, false);
    const users = await UserModel.find({ _id: { $in: ids }, tenantId: context.tenantId, status: "active" }).select("name role customRoleId employeeProfile.department").lean().exec();
    const inherited = await this.inheritedPolicy(state.policy, context.tenantId, documentId);
    const decisions = [];
    for (const user of users.sort((a, b) => a._id.toString().localeCompare(b._id.toString()))) {
      decisions.push({ userId: user._id.toString(), displayName: user.name, actions: await evaluateUser(user, state.resource, state.policy, inherited) });
    }
    return { users: decisions };
  }

  async preview(documentId: string, input: unknown, context: PolicyManagementContext) {
    const value = object(input); const state = await this.managedState(documentId, context);
    const expected = expectedPointer(value); requirePointer(state.policy, expected);
    const taxonomy = await resolveTaxonomySelection(value.taxonomy, state.policy, context.tenantId);
    const taxonomyChanged = !sameTaxonomy(taxonomy, state.policy.indexMetadata);
    if (taxonomyChanged && context.actorId !== (state.resource.ownerId ?? "") && state.actorRole !== "COMPANY_ADMIN") taxonomyProtected();
    const draft = materializeDraft(normalizePolicyDraft(value.draft)); await this.validateDraft(draft, state, context);
    const proposed = proposedPolicy(state, draft, context.actorId, taxonomy);
    const impact = await this.impact(state, proposed);
    const fingerprints = changeFingerprints(draft, taxonomy);
    const sensitive = await this.sensitive(state.document, impact, taxonomy.classificationId);
    const entry: PreviewArtifactEntry = { documentId, policyId: state.policy.policyId, policyVersion: state.policy.policyVersion,
      draftFingerprint: fingerprints.draft, semanticFingerprint: fingerprints.semantic, sensitive, materializedEffectiveFrom: draft.effectiveFrom! };
    const artifact = createPolicyPreviewArtifact({ purpose: "document_policy_preview", tenantId: context.tenantId, actorId: context.actorId, entries: [entry] });
    await auditPolicy(context, "DOCUMENT_POLICY_PREVIEWED", documentId, { policyId: state.policy.policyId, policyVersion: state.policy.policyVersion,
      proposedPolicyVersion: state.policy.policyVersion + 1, changeDirection: impact.direction, usersGainingAny: impact.usersGainingAny,
      usersLosingAny: impact.usersLosingAny, sensitiveConfirmationRequired: sensitive });
    return { documentId, currentPolicyId: state.policy.policyId, currentPolicyVersion: state.policy.policyVersion,
      proposedPolicyVersion: state.policy.policyVersion + 1, normalizedSummary: draftSummary(draft), impact: { ...impact, sensitiveBroadening: sensitive },
      taxonomyChanged, taxonomy: taxonomySummary(taxonomy), sensitiveConfirmationRequired: sensitive,
      previewToken: artifact.token, previewExpiresAt: artifact.expiresAt, previewFingerprint: fingerprints.draft };
  }

  async apply(documentId: string, input: unknown, idempotencyKey: string, context: PolicyManagementContext) {
    validateKey(idempotencyKey); const value = object(input); const token = text(value.previewToken, 20_000);
    const artifact = verifyPolicyPreviewArtifact(token); bindArtifact(artifact, "document_policy_preview", context);
    const entry = artifact.entries[0]; if (!entry || entry.documentId !== documentId) mismatch();
    const state = await this.managedState(documentId, context); requirePointer(state.policy, { policyId: entry.policyId, policyVersion: entry.policyVersion });
    const taxonomy = await resolveTaxonomySelection(value.taxonomy, state.policy, context.tenantId);
    const draft = materializeDraft(normalizePolicyDraft(value.draft), entry.materializedEffectiveFrom); await this.validateDraft(draft, state, context);
    const fingerprints = changeFingerprints(draft, taxonomy);
    if (fingerprints.draft !== entry.draftFingerprint) mismatch();
    const semantic = fingerprints.semantic;
    if (semantic !== entry.semanticFingerprint) mismatch();
    if (semantic === policyChangeFingerprint(state.policy)) {
      const replay = await recordNoChange(context, documentId, idempotencyKey, operationFingerprint(entry), state.policy);
      return { status: replay ? "idempotent_replay" : "no_change", policyId: state.policy.policyId, policyVersion: state.policy.policyVersion };
    }
    const proposed = proposedPolicy(state, draft, context.actorId, taxonomy);
    const taxonomyChanged = !sameTaxonomy(taxonomy, state.policy.indexMetadata);
    if (taxonomyChanged && context.actorId !== (state.resource.ownerId ?? "") && state.actorRole !== "COMPANY_ADMIN") taxonomyProtected();
    const impact = await this.impact(state, proposed); const sensitive = await this.sensitive(state.document, impact, taxonomy.classificationId);
    if (sensitive !== entry.sensitive) mismatch();
    if (impact.direction === "no_change" && !taxonomyChanged) {
      const replay = await recordNoChange(context, documentId, idempotencyKey, operationFingerprint(entry), state.policy);
      return { status: replay ? "idempotent_replay" : "no_change", policyId: state.policy.policyId,
        policyVersion: state.policy.policyVersion, propagationEventId: null };
    }
    if (sensitive && value.confirmSensitiveBroadening !== true) throw new AppError(409, DOCUMENT_POLICY_SENSITIVE_CONFIRMATION_REQUIRED, "Sensitive access broadening requires confirmation");
    const changeDirection = impact.direction === "no_change" ? "mixed" : impact.direction;
    const result = await applyManagedPolicy({ tenantId: context.tenantId, documentId, actorId: context.actorId, idempotencyKey,
      requestFingerprint: operationFingerprint(entry), expectedPolicyId: state.policy.policyId, expectedPolicyVersion: state.policy.policyVersion,
      documentVersion: state.document.version, changeDirection, sensitiveBroadening: sensitive,
      propagationReason: taxonomyChanged ? "taxonomy_change" : "policy_change", policy: proposed, taxonomy });
    if (result.outcome === "version_conflict") throw new AppError(409, DOCUMENT_POLICY_VERSION_CONFLICT, "Document policy version changed");
    if (result.outcome === "idempotency_conflict") throw new AppError(409, DOCUMENT_POLICY_IDEMPOTENCY_CONFLICT, "Idempotency key was used for another request");
    if (result.outcome === "applied") {
      schedulePolicyPropagationDispatch(context.tenantId, result.propagationEventId);
      await auditPolicy(context, "DOCUMENT_POLICY_APPLIED", documentId, { policyId: result.policyId, previousPolicyVersion: state.policy.policyVersion,
        policyVersion: result.policyVersion, changeDirection: impact.direction, taxonomyChanged, sensitiveBroadeningConfirmed: sensitive,
        propagationEventId: result.propagationEventId, correlationId: idempotencyKey });
      if (sensitive) await auditPolicy(context, "DOCUMENT_POLICY_SENSITIVE_BROADENING_CONFIRMED", documentId,
        { policyId: result.policyId, policyVersion: result.policyVersion, propagationEventId: result.propagationEventId });
    }
    return { status: result.outcome === "replay" ? "idempotent_replay" : "applied", policyId: result.policyId,
      policyVersion: result.policyVersion, propagationEventId: result.propagationEventId, taxonomy: taxonomySummary(taxonomy) };
  }

  async batchPreview(input: unknown, context: PolicyManagementContext) {
    const value = object(input); const ids = idList(value.documentIds, POLICY_BATCH_MAX_DOCUMENTS, true).sort();
    const expected = expectedMap(value.expectedPolicies, ids); const draft = materializeDraft(normalizePolicyDraft(value.draft));
    const entries: PreviewArtifactEntry[] = []; const results = [];
    for (const id of ids) {
      const state = await this.managedState(id, context); requirePointer(state.policy, expected.get(id)!); await this.validateDraft(draft, state, context);
      const taxonomy = await resolveTaxonomySelection(undefined, state.policy, context.tenantId);
      const impact = await this.impact(state, proposedPolicy(state, draft, context.actorId, taxonomy)); const sensitive = await this.sensitive(state.document, impact, taxonomy.classificationId);
      const fingerprints = changeFingerprints(draft, taxonomy);
      entries.push({ documentId: id, policyId: state.policy.policyId, policyVersion: state.policy.policyVersion,
        draftFingerprint: fingerprints.draft, semanticFingerprint: fingerprints.semantic, sensitive, materializedEffectiveFrom: draft.effectiveFrom! });
      results.push({ documentId: id, direction: impact.direction, usersGainingAny: impact.usersGainingAny, usersLosingAny: impact.usersLosingAny, sensitiveConfirmationRequired: sensitive, byAction: impact.byAction });
    }
    const artifact = createPolicyPreviewArtifact({ purpose: "document_policy_batch_preview", tenantId: context.tenantId, actorId: context.actorId, entries });
    const aggregate = aggregateBatchImpact(results);
    await auditPolicy(context, "DOCUMENT_POLICY_BATCH_PREVIEWED", "batch", { documentCount: ids.length, ...aggregate });
    return { documentCount: ids.length, aggregate, results, previewToken: artifact.token, previewExpiresAt: artifact.expiresAt };
  }

  async batchApply(input: unknown, idempotencyKey: string, context: PolicyManagementContext) {
    validateKey(idempotencyKey); const value = object(input); const artifact = verifyPolicyPreviewArtifact(text(value.previewToken, 100_000));
    bindArtifact(artifact, "document_policy_batch_preview", context); const firstEntry = artifact.entries[0]; if (!firstEntry) mismatch();
    const draft = materializeDraft(normalizePolicyDraft(value.draft), firstEntry.materializedEffectiveFrom);
    const states = new Map<string, Awaited<ReturnType<DocumentPolicyManagementService["managedState"]>>>();
    for (const entry of [...artifact.entries].sort((a, b) => a.documentId.localeCompare(b.documentId))) {
      const state = await this.managedState(entry.documentId, context); requirePointer(state.policy, entry); await this.validateDraft(draft, state, context);
      const taxonomy = await resolveTaxonomySelection(undefined, state.policy, context.tenantId); const fingerprints = changeFingerprints(draft, taxonomy);
      if (fingerprints.draft !== entry.draftFingerprint || fingerprints.semantic !== entry.semanticFingerprint) mismatch();
      if (draft.effectiveFrom !== entry.materializedEffectiveFrom) mismatch();
      const sensitive = await this.sensitive(state.document, await this.impact(state, proposedPolicy(state, draft, context.actorId, taxonomy)), taxonomy.classificationId);
      if (sensitive !== entry.sensitive) mismatch(); states.set(entry.documentId, state);
    }
    if (artifact.entries.some((entry) => entry.sensitive) && value.confirmSensitiveBroadening !== true) throw new AppError(409, DOCUMENT_POLICY_SENSITIVE_CONFIRMATION_REQUIRED, "Sensitive access broadening requires confirmation");
    const batchFingerprint = createHash("sha256").update(stable({ entries: artifact.entries, draft: draftFingerprint(draft), confirmation: value.confirmSensitiveBroadening === true })).digest("hex");
    const batchIdentity = { tenantId: context.tenantId, actorId: context.actorId, key: idempotencyKey };
    const existingBatch = await DocumentPolicyBatchIdempotencyModel.findOne(batchIdentity).lean().exec();
    if (existingBatch) {
      if (existingBatch.requestFingerprint !== batchFingerprint) throw new AppError(409, DOCUMENT_POLICY_IDEMPOTENCY_CONFLICT, "Idempotency key was used for another batch");
      if (existingBatch.status === "completed") return { status: "idempotent_replay", results: existingBatch.results };
    } else {
      try { await DocumentPolicyBatchIdempotencyModel.create({ ...batchIdentity, requestFingerprint: batchFingerprint, status: "pending", results: [], createdAt: new Date(), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }); }
      catch { const raced = await DocumentPolicyBatchIdempotencyModel.findOne(batchIdentity).lean().exec(); if (raced?.requestFingerprint !== batchFingerprint) throw new AppError(409, DOCUMENT_POLICY_IDEMPOTENCY_CONFLICT, "Idempotency key was used for another batch"); }
    }
    const results = [];
    for (const entry of [...artifact.entries].sort((a, b) => a.documentId.localeCompare(b.documentId))) {
      const state = states.get(entry.documentId)!; const taxonomy = await resolveTaxonomySelection(undefined, state.policy, context.tenantId);
      const semantic = changeFingerprints(draft, taxonomy).semantic;
      if (semantic === policyChangeFingerprint(state.policy)) { results.push({ documentId: entry.documentId, status: "no_change" }); continue; }
      try { const derivedKey = createHash("sha256").update(`${idempotencyKey}:${entry.documentId}`).digest("hex"); const applied = await this.apply(entry.documentId, { previewToken: createPolicyPreviewArtifact({ purpose: "document_policy_preview", tenantId: context.tenantId, actorId: context.actorId, entries: [entry] }).token, draft, confirmSensitiveBroadening: value.confirmSensitiveBroadening }, derivedKey, context); results.push({ documentId: entry.documentId, status: applied.status, policyVersion: applied.policyVersion }); }
      catch (error) { if (error instanceof AppError && error.code === DOCUMENT_POLICY_VERSION_CONFLICT) results.push({ documentId: entry.documentId, status: "version_conflict" }); else results.push({ documentId: entry.documentId, status: "failed" }); }
    }
    await DocumentPolicyBatchIdempotencyModel.updateOne(batchIdentity, { $set: { status: "completed", results } }).exec();
    const status = results.every((item) => item.status !== "failed" && item.status !== "version_conflict") ? "complete" : "partial";
    await auditPolicy(context, "DOCUMENT_POLICY_BATCH_APPLIED", "batch", { documentCount: results.length, status,
      appliedCount: results.filter((item) => item.status === "applied").length, replayCount: results.filter((item) => item.status === "idempotent_replay").length,
      noChangeCount: results.filter((item) => item.status === "no_change").length, failedCount: results.filter((item) => item.status === "failed" || item.status === "version_conflict").length });
    return { status, results };
  }

  async policyEditorOptions(documentId: string, context: PolicyManagementContext) {
    if (!mongoose.isObjectIdOrHexString(documentId)) hidden();
    const document = await DocumentModel.findOne({ _id: documentId, tenantId: context.tenantId, deletedAt: null }).lean().exec(); if (!document) hidden();
    const user = await UserModel.findOne({ _id: context.actorId, tenantId: context.tenantId, status: "active" }).select("role customRoleId").lean().exec(); if (!user) hidden();
    const resource = resourceFrom(document); const coarse = await getPermissionEvaluator().evaluate({ tenantId: context.tenantId, actorId: context.actorId, baseRole: user.role,
      customRoleId: user.customRoleId?.toString(), permission: Permission.DOCUMENTS_MANAGE_ACCESS, resource: permissionResource(resource) });
    if (!coarse.allowed) hidden();
    if (delegatedPolicyApprovalRequired(user.role)) await getDocumentAccessAuthorizationService().authorizeDocumentAction(context, documentId, "manage_access");
    const [users, roles, classifications, categories, departments] = await Promise.all([
      UserModel.find({ tenantId: context.tenantId, status: "active" }).select("name").sort({ name: 1 }).limit(500).lean().exec(),
      RoleModel.find({ tenantId: context.tenantId, status: "active", migrationState: "complete" }).select("name").sort({ name: 1 }).lean().exec(),
      DocumentClassificationModel.find({ tenantId: context.tenantId, status: "active" }).select("name level").sort({ name: 1 }).lean().exec(),
      DocumentCategoryModel.find({ tenantId: context.tenantId, status: "active" }).select("name").sort({ name: 1 }).lean().exec(),
      DepartmentModel.find({ tenantId: context.tenantId, status: "active" }).select("name").sort({ name: 1 }).lean().exec(),
    ]);
    const isOwner = document.owner?.toString() === context.actorId;
    const taxonomyEditable = isOwner || user.role === "COMPANY_ADMIN";
    return {
      documentOwnerId: document.owner?.toString() ?? null,
      taxonomyEditable,
      users: users.map((u) => ({ id: u._id.toString(), name: u.name })),
      roles: roles.map((r) => ({ id: r._id.toString(), name: r.name })),
      classifications: classifications.map((c) => ({ id: c._id.toString(), name: c.name, level: c.level })),
      categories: categories.map((c) => ({ id: c._id.toString(), name: c.name })),
      departments: departments.map((d) => ({ id: d._id.toString(), name: d.name })),
    };
  }

  private async managedState(documentId: string, context: PolicyManagementContext) {
    if (!mongoose.isObjectIdOrHexString(documentId)) hidden();
    const document = await DocumentModel.findOne({ _id: documentId, tenantId: context.tenantId, deletedAt: null }).lean().exec(); if (!document) hidden();
    const user = await UserModel.findOne({ _id: context.actorId, tenantId: context.tenantId, status: "active" }).select("role customRoleId").lean().exec(); if (!user) hidden();
    const resource = resourceFrom(document); const coarse = await getPermissionEvaluator().evaluate({ tenantId: context.tenantId, actorId: context.actorId, baseRole: user.role,
      customRoleId: user.customRoleId?.toString(), permission: Permission.DOCUMENTS_MANAGE_ACCESS, resource: permissionResource(resource) });
    if (!coarse.allowed) hidden();
    if (delegatedPolicyApprovalRequired(user.role)) await getDocumentAccessAuthorizationService().authorizeDocumentAction(context, documentId, "manage_access");
    if (!document.activePolicyId || !document.activePolicyVersion) hidden();
    const policy = await this.policies.findExact(context.tenantId, documentId, document.activePolicyId.toString(), document.activePolicyVersion); if (!policy) hidden();
    return { document, resource, policy, actorRole: user.role as string };
  }

  private async validateDraft(draft: NormalizedPolicyDraft, state: Awaited<ReturnType<DocumentPolicyManagementService["managedState"]>>, context: PolicyManagementContext) {
    const currentOwnerRule = state.policy.rules.find((rule) => rule.subject.type === "owner") ?? null;
    const draftOwnerRules = draft.rules.filter((rule) => rule.subject.type === "owner");
    if (currentOwnerRule && draftOwnerRules.length === 0) ownerRuleProtected();
    if (draftOwnerRules.length > 1) ownerRuleInvalid("Only one owner rule is permitted");
    for (const ownerRule of draftOwnerRules) {
      const missing = OWNER_MINIMUM_ACTIONS.filter((action) => !ownerRule.actions.includes(action));
      if (missing.length > 0) ownerRuleInvalid(`Owner rule must include minimum actions: ${missing.join(", ")}`);
    }
    if (currentOwnerRule && context.actorId !== (state.resource.ownerId ?? "")) {
      const draftOwner = draftOwnerRules[0] ?? null;
      if (!draftOwner) ownerRuleProtected();
      const currentSemantic = stable({ effect: currentOwnerRule.effect, subject: currentOwnerRule.subject, actions: [...currentOwnerRule.actions].sort() });
      const draftSemantic = stable({ effect: draftOwner.effect, subject: draftOwner.subject, actions: [...draftOwner.actions].sort() });
      if (currentSemantic !== draftSemantic) ownerRuleProtected();
    }
    for (const rule of draft.rules) {
      const id = rule.subject.id; if (!id) continue;
      if (rule.subject.type === "user") { if (!await UserModel.exists({ _id: id, tenantId: context.tenantId, status: "active", role: { $ne: "SUPER_ADMIN" } })) referenceInvalid(); }
      if (rule.subject.type === "custom_role") { if (!await RoleModel.exists({ _id: id, tenantId: context.tenantId, status: "active", migrationState: "complete" })) referenceInvalid(); }
      if (rule.subject.type === "department") { if (!await DepartmentModel.exists({ _id: id, tenantId: context.tenantId, status: "active" })) referenceInvalid(); }
    }
    if (draft.inherits) {
      if (draft.inherits.policyId !== state.policy.policyId || draft.inherits.policyVersion >= state.policy.policyVersion + 1) inheritanceInvalid();
      let pointer: typeof draft.inherits | null = draft.inherits; const seen = new Set<string>(); let depth = 0;
      while (pointer) { if (++depth > 10 || seen.has(`${pointer.policyId}:${pointer.policyVersion}`)) inheritanceInvalid(); seen.add(`${pointer.policyId}:${pointer.policyVersion}`);
        const parent = await this.policies.findExact(context.tenantId, state.document._id.toString(), pointer.policyId, pointer.policyVersion);
        const now = Date.now(); if (!parent || parent.status !== "active" || Date.parse(parent.effectiveFrom) > now || (parent.effectiveUntil && Date.parse(parent.effectiveUntil) <= now)) inheritanceInvalid(); pointer = parent.inherits ?? null; }
    }
    let administratorRecovery = false; let adminAfter: mongoose.Types.ObjectId | null = null;
    while (!administratorRecovery) {
      const administrators = await UserModel.find({ tenantId: context.tenantId, status: "active", role: "COMPANY_ADMIN", ...(adminAfter ? { _id: { $gt: adminAfter } } : {}) }).sort({ _id: 1 }).select("role customRoleId").limit(100).lean().exec();
      if (!administrators.length) break;
      for (const admin of administrators) {
        const decision = await getPermissionEvaluator().evaluate({ tenantId: context.tenantId, actorId: admin._id.toString(), baseRole: admin.role,
          customRoleId: admin.customRoleId?.toString(), permission: Permission.DOCUMENTS_MANAGE_ACCESS, resource: permissionResource(state.resource) });
        if (decision.allowed) { administratorRecovery = true; break; }
      }
      adminAfter = administrators.at(-1)!._id; if (administrators.length < 100) break;
    }
    if (!administratorRecovery) {
      const proposed = proposedPolicy(state, draft, context.actorId); const inherited = await this.inheritedPolicy(proposed, context.tenantId, state.document._id.toString());
      let viable = false; let after: mongoose.Types.ObjectId | null = null;
      while (!viable) {
        const users = await UserModel.find({ tenantId: context.tenantId, status: "active", ...(after ? { _id: { $gt: after } } : {}) }).sort({ _id: 1 }).limit(100).select("role customRoleId employeeProfile.department").lean().exec();
        if (!users.length) break;
        for (const user of users) if ((await evaluateUser(user, state.resource, proposed, inherited)).manage_access) { viable = true; break; }
        after = users.at(-1)!._id; if (users.length < 100) break;
      }
      if (!viable) throw new AppError(400, DOCUMENT_POLICY_DRAFT_INVALID, "Policy would remove every management path");
    }
  }

  private async inheritedPolicy(policy: DocumentAccessPolicy, tenantId: string, documentId: string) { return policy.inherits ? this.policies.findExact(tenantId, documentId, policy.inherits.policyId, policy.inherits.policyVersion) : null; }
  private async impact(state: Awaited<ReturnType<DocumentPolicyManagementService["managedState"]>>, proposed: DocumentAccessPolicy): Promise<PolicyImpact> {
    const byAction = emptyActionImpact();
    const currentInherited = await this.inheritedPolicy(state.policy, state.document.tenantId.toString(), state.document._id.toString());
    const proposedInherited = await this.inheritedPolicy(proposed, state.document.tenantId.toString(), state.document._id.toString());
    const currentResource = policyEvaluationResource(state.resource, state.policy);
    const proposedResource = policyEvaluationResource(state.resource, proposed);
    let usersGainingAny = 0; let usersLosingAny = 0; let after: mongoose.Types.ObjectId | null = null;
    while (true) {
      const users = await UserModel.find({ tenantId: state.document.tenantId, status: "active", ...(after ? { _id: { $gt: after } } : {}) }).sort({ _id: 1 }).limit(100).select("role customRoleId employeeProfile.department").lean().exec();
      if (!users.length) break;
      for (const user of users) {
        const current = await evaluateUser(user, currentResource, state.policy, currentInherited); const next = await evaluateUser(user, proposedResource, proposed, proposedInherited);
        let gained = false; let lost = false;
        for (const action of POLICY_IMPACT_ACTIONS) { if (!current[action] && next[action]) { byAction[action].gained += 1; gained = true; } if (current[action] && !next[action]) { byAction[action].lost += 1; lost = true; } }
        if (gained) usersGainingAny += 1; if (lost) usersLosingAny += 1;
      }
      after = users.at(-1)!._id; if (users.length < 100) break;
    }
    const direction = classifyPolicyImpact(byAction);
    const currentRules = new Set(state.policy.rules.map(ruleSemantic)); const proposedRules = new Set(proposed.rules.map(ruleSemantic));
    return { direction, byAction, usersGainingAny, usersLosingAny, ruleDelta: { added: [...proposedRules].filter((item) => !currentRules.has(item)).length, removed: [...currentRules].filter((item) => !proposedRules.has(item)).length }, sensitiveBroadening: false };
  }
  private async sensitive(document: { tenantId: mongoose.Types.ObjectId; classificationId?: mongoose.Types.ObjectId | null }, impact: PolicyImpact, classificationId = document.classificationId?.toString() ?? null) {
    if (!classificationId) return false; const classification = await DocumentClassificationModel.findOne({ _id: classificationId, tenantId: document.tenantId, status: "active" }).select("level").lean().exec();
    return requiresSensitiveBroadeningConfirmation(classification?.level ?? null, impact.byAction);
  }
  private async assignment(tenantId: string, rule: DocumentAccessPolicyRule, inherited: boolean) {
    let label = rule.subject.type === "owner" ? "Owner" : rule.subject.type === "tenant_member" ? "Tenant members" : "Stale reference"; let stale = false;
    if (rule.subject.id && rule.subject.type === "user") { const item = await UserModel.findOne({ _id: rule.subject.id, tenantId, status: "active" }).select("name").lean().exec(); label = item?.name ?? "Stale reference"; stale = !item; }
    if (rule.subject.id && rule.subject.type === "custom_role") { const item = await RoleModel.findOne({ _id: rule.subject.id, tenantId, status: "active" }).select("name").lean().exec(); label = item?.name ?? "Stale reference"; stale = !item; }
    if (rule.subject.id && rule.subject.type === "department") { const item = await DepartmentModel.findOne({ _id: rule.subject.id, tenantId, status: "active" }).select("name").lean().exec(); label = item?.name ?? "Stale reference"; stale = !item; }
    return { subjectType: rule.subject.type, subjectId: rule.subject.id ?? null, displayLabel: label, effect: rule.effect, actions: rule.actions, inherited, stale };
  }
}

async function resolveTaxonomySelection(input: unknown, policy: DocumentAccessPolicy, tenantId: string): Promise<ResolvedPolicyTaxonomy> {
  const explicit = input !== undefined;
  const selection = explicit ? parseTaxonomySelection(input) : taxonomyFromPolicy(policy);
  const active = explicit ? { status: "active" as const } : {};
  const [classification, category, department] = await Promise.all([
    DocumentClassificationModel.findOne({ _id: selection.classificationId, tenantId, ...active }).select("name level").lean().exec(),
    selection.categoryId ? DocumentCategoryModel.findOne({ _id: selection.categoryId, tenantId, ...active }).select("name").lean().exec() : null,
    selection.departmentId ? DepartmentModel.findOne({ _id: selection.departmentId, tenantId, ...active }).select("name").lean().exec() : null,
  ]);
  if (!classification || selection.categoryId && !category || selection.departmentId && !department) referenceInvalid();
  return { ...selection, classificationName: classification.name, classificationLevel: classification.level,
    categoryName: category?.name ?? null, departmentName: department?.name ?? null };
}
function parseTaxonomySelection(input: unknown): PolicyTaxonomySelection {
  const value = object(input);
  if (Object.keys(value).some((key) => !["classificationId", "categoryId", "departmentId"].includes(key))) draftInvalid();
  const classificationId = taxonomyId(value.classificationId, false);
  const categoryId = taxonomyId(value.categoryId, true);
  const departmentId = taxonomyId(value.departmentId, true);
  return { classificationId: classificationId!, categoryId, departmentId };
}
function taxonomyId(value: unknown, nullable: boolean): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value)) draftInvalid();
  return value;
}
function taxonomyFromPolicy(policy: DocumentAccessPolicy): PolicyTaxonomySelection {
  const classificationId = policy.indexMetadata.classificationId;
  if (!classificationId) referenceInvalid();
  return { classificationId, categoryId: policy.indexMetadata.categoryId ?? null, departmentId: policy.indexMetadata.departmentId ?? null };
}
function taxonomySummary(taxonomy: ResolvedPolicyTaxonomy) {
  return { classificationId: taxonomy.classificationId, classificationName: taxonomy.classificationName, classificationLevel: taxonomy.classificationLevel,
    categoryId: taxonomy.categoryId, categoryName: taxonomy.categoryName, departmentId: taxonomy.departmentId, departmentName: taxonomy.departmentName };
}
function sameTaxonomy(left: PolicyTaxonomySelection, right: DocumentAccessPolicy["indexMetadata"]) {
  return left.classificationId === (right.classificationId ?? null) && left.categoryId === (right.categoryId ?? null) && left.departmentId === (right.departmentId ?? null);
}
function changeFingerprints(draft: NormalizedPolicyDraft, taxonomy: PolicyTaxonomySelection) {
  return { draft: createHash("sha256").update(stable({ draft, taxonomy })).digest("hex"), semantic: changeSemanticFingerprint(draft, taxonomy) };
}
function changeSemanticFingerprint(draft: Pick<NormalizedPolicyDraft, "rules" | "inherits" | "effectiveUntil">, taxonomy: PolicyTaxonomySelection) {
  return createHash("sha256").update(stable({ semanticDraftFingerprint: semanticDraftFingerprint(draft), taxonomy })).digest("hex");
}
function proposedPolicy(state: { policy: DocumentAccessPolicy; resource: DocumentAccessResourceContext }, draft: NormalizedPolicyDraft, actorId: string, taxonomy: PolicyTaxonomySelection = taxonomyFromPolicy(state.policy)): DocumentAccessPolicy {
  const createdAt = new Date().toISOString(); const version = state.policy.policyVersion + 1;
  return normalizeDocumentAccessPolicy({ contractVersion: 1, tenantId: state.policy.tenantId, documentId: state.policy.documentId,
    policyId: state.policy.policyId, policyVersion: version, status: "active", effectiveFrom: draft.effectiveFrom ?? createdAt,
    effectiveUntil: draft.effectiveUntil, inherits: draft.inherits, rules: draft.rules, provenance: { createdBy: actorId, createdAt, ...(draft.reason ? { reason: draft.reason } : {}) },
    indexMetadata: { policyId: state.policy.policyId, policyVersion: version, classificationId: taxonomy.classificationId, categoryId: taxonomy.categoryId, departmentId: taxonomy.departmentId } });
}
async function evaluateUser(user: { _id: mongoose.Types.ObjectId; role: DocumentAccessActorContext["baseRole"]; customRoleId?: mongoose.Types.ObjectId | null; employeeProfile?: { department?: string } }, resource: DocumentAccessResourceContext, policy: DocumentAccessPolicy, inherited: DocumentAccessPolicy | null) {
  const departmentIds: string[] = []; if (user.employeeProfile?.department) { const department = await DepartmentModel.findOne({ tenantId: resource.tenantId, normalizedName: normalizeTaxonomyName(user.employeeProfile.department), status: "active" }).select("_id").lean().exec(); if (department) departmentIds.push(department._id.toString()); }
  const actor: DocumentAccessActorContext = { tenantId: resource.tenantId, actorId: user._id.toString(), baseRole: user.role, customRoleId: user.customRoleId?.toString() ?? null, departmentIds };
  const evaluator = new InMemoryDocumentAccessPolicyEvaluator(new PermissionEvaluatorDocumentCapabilityAdapter(getPermissionEvaluator())); const result = {} as Record<DocumentAccessAction, boolean>;
  for (const action of POLICY_IMPACT_ACTIONS) result[action] = (await evaluator.evaluate({ actor, resource, action, policy, inheritedPolicy: inherited, evaluatedAt: new Date().toISOString() })).allowed;
  return result;
}
function resourceFrom(document: { _id: mongoose.Types.ObjectId; tenantId: mongoose.Types.ObjectId; owner?: mongoose.Types.ObjectId | null; categoryId?: mongoose.Types.ObjectId | null; departmentId?: mongoose.Types.ObjectId | null; classificationId?: mongoose.Types.ObjectId | null; classification: string; category?: string | null; department?: string | null; activePolicyId?: mongoose.Types.ObjectId | null; activePolicyVersion?: number | null }) : DocumentAccessResourceContext { return { tenantId: document.tenantId.toString(), documentId: document._id.toString(), ownerId: document.owner?.toString() ?? null, categoryId: document.categoryId?.toString() ?? null, departmentId: document.departmentId?.toString() ?? null, classificationId: document.classificationId?.toString() ?? null, classification: document.classification, legacyCategory: document.category ?? null, legacyDepartment: document.department ?? null, activePolicyId: document.activePolicyId?.toString() ?? null, activePolicyVersion: document.activePolicyVersion ?? null }; }
function policyEvaluationResource(resource: DocumentAccessResourceContext, policy: DocumentAccessPolicy): DocumentAccessResourceContext { return { ...resource,
  classificationId: policy.indexMetadata.classificationId ?? null, categoryId: policy.indexMetadata.categoryId ?? null,
  departmentId: policy.indexMetadata.departmentId ?? null, activePolicyId: policy.policyId, activePolicyVersion: policy.policyVersion }; }
function permissionResource(resource: DocumentAccessResourceContext) { return { tenantId: resource.tenantId, ...(resource.ownerId ? { ownerId: resource.ownerId } : {}), ...(resource.departmentId ? { departmentId: resource.departmentId } : {}), ...(resource.categoryId ? { documentCategory: resource.categoryId } : {}), ...(resource.classificationId ? { documentClassification: resource.classificationId } : {}) }; }
function summary(policy: DocumentAccessPolicy) { return { policyId: policy.policyId, policyVersion: policy.policyVersion, status: policy.status, effectiveFrom: policy.effectiveFrom, effectiveUntil: policy.effectiveUntil ?? null, reason: policy.provenance.reason ?? null, createdBy: policy.provenance.createdBy, createdAt: policy.provenance.createdAt }; }
function draftSummary(draft: NormalizedPolicyDraft) { return { ruleCount: draft.rules.length, allowRuleCount: draft.rules.filter((r) => r.effect === "allow").length, denyRuleCount: draft.rules.filter((r) => r.effect === "deny").length, inherits: draft.inherits, effectiveFrom: draft.effectiveFrom, effectiveUntil: draft.effectiveUntil, reason: draft.reason }; }
function policyChangeFingerprint(policy: DocumentAccessPolicy) { return changeSemanticFingerprint({ rules: policy.rules, inherits: policy.inherits ?? null, effectiveUntil: policy.effectiveUntil ?? null }, taxonomyFromPolicy(policy)); }
function operationFingerprint(entry: PreviewArtifactEntry) { return createHash("sha256").update(stable({ documentId: entry.documentId, policyId: entry.policyId, policyVersion: entry.policyVersion, draftFingerprint: entry.draftFingerprint })).digest("hex"); }
async function recordNoChange(context: PolicyManagementContext, documentId: string, key: string, requestFingerprint: string, policy: DocumentAccessPolicy): Promise<boolean> {
  const identity = { tenantId: context.tenantId, documentId, actorId: context.actorId, operation: "policy_apply" as const, key };
  const existing = await DocumentPolicyIdempotencyModel.findOne(identity).lean().exec();
  if (existing) { if (existing.requestFingerprint !== requestFingerprint) throw new AppError(409, DOCUMENT_POLICY_IDEMPOTENCY_CONFLICT, "Idempotency key was used for another request"); return true; }
  try { await DocumentPolicyIdempotencyModel.create({ ...identity, requestFingerprint, policyId: policy.policyId, policyVersion: policy.policyVersion, createdAt: new Date(), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) }); return false; }
  catch { const raced = await DocumentPolicyIdempotencyModel.findOne(identity).lean().exec(); if (raced?.requestFingerprint === requestFingerprint) return true; throw new AppError(409, DOCUMENT_POLICY_IDEMPOTENCY_CONFLICT, "Idempotency key was used for another request"); }
}
function materializeDraft(draft: NormalizedPolicyDraft, expected?: string): NormalizedPolicyDraft {
  const effectiveFrom = draft.effectiveFrom ?? expected ?? new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  if (expected && effectiveFrom !== expected) mismatch();
  return { ...draft, effectiveFrom };
}
function ruleSemantic(rule: DocumentAccessPolicyRule) { return stable({ effect: rule.effect, subject: rule.subject, actions: [...rule.actions].sort() }); }
function expectedPointer(value: Record<string, unknown>) { const policyId = text(value.expectedPolicyId, 64); if (!mongoose.isObjectIdOrHexString(policyId)) draftInvalid(); return { policyId, policyVersion: boundedInt(value.expectedPolicyVersion, 1, Number.MAX_SAFE_INTEGER) }; }
function requirePointer(policy: DocumentAccessPolicy, expected: { policyId: string; policyVersion: number }) { if (policy.policyId !== expected.policyId || policy.policyVersion !== expected.policyVersion) throw new AppError(409, DOCUMENT_POLICY_VERSION_CONFLICT, "Document policy version changed"); }
function bindArtifact(payload: ReturnType<typeof verifyPolicyPreviewArtifact>, purpose: typeof payload.purpose, context: PolicyManagementContext) { if (payload.purpose !== purpose || payload.tenantId !== context.tenantId || payload.actorId !== context.actorId) mismatch(); }
function idList(value: unknown, max: number, rejectDuplicates: boolean): string[] { if (!Array.isArray(value) || value.length < 1 || value.length > max || value.some((id) => typeof id !== "string" || !mongoose.isObjectIdOrHexString(id))) { if (max === POLICY_BATCH_MAX_DOCUMENTS) throw new AppError(400, DOCUMENT_POLICY_BATCH_LIMIT_EXCEEDED, "Invalid batch document list"); draftInvalid(); } const ids = value as string[]; if (rejectDuplicates && new Set(ids).size !== ids.length) draftInvalid(); return [...new Set(ids)]; }
function expectedMap(value: unknown, ids: string[]) { if (!Array.isArray(value) || value.length !== ids.length) draftInvalid(); const map = new Map<string, { policyId: string; policyVersion: number }>(); for (const raw of value) { const item = object(raw); const documentId = text(item.documentId, 64); if (!ids.includes(documentId) || map.has(documentId)) draftInvalid(); map.set(documentId, expectedPointer(item)); } return map; }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) draftInvalid(); return value as Record<string, unknown>; }
function text(value: unknown, max: number) { if (typeof value !== "string" || !value.trim() || value.length > max) draftInvalid(); return value.trim(); }
export function parseHistoryQueryInteger(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) draftInvalid();
  return parsed;
}
function boundedInt(value: unknown, min: number, max: number) { if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) draftInvalid(); return Number(value); }
function validateKey(value: string) { if (!value || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) draftInvalid(); }
function hidden(): never { throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found"); }
function referenceInvalid(): never { throw new AppError(400, DOCUMENT_POLICY_REFERENCE_INVALID, "Policy reference is invalid"); }
function inheritanceInvalid(): never { throw new AppError(400, DOCUMENT_POLICY_INHERITANCE_INVALID, "Policy inheritance is invalid"); }
function mismatch(): never { throw new AppError(409, DOCUMENT_POLICY_PREVIEW_MISMATCH, "Policy preview no longer matches"); }
function draftInvalid(): never { throw new AppError(400, DOCUMENT_POLICY_DRAFT_INVALID, "Policy management input is invalid"); }
function ownerRuleInvalid(message: string): never { throw new AppError(400, DOCUMENT_POLICY_OWNER_RULE_INVALID, message); }
function ownerRuleProtected(): never { throw new AppError(403, DOCUMENT_POLICY_OWNER_RULE_PROTECTED, "Only the document owner may modify this rule"); }
function taxonomyProtected(): never { throw new AppError(403, DOCUMENT_POLICY_TAXONOMY_PROTECTED, "Only the document owner or a Company Admin may change document taxonomy"); }
async function auditPolicy(context: PolicyManagementContext, action: Parameters<ReturnType<typeof getAuditWriter>["write"]>[0]["action"], resourceId: string, metadata: Record<string, unknown>) {
  await getAuditWriter().write({ action, resourceType: "DocumentPolicy", resourceId, tenantId: context.tenantId, actorId: context.actorId, metadata });
}

let singleton: DocumentPolicyManagementService | null = null;
export function getDocumentPolicyManagementService() { singleton ??= new DocumentPolicyManagementService(); return singleton; }
