import type {
  DocumentAccessActorContext,
  DocumentAccessPolicy,
  DocumentAccessPolicyRule,
  DocumentAccessResourceContext,
} from "./documentAccess.types.js";

export const FIXED_EVALUATION_TIME = "2026-07-22T12:00:00.000Z";

export const DOCUMENT_ACCESS_FIXTURE_IDS = Object.freeze({
  tenantA: "64a000000000000000000001",
  tenantB: "64b000000000000000000001",
  actorA: "64a000000000000000000002",
  actorB: "64b000000000000000000002",
  documentA: "64a000000000000000000003",
  documentB: "64b000000000000000000003",
  roleA: "64a000000000000000000004",
  departmentA: "64a000000000000000000005",
  categoryA: "64a000000000000000000006",
});

const ids = DOCUMENT_ACCESS_FIXTURE_IDS;

export const tenantAActor = deepFreeze<DocumentAccessActorContext>({
  tenantId: ids.tenantA,
  actorId: ids.actorA,
  baseRole: "EMPLOYEE",
  customRoleId: ids.roleA,
  departmentIds: [ids.departmentA],
});

export const tenantBActor = deepFreeze<DocumentAccessActorContext>({
  tenantId: ids.tenantB,
  actorId: ids.actorB,
  baseRole: "EMPLOYEE",
  departmentIds: [],
});

export const tenantADocument = deepFreeze<DocumentAccessResourceContext>({
  tenantId: ids.tenantA,
  documentId: ids.documentA,
  ownerId: "64a000000000000000000099",
  categoryId: ids.categoryA,
  departmentId: ids.departmentA,
  classification: "internal",
  lifecycleStatus: "processed",
  legacyCategory: "policies",
  legacyDepartment: "operations",
});

export const tenantBDocument = deepFreeze<DocumentAccessResourceContext>({
  tenantId: ids.tenantB,
  documentId: ids.documentB,
  ownerId: ids.actorB,
  classification: "restricted",
  lifecycleStatus: "processed",
});

const userReadAllow = rule("user-read-allow", "allow", "user", ids.actorA, ["read"]);
const userReadDeny = rule("user-read-deny", "deny", "user", ids.actorA, ["read"]);
const roleReadAllow = rule("role-read-allow", "allow", "custom_role", ids.roleA, ["read"]);
const roleReadDeny = rule("role-read-deny", "deny", "custom_role", ids.roleA, ["read"]);
const departmentReadAllow = rule(
  "department-read-allow",
  "allow",
  "department",
  ids.departmentA,
  ["read"],
);
const ownerReadAllow = rule("owner-read-allow", "allow", "owner", undefined, ["read"]);
const tenantMemberReadAllow = rule(
  "tenant-member-read-allow",
  "allow",
  "tenant_member",
  undefined,
  ["read"],
);

export const employeeNoGrantPolicy = policy("policy-no-grant", 1, []);
export const userAllowPolicy = policy("policy-user-allow", 1, [userReadAllow]);
export const userDenyPolicy = policy("policy-user-deny", 1, [userReadDeny]);
export const roleAllowPolicy = policy("policy-role-allow", 1, [roleReadAllow]);
export const departmentAllowPolicy = policy("policy-department-allow", 1, [
  departmentReadAllow,
]);
export const ownerAllowPolicy = policy("policy-owner-allow", 1, [ownerReadAllow]);
export const tenantMemberAllowPolicy = policy("policy-tenant-member-allow", 1, [
  tenantMemberReadAllow,
]);
export const allowDenyConflictPolicy = policy("policy-allow-deny", 1, [
  userReadAllow,
  userReadDeny,
]);
export const roleAllowDenyConflictPolicy = policy("policy-role-allow-deny", 1, [
  roleReadAllow,
  roleReadDeny,
]);
export const readOnlyPolicy = policy("policy-read-only", 1, [userReadAllow]);
export const inactivePolicy = policy("policy-inactive", 1, [userReadAllow], {
  status: "inactive",
});
export const futurePolicy = policy("policy-future", 1, [userReadAllow], {
  effectiveFrom: "2026-08-01T00:00:00.000Z",
});
export const expiredPolicy = policy("policy-expired", 1, [userReadAllow], {
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveUntil: "2026-07-01T00:00:00.000Z",
});
export const effectiveFromBoundaryPolicy = policy(
  "policy-effective-from-boundary",
  1,
  [userReadAllow],
  { effectiveFrom: FIXED_EVALUATION_TIME },
);
export const effectiveUntilBoundaryPolicy = policy(
  "policy-effective-until-boundary",
  1,
  [userReadAllow],
  {
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: FIXED_EVALUATION_TIME,
  },
);

export const inheritedAllowPolicy = policy("policy-parent", 3, [userReadAllow]);
export const inheritedAllowWithDocumentDenyPolicy = policy(
  "policy-child",
  4,
  [userReadDeny],
  { inherits: { policyId: inheritedAllowPolicy.policyId, policyVersion: 3 } },
);

export const capabilityDeniedPolicy = userAllowPolicy;

export const malformedPolicyFixture: unknown = deepFreeze({
  ...userAllowPolicy,
  contractVersion: 999,
});

export const unsupportedActionFixture: unknown = "publish";

function rule(
  ruleId: string,
  effect: "allow" | "deny",
  subjectType: "user" | "custom_role" | "department" | "owner" | "tenant_member",
  subjectId: string | undefined,
  actions: DocumentAccessPolicyRule["actions"],
): DocumentAccessPolicyRule {
  return deepFreeze({
    ruleId,
    effect,
    subject: subjectId === undefined
      ? { type: subjectType }
      : { type: subjectType, id: subjectId },
    actions,
  });
}

function policy(
  policyId: string,
  policyVersion: number,
  rules: readonly DocumentAccessPolicyRule[],
  overrides: Partial<
    Pick<
      DocumentAccessPolicy,
      "status" | "effectiveFrom" | "effectiveUntil" | "inherits"
    >
  > = {},
): DocumentAccessPolicy {
  return deepFreeze({
    contractVersion: 1,
    tenantId: ids.tenantA,
    documentId: ids.documentA,
    policyId,
    policyVersion,
    status: overrides.status ?? "active",
    effectiveFrom: overrides.effectiveFrom ?? "2026-01-01T00:00:00.000Z",
    ...(overrides.effectiveUntil === undefined
      ? {}
      : { effectiveUntil: overrides.effectiveUntil }),
    ...(overrides.inherits === undefined ? {} : { inherits: overrides.inherits }),
    rules,
    provenance: {
      createdBy: ids.actorA,
      createdAt: "2026-01-01T00:00:00.000Z",
      reason: "frozen-contract-fixture",
    },
    indexMetadata: {
      policyId,
      policyVersion,
      classificationId: "classification-internal",
      categoryId: ids.categoryA,
      departmentId: ids.departmentA,
    },
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
