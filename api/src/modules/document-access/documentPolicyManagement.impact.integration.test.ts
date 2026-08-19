import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { InMemoryAuditWriter } from "../../common/observability/auditWriter.js";
import { setAuditWriter } from "../../common/observability/index.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DepartmentModel from "../../db/models/department.model.js";
import DocumentPolicyIdempotencyModel from "../../db/models/documentPolicyIdempotency.model.js";
import UserModel from "../../db/models/user.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { InMemoryPermissionEvaluator } from "../permissions/permissions.evaluator.fake.js";
import { resetPermissionEvaluator, setPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { verifyPolicyPreviewArtifact } from "./documentPolicyManagement.previewArtifact.js";
import { DocumentPolicyManagementService } from "./documentPolicyManagement.service.js";
import type { DocumentAccessPolicy, DocumentAccessResourceContext } from "./documentAccess.types.js";
import type { PolicyImpact } from "./documentPolicyManagement.types.js";

const tenantId = new mongoose.Types.ObjectId();
const documentId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const mahmoudId = new mongoose.Types.ObjectId();
const policyId = new mongoose.Types.ObjectId();
const currentClassificationId = new mongoose.Types.ObjectId();
const confidentialClassificationId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();
const departmentId = new mongoose.Types.ObjectId();
let mongo: MongoMemoryServer | null = null;

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
  });
  await mongoose.connect(mongo.getUri(), { dbName: "document-policy-impact" });
  await Promise.all([UserModel.init(), DocumentClassificationModel.init(), DocumentCategoryModel.init(), DepartmentModel.init(), DocumentPolicyIdempotencyModel.init()]);
});

