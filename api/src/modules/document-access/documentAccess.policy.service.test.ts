import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { createDocumentPolicyService } from "./documentAccess.policy.service.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";
import type {
  DocumentAccessPolicyRepository,
  DocumentPolicyActivationResult,
  DocumentPolicyDocumentRecord,
  DocumentPolicyPointer,
  DocumentPolicyReferencePort,
  DocumentPolicyWriteResult,
  InitialPolicyWrite,
  NextPolicyWrite,
} from "./documentAccess.persistence.types.js";

type FakeRoleReference = Omit<
  NonNullable<Awaited<ReturnType<DocumentPolicyReferencePort["findRole"]>>>,
  "id"
>;

const tenantA = "64a000000000000000000001";
const tenantB = "64b000000000000000000001";
const documentId = "64a000000000000000000002";
const actorId = "64a000000000000000000003";
const userId = "64a000000000000000000004";
const roleId = "64a000000000000000000005";
const departmentId = "64a000000000000000000006";
const categoryId = "64a000000000000000000007";
const classificationId = "64a000000000000000000008";
const policyId = "64a000000000000000000009";
const context = { tenantId: tenantA, actorId };

test("creates version 1, increments once, retains history, and rejects stale concurrent writes", async () => {
  const fixture = setup();
  const initial = await fixture.service.createInitial(documentId, input(), context);
  assert.equal(initial.policyId, policyId);
  assert.equal(initial.policyVersion, 1);
  assert.deepEqual(fixture.references.document.activePolicy, { policyId, policyVersion: 1 });

  const nextInput = input({ expectedActivePolicy: { policyId, policyVersion: 1 } });
  const attempts = await Promise.allSettled([
    fixture.service.createNext(documentId, nextInput, context),
    fixture.service.createNext(documentId, nextInput, context),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = attempts.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.ok(rejected.reason instanceof AppError);
  assert.equal(rejected.reason.code, "DOCUMENT_POLICY_STALE");
  const history = await fixture.service.listHistory(documentId, {}, context);
  assert.deepEqual(history.policies.map((policy) => policy.policyVersion), [2, 1]);
  assert.deepEqual(history.policies[1], initial);
  assert.equal(fixture.references.document.fileVersion, 7);
  assert.equal(fixture.references.document.versionLabel, "v7");
});

test("hides cross-tenant document and policy reads", async () => {
  const fixture = setup();
  await fixture.service.createInitial(documentId, input(), context);
  await assert.rejects(
    fixture.service.getExact(documentId, policyId, 1, { tenantId: tenantB, actorId }),
    hasCode("DOCUMENT_POLICY_NOT_FOUND"),
  );
  await assert.rejects(
    fixture.service.getActive(documentId, { tenantId: tenantB, actorId }),
    hasCode("DOCUMENT_POLICY_NOT_FOUND"),
  );
});

test("rejects authoritative identity injection and index metadata identity injection", async () => {
  const fixture = setup();
  await assert.rejects(
    fixture.service.createInitial(documentId, { ...input(), tenantId: tenantB }, context),
    hasCode("DOCUMENT_POLICY_INVALID"),
  );
  await assert.rejects(
    fixture.service.createInitial(documentId, {
      ...input(),
      indexMetadata: { classificationId, policyId: "64b000000000000000000009" },
    }, context),
    hasCode("DOCUMENT_POLICY_INVALID"),
  );
});

test("accepts active same-tenant user, role, department, and taxonomy references", async () => {
  const fixture = setup();
  const created = await fixture.service.createInitial(documentId, input({
    rules: [
      rule("user", userId, "user"),
      rule("custom_role", roleId, "role"),
      rule("department", departmentId, "department"),
      rule("owner", undefined, "owner"),
    ],
    indexMetadata: { categoryId, classificationId, departmentId },
  }), context);
  assert.equal(created.rules.length, 4);
});

test("rejects cross-tenant/inactive users and archived/invalid roles and departments", async () => {
  for (const mutate of [
    (refs: FakeReferences) => refs.users.set(userId, { status: "disabled", role: "EMPLOYEE" }),
    (refs: FakeReferences) => refs.users.delete(userId),
  ]) {
    const fixture = setup();
    mutate(fixture.references);
    await assert.rejects(
      fixture.service.createInitial(documentId, input({ rules: [rule("user", userId, "user")] }), context),
      hasCode("DOCUMENT_POLICY_SUBJECT_INVALID"),
    );
  }
  const roleFixture = setup();
  roleFixture.references.roles.set(roleId, { status: "archived", migrationState: "complete" });
  await assert.rejects(
    roleFixture.service.createInitial(documentId, input({ rules: [rule("custom_role", roleId, "role")] }), context),
    hasCode("DOCUMENT_POLICY_SUBJECT_INVALID"),
  );
  const departmentFixture = setup();
  departmentFixture.references.taxonomy.set(`department:${departmentId}`, "archived");
  await assert.rejects(
    departmentFixture.service.createInitial(documentId, input({ rules: [rule("department", departmentId, "dept")] }), context),
    hasCode("DOCUMENT_POLICY_SUBJECT_INVALID"),
  );
});

test("rejects archived or cross-tenant taxonomy metadata", async () => {
  const fixture = setup();
  fixture.references.taxonomy.set(`classification:${classificationId}`, "archived");
  await assert.rejects(
    fixture.service.createInitial(documentId, input(), context),
    hasCode("DOCUMENT_POLICY_TAXONOMY_REFERENCE_INVALID"),
  );
  const missing = setup();
  missing.references.taxonomy.delete(`category:${categoryId}`);
  await assert.rejects(
    missing.service.createInitial(documentId, input({
      indexMetadata: { categoryId, classificationId },
    }), context),
    hasCode("DOCUMENT_POLICY_TAXONOMY_REFERENCE_INVALID"),
  );
});

test("validates inherited snapshots and rejects absent/cross-scope references", async () => {
  const fixture = setup();
  await fixture.service.createInitial(documentId, input(), context);
  const valid = await fixture.service.createNext(documentId, input({
    expectedActivePolicy: { policyId, policyVersion: 1 },
    inherits: { policyId, policyVersion: 1 },
  }), context);
  assert.deepEqual(valid.inherits, { policyId, policyVersion: 1 });

  const invalid = setup();
  await invalid.service.createInitial(documentId, input(), context);
  await assert.rejects(
    invalid.service.createNext(documentId, input({
      expectedActivePolicy: { policyId, policyVersion: 1 },
      inherits: { policyId, policyVersion: 99 },
    }), context),
    hasCode("DOCUMENT_POLICY_INHERITED_REFERENCE_INVALID"),
  );
});

test("mutation requires the explicit guard while read-only authority cannot mutate", async () => {
  const fixture = setup(false);
  await assert.rejects(
    fixture.service.createInitial(documentId, input(), context),
    hasCode("DOCUMENT_POLICY_AUTHORIZATION_REQUIRED"),
  );
  assert.equal(fixture.repository.policies.length, 0);
});

test("returns plain safe DTOs without Mongoose fields", async () => {
  const fixture = setup();
  await fixture.service.createInitial(documentId, input(), context);
  const policy = await fixture.service.getActive(documentId, context);
  assert.equal("_id" in policy, false);
  assert.equal("__v" in policy, false);
  assert.equal(typeof policy.effectiveFrom, "string");
});

function setup(allowMutation = true) {
  const references = new FakeReferences();
  const repository = new FakeRepository(references);
  return {
    references,
    repository,
    service: createDocumentPolicyService({
      references,
      repository,
      authorization: {
        async authorizeRead() {},
        async authorizeMutation() {
          if (!allowMutation) {
            throw new AppError(403, "DOCUMENT_POLICY_AUTHORIZATION_REQUIRED", "Manage access authority required");
          }
        },
      },
      now: () => "2026-07-22T10:00:00.000Z",
      newPolicyId: () => policyId,
    }),
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    rules: [rule("owner", undefined, "owner")],
    indexMetadata: { classificationId },
    reason: "Policy test",
    ...overrides,
  };
}

function rule(type: string, id: string | undefined, ruleId: string) {
  return {
    ruleId,
    effect: "allow",
    subject: { type, ...(id ? { id } : {}) },
    actions: ["read"],
  };
}

class FakeReferences implements DocumentPolicyReferencePort {
  document: DocumentPolicyDocumentRecord = {
    id: documentId,
    tenantId: tenantA,
    ownerId: actorId,
    uploadedBy: actorId,
    activePolicy: null,
    fileVersion: 7,
    versionLabel: "v7",
  };
  users = new Map([[userId, { status: "active", role: "EMPLOYEE" as const }]]);
  roles: Map<string, FakeRoleReference> = new Map([
    [roleId, { status: "active", migrationState: "complete" }],
  ]);
  taxonomy: Map<string, "active" | "archived"> = new Map([
    [`department:${departmentId}`, "active"],
    [`category:${categoryId}`, "active"],
    [`classification:${classificationId}`, "active"],
  ]);

  async findDocument(tenantId: string, id: string) {
    return tenantId === this.document.tenantId && id === this.document.id ? { ...this.document } : null;
  }
  async findUser(tenantId: string, id: string) {
    const user = tenantId === tenantA ? this.users.get(id) : undefined;
    return user ? { id, ...user } : null;
  }
  async findRole(tenantId: string, id: string) {
    const role = tenantId === tenantA ? this.roles.get(id) : undefined;
    return role ? { id, ...role } : null;
  }
  async findTaxonomy(
    tenantId: string,
    kind: "category" | "department" | "classification",
    id: string,
  ) {
    const status = tenantId === tenantA ? this.taxonomy.get(`${kind}:${id}`) : undefined;
    return status ? { id, status } : null;
  }
}

class FakeRepository implements DocumentAccessPolicyRepository {
  policies: DocumentAccessPolicy[] = [];
  constructor(private readonly references: FakeReferences) {}

  async createInitial(
    tenantId: string,
    id: string,
    write: InitialPolicyWrite,
  ): Promise<DocumentPolicyWriteResult> {
    if (tenantId !== tenantA || id !== documentId) return { outcome: "document_not_found" };
    if (this.references.document.activePolicy) return { outcome: "stale" };
    return this.add(write.policy);
  }
  async createNextAndActivate(
    tenantId: string,
    id: string,
    write: NextPolicyWrite,
  ): Promise<DocumentPolicyWriteResult> {
    if (tenantId !== tenantA || id !== documentId) return { outcome: "document_not_found" };
    if (!this.references.document.activePolicy ||
      !same(this.references.document.activePolicy, write.expectedActivePolicy)) {
      return { outcome: "stale" };
    }
    return this.add(write.policy);
  }
  async findExact(tenantId: string, id: string, family: string, version: number) {
    return this.policies.find((policy) => policy.tenantId === tenantId &&
      policy.documentId === id && policy.policyId === family && policy.policyVersion === version) ?? null;
  }
  async findActive(tenantId: string, id: string) {
    const pointer = this.references.document.activePolicy;
    return pointer ? this.findExact(tenantId, id, pointer.policyId, pointer.policyVersion) : null;
  }
  async findLatest(tenantId: string, id: string, family: string) {
    return this.policies.filter((policy) => policy.tenantId === tenantId &&
      policy.documentId === id && policy.policyId === family)
      .sort((left, right) => right.policyVersion - left.policyVersion)[0] ?? null;
  }
  async listHistory(tenantId: string, id: string, cursor: number | null, limit: number) {
    const policies = this.policies.filter((policy) => policy.tenantId === tenantId &&
      policy.documentId === id && (cursor === null || policy.policyVersion < cursor))
      .sort((left, right) => right.policyVersion - left.policyVersion)
      .slice(0, limit);
    return { policies, nextCursor: null };
  }
  async activateExact(): Promise<DocumentPolicyActivationResult> {
    return { outcome: "policy_not_found" };
  }
  private add(policy: DocumentAccessPolicy): DocumentPolicyWriteResult {
    if (this.policies.some((item) => item.tenantId === policy.tenantId &&
      item.documentId === policy.documentId && item.policyId === policy.policyId &&
      item.policyVersion === policy.policyVersion)) return { outcome: "version_conflict" };
    this.policies.push(structuredClone(policy));
    this.references.document.activePolicy = {
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
    };
    return { outcome: "created", policy: structuredClone(policy) };
  }
}

function same(left: DocumentPolicyPointer, right: DocumentPolicyPointer) {
  return left.policyId === right.policyId && left.policyVersion === right.policyVersion;
}
function hasCode(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}