beforeEach(async () => {
  await Promise.all([UserModel.deleteMany({}), DocumentClassificationModel.deleteMany({}), DocumentCategoryModel.deleteMany({}), DepartmentModel.deleteMany({}), DocumentPolicyIdempotencyModel.deleteMany({})]);
  await UserModel.create([
    user(ownerId, "Owner", "owner@example.com"),
    user(mahmoudId, "Mahmoud", "mahmoud@example.com"),
  ]);
  const permissions = new InMemoryPermissionEvaluator();
  permissions.addUser(ownerId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  permissions.addUser(mahmoudId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  setPermissionEvaluator(permissions);
  setAuditWriter(new InMemoryAuditWriter());
});

after(async () => {
  resetPermissionEvaluator();
  setAuditWriter(null);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("owner-only policy plus explicit user read is broadening without owner losses", async () => {
  const current = policy(1, [{
    ruleId: "owner-access",
    effect: "allow",
    subject: { type: "owner" },
    actions: ["discover", "read", "download"],
  }]);
  const proposed = policy(2, [...current.rules, {
    ruleId: "mahmoud-read",
    effect: "allow",
    subject: { type: "user", id: mahmoudId.toString() },
    actions: ["read"],
  }]);

  const impact = await calculateImpact(current, proposed);

  assert.equal(impact.direction, "broadening");
  assert.equal(impact.usersGainingAny, 1);
  assert.equal(impact.usersLosingAny, 0);
  assert.deepEqual(impact.byAction.read, { gained: 1, lost: 0 });
  assert.equal(Object.values(impact.byAction).reduce((total, action) => total + action.lost, 0), 0);
});

test("removing owner read is tightening", async () => {
  const current = ownerPolicy();
  const proposed = policy(2, [{
    ...current.rules[0]!,
    actions: ["discover", "download"],
  }]);

  const impact = await calculateImpact(current, proposed);

  assert.equal(impact.direction, "tightening");
  assert.equal(impact.usersGainingAny, 0);
  assert.equal(impact.usersLosingAny, 1);
  assert.deepEqual(impact.byAction.read, { gained: 0, lost: 1 });
});

test("semantically unchanged draft has neutral effective impact", async () => {
  const current = ownerPolicy();
  const impact = await calculateImpact(current, policy(2, current.rules));

  assert.equal(impact.direction, "no_change");
  assert.equal(impact.usersGainingAny, 0);
  assert.equal(impact.usersLosingAny, 0);
  assert.equal(Object.values(impact.byAction).reduce((total, action) => total + action.gained + action.lost, 0), 0);
});

test("explicit user deny overrides an existing tenant-member allow", async () => {
  const current = policy(1, [{
    ruleId: "tenant-read",
    effect: "allow",
    subject: { type: "tenant_member" },
    actions: ["read"],
  }]);
  const proposed = policy(2, [...current.rules, {
    ruleId: "mahmoud-read-deny",
    effect: "deny",
    subject: { type: "user", id: mahmoudId.toString() },
    actions: ["read"],
  }]);

  const impact = await calculateImpact(current, proposed);

  assert.equal(impact.direction, "tightening");
  assert.equal(impact.usersLosingAny, 1);
  assert.deepEqual(impact.byAction.read, { gained: 0, lost: 1 });
});

test("confidential broadening requires confirmation and is bound into the preview token", async () => {
  await Promise.all([
    classification(currentClassificationId, "Restricted", "restricted"),
    classification(confidentialClassificationId, "Confidential", "confidential"),
  ]);
  const current = ownerPolicy();
  const service = serviceWithState(current, currentClassificationId);
  const taxonomy = { classificationId: confidentialClassificationId.toString(), categoryId: null, departmentId: null };
  const draft = {
    rules: [...current.rules, {
      ruleId: "mahmoud-read",
      effect: "allow",
      subject: { type: "user", id: mahmoudId.toString() },
      actions: ["read"],
    }],
  };
  const preview = await service.preview(documentId.toString(), {
    expectedPolicyId: policyId.toString(),
    expectedPolicyVersion: 1,
    taxonomy,
    draft,
  }, { tenantId: tenantId.toString(), actorId: ownerId.toString() });

  assert.equal(preview.impact.direction, "broadening");
  assert.equal(preview.taxonomyChanged, true);
  assert.equal(preview.taxonomy.classificationLevel, "confidential");
  assert.equal(preview.impact.sensitiveBroadening, true);
  assert.equal(preview.sensitiveConfirmationRequired, true);
  assert.equal(verifyPolicyPreviewArtifact(preview.previewToken).entries[0]?.sensitive, true);
  await assert.rejects(
    service.apply(documentId.toString(), { previewToken: preview.previewToken, taxonomy, draft }, "confidential-without-confirmation",
      { tenantId: tenantId.toString(), actorId: ownerId.toString() }),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_POLICY_SENSITIVE_CONFIRMATION_REQUIRED",
  );
});

test("taxonomy assignment and optional clearing are represented in the policy preview", async () => {
  await Promise.all([
    classification(currentClassificationId, "Restricted", "restricted"),
    DocumentCategoryModel.create({ _id: categoryId, tenantId, name: "Legal", normalizedName: "legal", status: "active", createdBy: ownerId, updatedBy: ownerId }),
    DepartmentModel.create({ _id: departmentId, tenantId, name: "Compliance", normalizedName: "compliance", status: "active", createdBy: ownerId, updatedBy: ownerId }),
  ]);
  const base = ownerPolicy();
  const service = serviceWithState(base, currentClassificationId);
  const assigned = await service.preview(documentId.toString(), previewInput(base, {
    classificationId: currentClassificationId.toString(), categoryId: categoryId.toString(), departmentId: departmentId.toString(),
  }), { tenantId: tenantId.toString(), actorId: ownerId.toString() });
  assert.equal(assigned.taxonomyChanged, true); assert.equal(assigned.taxonomy.categoryName, "Legal"); assert.equal(assigned.taxonomy.departmentName, "Compliance");

  const assignedPolicy = policy(1, base.rules, { classificationId: currentClassificationId.toString(), categoryId: categoryId.toString(), departmentId: departmentId.toString() });
  const cleared = await serviceWithState(assignedPolicy, currentClassificationId).preview(documentId.toString(), previewInput(assignedPolicy, {
    classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null,
  }), { tenantId: tenantId.toString(), actorId: ownerId.toString() });
  assert.equal(cleared.taxonomyChanged, true); assert.equal(cleared.taxonomy.categoryId, null); assert.equal(cleared.taxonomy.departmentId, null);
});

test("unchanged taxonomy and rules apply as no-op without creating a policy version", async () => {
  await classification(currentClassificationId, "Restricted", "restricted");
  const current = ownerPolicy(); const service = serviceWithState(current, currentClassificationId);
  const taxonomy = { classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null };
  const draft = draftFor(current);
  const preview = await service.preview(documentId.toString(), { expectedPolicyId: policyId.toString(), expectedPolicyVersion: 1, taxonomy, draft },
    { tenantId: tenantId.toString(), actorId: ownerId.toString() });
  assert.equal(preview.taxonomyChanged, false); assert.equal(preview.impact.direction, "no_change");
  const applied = await service.apply(documentId.toString(), { previewToken: preview.previewToken, taxonomy, draft }, "taxonomy-no-op",
    { tenantId: tenantId.toString(), actorId: ownerId.toString() });
  assert.equal(applied.status, "no_change"); assert.equal(applied.policyVersion, 1);
});

test("archived taxonomy assignments are rejected", async () => {
  await Promise.all([
    classification(currentClassificationId, "Restricted", "restricted"),
    DocumentCategoryModel.create({ _id: categoryId, tenantId, name: "Archived", normalizedName: "archived", status: "archived", createdBy: ownerId, updatedBy: ownerId }),
  ]);
  const current = ownerPolicy();
  await assert.rejects(
    serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, {
      classificationId: currentClassificationId.toString(), categoryId: categoryId.toString(), departmentId: null,
    }), { tenantId: tenantId.toString(), actorId: ownerId.toString() }),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_POLICY_REFERENCE_INVALID",
  );
});

test("non-owner actor must not modify the owner rule", async () => {
  await classification(currentClassificationId, "Internal", "restricted");
  const current = ownerPolicy();
  const draft = {
    rules: [{ ruleId: "owner-access", effect: "deny" as const, subject: { type: "owner" as const }, actions: ["discover", "read", "download"] as const }],
  };
  await assert.rejects(
    serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, { classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null }, draft), { tenantId: tenantId.toString(), actorId: mahmoudId.toString() }),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_POLICY_OWNER_RULE_PROTECTED",
  );
});

test("non-owner actor must not remove the owner rule", async () => {
  await classification(currentClassificationId, "Internal", "restricted");
  const current = ownerPolicy();
  const draft = { rules: [] as DocumentAccessPolicy["rules"] };
  await assert.rejects(
    serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, { classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null }, draft), { tenantId: tenantId.toString(), actorId: mahmoudId.toString() }),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_POLICY_OWNER_RULE_PROTECTED",
  );
});

test("owner may modify the owner rule freely", async () => {
  await classification(currentClassificationId, "Internal", "restricted");
  const current = ownerPolicy();
  const draft = {
    rules: [{ ruleId: "owner-access", effect: "allow" as const, subject: { type: "owner" as const }, actions: ["discover", "read", "download", "manage_access"] as const }],
  };
  const preview = await serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, { classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null }, draft), { tenantId: tenantId.toString(), actorId: ownerId.toString() });
  assert.equal(preview.impact.direction, "broadening");
});

test("owner rule must include minimum actions", async () => {
  await classification(currentClassificationId, "Internal", "restricted");
  const current = ownerPolicy();
  const draft = {
    rules: [{ ruleId: "owner-access", effect: "allow" as const, subject: { type: "owner" as const }, actions: ["read"] as const }],
  };
  await assert.rejects(
    serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, { classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null }, draft), { tenantId: tenantId.toString(), actorId: ownerId.toString() }),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_POLICY_OWNER_RULE_INVALID",
  );
});

test("only one owner rule is permitted", async () => {
  await classification(currentClassificationId, "Internal", "restricted");
  const current = ownerPolicy();
  const draft = {
    rules: [
      { ruleId: "owner-1", effect: "allow" as const, subject: { type: "owner" as const }, actions: ["discover", "read", "download"] as const },
      { ruleId: "owner-2", effect: "deny" as const, subject: { type: "owner" as const }, actions: ["manage_access"] as const },
    ],
  } as { rules: DocumentAccessPolicy["rules"] };
  await assert.rejects(
    serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, { classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null }, draft), { tenantId: tenantId.toString(), actorId: ownerId.toString() }),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_POLICY_OWNER_RULE_INVALID",
  );
});

test("the original owner rule cannot be replaced by a new owner rule", async () => {
  await classification(currentClassificationId, "Internal", "restricted");
  const current = ownerPolicy();
  const draft = { rules: [{ ...current.rules[0]!, ruleId: "replacement-owner" }] } as { rules: DocumentAccessPolicy["rules"] };
  await assert.rejects(
    serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, undefined, draft), { tenantId: tenantId.toString(), actorId: ownerId.toString() }),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_POLICY_OWNER_RULE_PROTECTED",
  );
});

test("delegated non-owner manager cannot change taxonomy", async () => {
  await classification(currentClassificationId, "Internal", "restricted");
  const newCls = await DocumentClassificationModel.create({ tenantId, name: "New", normalizedName: "new", level: "confidential" as const, status: "active", createdBy: ownerId, updatedBy: ownerId });
  const current = ownerPolicy();
  await assert.rejects(
    serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, { classificationId: newCls._id.toString(), categoryId: null, departmentId: null }), { tenantId: tenantId.toString(), actorId: mahmoudId.toString() }),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_POLICY_TAXONOMY_PROTECTED",
  );
});

test("document owner may change taxonomy", async () => {
  await classification(currentClassificationId, "Internal", "restricted");
  const newCls = await DocumentClassificationModel.create({ tenantId, name: "New", normalizedName: "new", level: "confidential" as const, status: "active", createdBy: ownerId, updatedBy: ownerId });
  const current = ownerPolicy();
  const preview = await serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, { classificationId: newCls._id.toString(), categoryId: null, departmentId: null }), { tenantId: tenantId.toString(), actorId: ownerId.toString() });
  assert.equal(preview.taxonomyChanged, true);
});

test("delegated non-owner manager can edit non-owner rules even with taxonomy protected", async () => {
  await classification(currentClassificationId, "Internal", "restricted");
  const current = ownerPolicy();
  const draft = {
    rules: [...current.rules, { ruleId: "mahmoud-read", effect: "allow" as const, subject: { type: "user" as const, id: mahmoudId.toString() }, actions: ["read"] as const }],
  } as { rules: DocumentAccessPolicy["rules"] };
  const preview = await serviceWithState(current, currentClassificationId).preview(documentId.toString(), previewInput(current, { classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null }, draft), { tenantId: tenantId.toString(), actorId: mahmoudId.toString() });
  assert.equal(preview.taxonomyChanged, false);
  assert.equal(preview.impact.direction, "broadening");
});

async function calculateImpact(current: DocumentAccessPolicy, proposed: DocumentAccessPolicy) {
  const service = serviceWithState(current) as unknown as {
    impact(state: {
      document: { _id: mongoose.Types.ObjectId; tenantId: mongoose.Types.ObjectId };
      resource: DocumentAccessResourceContext;
      policy: DocumentAccessPolicy;
    }, proposedPolicy: DocumentAccessPolicy): Promise<PolicyImpact>;
  };
  return service.impact(state(current), proposed);
}

function serviceWithState(current: DocumentAccessPolicy, documentClassificationId?: mongoose.Types.ObjectId) {
  const service = new DocumentPolicyManagementService();
  Object.defineProperty(service, "managedState", {
    value: async () => state(current, documentClassificationId),
  });
  return service;
}

function state(current: DocumentAccessPolicy, documentClassificationId?: mongoose.Types.ObjectId) {
  return {
    document: { _id: documentId, tenantId, version: 1, classificationId: documentClassificationId },
    resource: {
      tenantId: tenantId.toString(),
      documentId: documentId.toString(),
      ownerId: ownerId.toString(),
      classificationId: documentClassificationId?.toString() ?? null,
      classification: "internal",
      activePolicyId: policyId.toString(),
      activePolicyVersion: current.policyVersion,
    },
    policy: current,
  };
}

function ownerPolicy() {
  return policy(1, [{
    ruleId: "owner-access",
    effect: "allow",
    subject: { type: "owner" },
    actions: ["discover", "read", "download"],
  }]);
}

function policy(version: number, rules: DocumentAccessPolicy["rules"], taxonomy = {
  classificationId: currentClassificationId.toString(), categoryId: null as string | null, departmentId: null as string | null,
}): DocumentAccessPolicy {
  const createdAt = "2020-01-01T00:00:00.000Z";
  return {
    contractVersion: 1,
    tenantId: tenantId.toString(),
    documentId: documentId.toString(),
    policyId: policyId.toString(),
    policyVersion: version,
    status: "active",
    effectiveFrom: createdAt,
    effectiveUntil: null,
    inherits: null,
    rules,
    provenance: { createdBy: ownerId.toString(), createdAt },
    indexMetadata: {
      policyId: policyId.toString(),
      policyVersion: version,
      classificationId: taxonomy.classificationId,
      categoryId: taxonomy.categoryId,
      departmentId: taxonomy.departmentId,
    },
  };
}

function draftFor(current: DocumentAccessPolicy) {
  return { rules: current.rules, inherits: current.inherits ?? null, effectiveFrom: current.effectiveFrom,
    effectiveUntil: current.effectiveUntil ?? null, reason: current.provenance.reason ?? null };
}

function previewInput(current: DocumentAccessPolicy, taxonomy: { classificationId: string; categoryId: string | null; departmentId: string | null } = { classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null }, overrideDraft?: { rules: DocumentAccessPolicy["rules"] }) {
  const draft = overrideDraft ? { ...draftFor(current), ...overrideDraft } : draftFor(current);
  return { expectedPolicyId: policyId.toString(), expectedPolicyVersion: current.policyVersion, taxonomy, draft };
}

function classification(id: mongoose.Types.ObjectId, name: string, level: "restricted" | "confidential") {
  return DocumentClassificationModel.create({ _id: id, tenantId, name, normalizedName: name.toLowerCase(), level,
    status: "active", createdBy: ownerId, updatedBy: ownerId });
}

function user(id: mongoose.Types.ObjectId, name: string, email: string) {
  return {
    _id: id,
    tenantId,
    name,
    email,
    passwordHash: "hash",
    role: "COMPANY_ADMIN" as const,
    status: "active" as const,
    emailVerified: true,
  };
}

test("canonical departmentId-only user receives department grant via effectiveAccess (A)", async () => {
  const securityUserId = new mongoose.Types.ObjectId();
  const securityDeptId = new mongoose.Types.ObjectId();
  await Promise.all([
    DepartmentModel.create({ _id: securityDeptId, tenantId, name: "Security", normalizedName: "security", status: "active", createdBy: ownerId, updatedBy: ownerId }),
    classification(currentClassificationId, "Restricted", "restricted"),
    UserModel.create({
      _id: securityUserId, tenantId, name: "SecurityUser", email: "security@example.com",
      passwordHash: "hash", role: "COMPANY_ADMIN", status: "active", emailVerified: true,
      employeeProfile: { departmentId: securityDeptId },
    }),
  ]);
  const permissions = new InMemoryPermissionEvaluator();
  permissions.addUser(ownerId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  permissions.addUser(securityUserId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  setPermissionEvaluator(permissions);

  const current = policy(1, [
    { ruleId: "owner-access", effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] },
    { ruleId: "security-dept", effect: "allow", subject: { type: "department", id: securityDeptId.toString() }, actions: ["discover", "read", "download", "use_in_ai"] },
  ]);

  const service = serviceWithState(current, currentClassificationId);
  const result = await service.effectiveAccess(documentId.toString(), { userIds: [securityUserId.toString()] }, { tenantId: tenantId.toString(), actorId: ownerId.toString() });

  const securityDecision = result.users.find((u) => u.userId === securityUserId.toString());
  assert.ok(securityDecision, "SecurityUser must appear in effectiveAccess results");
  assert.equal(securityDecision.actions.read, true, "Security department grant must allow read for canonical departmentId-only user");
  assert.equal(securityDecision.actions.use_in_ai, true, "Security department grant must allow use_in_ai for canonical departmentId-only user");
});

test("removing use_in_ai from department allow produces use_in_ai loss (B)", async () => {
  const securityUserId = new mongoose.Types.ObjectId();
  const securityDeptId = new mongoose.Types.ObjectId();
  await Promise.all([
    DepartmentModel.create({ _id: securityDeptId, tenantId, name: "Security", normalizedName: "security", status: "active", createdBy: ownerId, updatedBy: ownerId }),
    classification(currentClassificationId, "Restricted", "restricted"),
    UserModel.create({
      _id: securityUserId, tenantId, name: "SecurityUser", email: "security@example.com",
      passwordHash: "hash", role: "COMPANY_ADMIN", status: "active", emailVerified: true,
      employeeProfile: { departmentId: securityDeptId },
    }),
  ]);
  const permissions = new InMemoryPermissionEvaluator();
  permissions.addUser(ownerId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  permissions.addUser(securityUserId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  setPermissionEvaluator(permissions);

  const current = policy(1, [
    { ruleId: "owner-access", effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] },
    { ruleId: "security-dept", effect: "allow", subject: { type: "department", id: securityDeptId.toString() }, actions: ["discover", "read", "download", "use_in_ai"] },
  ]);
  const proposed = policy(2, [
    { ruleId: "owner-access", effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] },
    { ruleId: "security-dept", effect: "allow", subject: { type: "department", id: securityDeptId.toString() }, actions: ["discover", "read", "download"] },
  ]);

  const impact = await calculateImpact(current, proposed);

  assert.equal(impact.direction, "tightening");
  assert.deepEqual(impact.byAction.use_in_ai, { gained: 0, lost: 1 });
  assert.equal(impact.usersLosingAny >= 1, true, `Expected usersLosingAny >= 1 but got ${impact.usersLosingAny}`);
});

test("explicit user deny over department allow produces expected loss (C)", async () => {
  const securityUserId = new mongoose.Types.ObjectId();
  const securityDeptId = new mongoose.Types.ObjectId();
  await Promise.all([
    DepartmentModel.create({ _id: securityDeptId, tenantId, name: "Security", normalizedName: "security", status: "active", createdBy: ownerId, updatedBy: ownerId }),
    classification(currentClassificationId, "Restricted", "restricted"),
    UserModel.create({
      _id: securityUserId, tenantId, name: "SecurityUser", email: "security@example.com",
      passwordHash: "hash", role: "COMPANY_ADMIN", status: "active", emailVerified: true,
      employeeProfile: { departmentId: securityDeptId },
    }),
  ]);
  const permissions = new InMemoryPermissionEvaluator();
  permissions.addUser(ownerId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  permissions.addUser(securityUserId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  setPermissionEvaluator(permissions);

  const current = policy(1, [
    { ruleId: "owner-access", effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] },
    { ruleId: "security-dept", effect: "allow", subject: { type: "department", id: securityDeptId.toString() }, actions: ["discover", "read", "download", "use_in_ai"] },
  ]);
  const proposed = policy(2, [
    { ruleId: "owner-access", effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] },
    { ruleId: "security-dept", effect: "allow", subject: { type: "department", id: securityDeptId.toString() }, actions: ["discover", "read", "download", "use_in_ai"] },
    { ruleId: "deny-security-user", effect: "deny", subject: { type: "user", id: securityUserId.toString() }, actions: ["use_in_ai"] },
  ]);

  const impact = await calculateImpact(current, proposed);

  assert.equal(impact.direction, "tightening");
  assert.deepEqual(impact.byAction.use_in_ai, { gained: 0, lost: 1 });
  assert.equal(impact.usersLosingAny >= 1, true, `Expected usersLosingAny >= 1 but got ${impact.usersLosingAny}`);
});

test("legacy employeeProfile.department user receives department grant via effectiveAccess (E)", async () => {
  const legacyUserId = new mongoose.Types.ObjectId();
  const securityDeptId = new mongoose.Types.ObjectId();
  await Promise.all([
    DepartmentModel.create({ _id: securityDeptId, tenantId, name: "Security", normalizedName: "security", status: "active", createdBy: ownerId, updatedBy: ownerId }),
    classification(currentClassificationId, "Restricted", "restricted"),
    UserModel.create({
      _id: legacyUserId, tenantId, name: "LegacyUser", email: "legacy@example.com",
      passwordHash: "hash", role: "COMPANY_ADMIN", status: "active", emailVerified: true,
      employeeProfile: { department: "Security" },
    }),
  ]);
  const permissions = new InMemoryPermissionEvaluator();
  permissions.addUser(ownerId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  permissions.addUser(legacyUserId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  setPermissionEvaluator(permissions);

  const current = policy(1, [
    { ruleId: "owner-access", effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] },
    { ruleId: "security-dept", effect: "allow", subject: { type: "department", id: securityDeptId.toString() }, actions: ["discover", "read", "download", "use_in_ai"] },
  ]);

  const service = serviceWithState(current, currentClassificationId);
  const result = await service.effectiveAccess(documentId.toString(), { userIds: [legacyUserId.toString()] }, { tenantId: tenantId.toString(), actorId: ownerId.toString() });

  const legacyDecision = result.users.find((u) => u.userId === legacyUserId.toString());
  assert.ok(legacyDecision, "LegacyUser must appear in effectiveAccess results");
  assert.equal(legacyDecision.actions.read, true, "Legacy department string must resolve and allow read");
  assert.equal(legacyDecision.actions.use_in_ai, true, "Legacy department string must resolve and allow use_in_ai");
});

test("policyEvaluationResource applies proposed policy departmentId to resource for capability scope matching (D)", async () => {
  const employeeUserId = new mongoose.Types.ObjectId();
  const securityDeptId = new mongoose.Types.ObjectId();
  const customRoleId = new mongoose.Types.ObjectId();
  await Promise.all([
    DepartmentModel.create({ _id: securityDeptId, tenantId, name: "Security", normalizedName: "security", status: "active", createdBy: ownerId, updatedBy: ownerId }),
    classification(currentClassificationId, "Restricted", "restricted"),
    UserModel.create({
      _id: employeeUserId, tenantId, name: "EmployeeUser", email: "employee@example.com",
      passwordHash: "hash", role: "EMPLOYEE", status: "active", emailVerified: true,
      employeeProfile: { departmentId: securityDeptId },
      customRoleId,
    }),
  ]);
  const permissions = new InMemoryPermissionEvaluator();
  permissions.addUser(ownerId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  permissions.addUser(employeeUserId.toString(), tenantId.toString(), "EMPLOYEE", customRoleId.toString());
  permissions.addRole(customRoleId.toString(), tenantId.toString(), "EMPLOYEE", [
    { permission: "documents:read", scopes: { departmentIds: [securityDeptId.toString()] } },
  ]);
  setPermissionEvaluator(permissions);

  const tenantMemberRead = { ruleId: "tenant-read", effect: "allow" as const, subject: { type: "tenant_member" as const }, actions: ["read" as const] };

  const currentPolicy = policy(1, [tenantMemberRead], {
    classificationId: currentClassificationId.toString(), categoryId: null, departmentId: null,
  });

  const proposedPolicy = policy(2, [tenantMemberRead], {
    classificationId: currentClassificationId.toString(), categoryId: null, departmentId: securityDeptId.toString(),
  });

  const currentState = state(currentPolicy, currentClassificationId);
  const service = serviceWithState(currentPolicy, currentClassificationId);
  const impact = await service.impact(currentState, proposedPolicy);

  assert.deepEqual(impact.byAction.read, { gained: 1, lost: 0 },
    "read must be gained solely because policyEvaluationResource applies proposed departmentId to resource, enabling the department-scoped capability scope match");
  assert.equal(impact.usersGainingAny, 1,
    "Exactly one user must gain read when proposed policy departmentId satisfies the custom role's department scope");
});

test("EMPLOYEE with custom role and canonical departmentId-only assignment is recognized (F)", async () => {
  const employeeUserId = new mongoose.Types.ObjectId();
  const securityDeptId = new mongoose.Types.ObjectId();
  const customRoleId = new mongoose.Types.ObjectId();
  await Promise.all([
    DepartmentModel.create({ _id: securityDeptId, tenantId, name: "Security", normalizedName: "security", status: "active", createdBy: ownerId, updatedBy: ownerId }),
    classification(currentClassificationId, "Restricted", "restricted"),
    UserModel.create({
      _id: employeeUserId, tenantId, name: "EmployeeUser", email: "employee@example.com",
      passwordHash: "hash", role: "EMPLOYEE", status: "active", emailVerified: true,
      employeeProfile: { departmentId: securityDeptId },
      customRoleId,
    }),
  ]);
  const permissions = new InMemoryPermissionEvaluator();
  permissions.addUser(ownerId.toString(), tenantId.toString(), "COMPANY_ADMIN");
  permissions.addUser(employeeUserId.toString(), tenantId.toString(), "EMPLOYEE", customRoleId.toString());
  permissions.addRole(customRoleId.toString(), tenantId.toString(), "EMPLOYEE", [
    { permission: "documents:read", scopes: { departmentIds: [securityDeptId.toString()] } },
    { permission: "documents:use-in-ai", scopes: { departmentIds: [securityDeptId.toString()] } },
  ]);
  setPermissionEvaluator(permissions);

  const current = policy(1, [
    { ruleId: "security-dept-read", effect: "allow", subject: { type: "department", id: securityDeptId.toString() }, actions: ["read"] },
    { ruleId: "security-dept-use-ai", effect: "allow", subject: { type: "department", id: securityDeptId.toString() }, actions: ["use_in_ai"] },
  ]);

  const st = state(current, currentClassificationId);
  st.resource.departmentId = securityDeptId.toString();
  const service = new DocumentPolicyManagementService();
  Object.defineProperty(service, "managedState", { value: async () => st });
  const result = await service.effectiveAccess(documentId.toString(), { userIds: [employeeUserId.toString()] }, { tenantId: tenantId.toString(), actorId: ownerId.toString() });

  const empDecision = result.users.find((u) => u.userId === employeeUserId.toString());
  assert.ok(empDecision, "Employee must appear in effectiveAccess results");
  assert.equal(empDecision.actions.read, true,
    "Canonical departmentId must be resolved so the department ACL rule matches, AND the department-scoped custom-role capability must match the Security document");
  assert.equal(empDecision.actions.use_in_ai, true,
    "Canonical departmentId must be resolved so the department ACL rule matches, AND the department-scoped custom-role capability must match the Security document");
});
