import assert from "node:assert/strict";
import { test } from "node:test";
import type { DocumentCapabilityEvaluator } from "./documentAccess.capability.js";
import type { DocumentAccessPolicyEvaluator } from "./documentAccess.evaluator.js";
import {
  DOCUMENT_ACCESS_FIXTURE_IDS,
  FIXED_EVALUATION_TIME,
  allowDenyConflictPolicy,
  departmentAllowPolicy,
  effectiveFromBoundaryPolicy,
  effectiveUntilBoundaryPolicy,
  employeeNoGrantPolicy,
  expiredPolicy,
  futurePolicy,
  inactivePolicy,
  inheritedAllowPolicy,
  inheritedAllowWithDocumentDenyPolicy,
  malformedPolicyFixture,
  ownerAllowPolicy,
  readOnlyPolicy,
  roleAllowDenyConflictPolicy,
  roleAllowPolicy,
  tenantAActor,
  tenantADocument,
  tenantBDocument,
  tenantMemberAllowPolicy,
  unsupportedActionFixture,
  userAllowPolicy,
} from "./documentAccess.fixtures.js";
import type {
  DocumentAccessAction,
} from "./documentAccess.actions.js";
import type {
  DocumentAccessEvaluationInput,
  DocumentAccessPolicy,
} from "./documentAccess.types.js";

export interface DocumentAccessEvaluatorContractHarness {
  evaluator: DocumentAccessPolicyEvaluator;
  capabilities: DocumentCapabilityEvaluator & {
    set(actorId: string, tenantId: string, action: DocumentAccessAction, allowed: boolean): void;
  };
}

export function runDocumentAccessEvaluatorContract(
  label: string,
  createHarness: () => DocumentAccessEvaluatorContractHarness,
): void {
  test(`${label}: tenant mismatch denies`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const decision = await harness.evaluator.evaluate(input({ resource: tenantBDocument }));
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, "TENANT_MISMATCH");
  });

  test(`${label}: coarse capability denial cannot be bypassed`, async () => {
    const harness = createHarness();
    harness.capabilities.set(ids.actorA, ids.tenantA, "read", false);
    const decision = await harness.evaluator.evaluate(input());
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, "CAPABILITY_REQUIRED");
  });

  test(`${label}: explicit user grant allows only its action`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const read = await harness.evaluator.evaluate(input());
    allow(harness, "download");
    const download = await harness.evaluator.evaluate(input({ action: "download" }));
    assert.equal(read.reasonCode, "ACCESS_ALLOWED");
    assert.deepEqual(read.matchedRuleIds, ["user-read-allow"]);
    assert.equal(download.reasonCode, "NO_MATCHING_GRANT");
  });

  test(`${label}: role and department grants match independently`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const role = await harness.evaluator.evaluate(input({ policy: roleAllowPolicy }));
    const department = await harness.evaluator.evaluate(
      input({ policy: departmentAllowPolicy }),
    );
    assert.equal(role.reasonCode, "ACCESS_ALLOWED");
    assert.equal(department.reasonCode, "ACCESS_ALLOWED");
  });

  test(`${label}: owner grant matches only the document owner`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const owner = await harness.evaluator.evaluate(
      input({
        policy: ownerAllowPolicy,
        resource: { ...tenantADocument, ownerId: tenantAActor.actorId },
      }),
    );
    const nonOwner = await harness.evaluator.evaluate(
      input({ policy: ownerAllowPolicy }),
    );
    assert.equal(owner.allowed, true);
    assert.equal(owner.reasonCode, "ACCESS_ALLOWED");
    assert.deepEqual(owner.matchedRuleIds, ["owner-read-allow"]);
    assert.equal(nonOwner.allowed, false);
    assert.equal(nonOwner.reasonCode, "NO_MATCHING_GRANT");
  });

  test(`${label}: tenant_member grant allows only a same-tenant actor`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const sameTenant = await harness.evaluator.evaluate(
      input({ policy: tenantMemberAllowPolicy }),
    );
    const crossTenant = await harness.evaluator.evaluate(
      input({ policy: tenantMemberAllowPolicy, resource: tenantBDocument }),
    );
    assert.equal(sameTenant.allowed, true);
    assert.equal(sameTenant.reasonCode, "ACCESS_ALLOWED");
    assert.deepEqual(sameTenant.matchedRuleIds, ["tenant-member-read-allow"]);
    assert.equal(crossTenant.allowed, false);
    assert.equal(crossTenant.reasonCode, "TENANT_MISMATCH");
  });

  test(`${label}: role and department grants require their subject context`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const missingRole = await harness.evaluator.evaluate(
      input({
        policy: roleAllowPolicy,
        actor: { ...tenantAActor, customRoleId: null },
      }),
    );
    const missingDepartment = await harness.evaluator.evaluate(
      input({
        policy: departmentAllowPolicy,
        actor: { ...tenantAActor, departmentIds: [] },
      }),
    );
    assert.equal(missingRole.reasonCode, "NO_MATCHING_GRANT");
    assert.equal(missingDepartment.reasonCode, "NO_MATCHING_GRANT");
  });

  test(`${label}: explicit deny overrides user and role allows`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const user = await harness.evaluator.evaluate(
      input({ policy: allowDenyConflictPolicy }),
    );
    const role = await harness.evaluator.evaluate(
      input({ policy: roleAllowDenyConflictPolicy }),
    );
    assert.equal(user.reasonCode, "EXPLICIT_DENY");
    assert.deepEqual(user.matchedRuleIds, ["user-read-deny"]);
    assert.equal(role.reasonCode, "EXPLICIT_DENY");
    assert.deepEqual(role.matchedRuleIds, ["role-read-deny"]);
  });

  test(`${label}: document deny overrides inherited allow`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const decision = await harness.evaluator.evaluate(
      input({
        policy: inheritedAllowWithDocumentDenyPolicy,
        inheritedPolicy: inheritedAllowPolicy,
      }),
    );
    assert.equal(decision.reasonCode, "EXPLICIT_DENY");
    assert.deepEqual(decision.matchedRuleIds, ["user-read-deny"]);
  });

  test(`${label}: read does not imply download or use_in_ai`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    allow(harness, "download");
    allow(harness, "use_in_ai");
    const read = await harness.evaluator.evaluate(input({ policy: readOnlyPolicy }));
    const download = await harness.evaluator.evaluate(
      input({ policy: readOnlyPolicy, action: "download" }),
    );
    const useInAi = await harness.evaluator.evaluate(
      input({ policy: readOnlyPolicy, action: "use_in_ai" }),
    );
    assert.equal(read.reasonCode, "ACCESS_ALLOWED");
    assert.equal(download.reasonCode, "NO_MATCHING_GRANT");
    assert.equal(useInAi.reasonCode, "NO_MATCHING_GRANT");
  });

  test(`${label}: no matching grant defaults to deny`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const decision = await harness.evaluator.evaluate(
      input({ policy: employeeNoGrantPolicy }),
    );
    assert.equal(decision.reasonCode, "NO_MATCHING_GRANT");
  });

  test(`${label}: inactive, future, and expired policies deny`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    assert.equal(
      (await harness.evaluator.evaluate(input({ policy: inactivePolicy }))).reasonCode,
      "POLICY_INACTIVE",
    );
    assert.equal(
      (await harness.evaluator.evaluate(input({ policy: futurePolicy }))).reasonCode,
      "POLICY_NOT_EFFECTIVE",
    );
    assert.equal(
      (await harness.evaluator.evaluate(input({ policy: expiredPolicy }))).reasonCode,
      "POLICY_EXPIRED",
    );
  });

  test(`${label}: effective-time boundaries use an inclusive start and exclusive end`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const atStart = await harness.evaluator.evaluate(
      input({ policy: effectiveFromBoundaryPolicy }),
    );
    const atEnd = await harness.evaluator.evaluate(
      input({ policy: effectiveUntilBoundaryPolicy }),
    );
    assert.equal(atStart.allowed, true);
    assert.equal(atStart.reasonCode, "ACCESS_ALLOWED");
    assert.equal(atEnd.allowed, false);
    assert.equal(atEnd.reasonCode, "POLICY_EXPIRED");
  });

  test(`${label}: rule array ordering cannot change the decision`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const reversed: DocumentAccessPolicy = {
      ...allowDenyConflictPolicy,
      rules: [...allowDenyConflictPolicy.rules].reverse(),
    };
    const first = await harness.evaluator.evaluate(
      input({ policy: allowDenyConflictPolicy }),
    );
    const second = await harness.evaluator.evaluate(input({ policy: reversed }));
    assert.deepEqual(first, second);
  });

  test(`${label}: unsupported action and malformed policy fail closed`, async () => {
    const harness = createHarness();
    const unsupported = await harness.evaluator.evaluate(
      input({ action: unsupportedActionFixture as DocumentAccessAction }),
    );
    const malformed = await harness.evaluator.evaluate(
      input({ policy: malformedPolicyFixture as DocumentAccessPolicy }),
    );
    assert.equal(unsupported.reasonCode, "ACTION_NOT_SUPPORTED");
    assert.equal(malformed.reasonCode, "INVALID_POLICY");
  });

  test(`${label}: invalid context, missing policy, and stale policy deny stably`, async () => {
    const harness = createHarness();
    allow(harness, "read");
    const invalid = await harness.evaluator.evaluate(
      input({ actor: { ...tenantAActor, actorId: "" } }),
    );
    const missing = await harness.evaluator.evaluate(input({ policy: null }));
    const stale = await harness.evaluator.evaluate(
      input({
        resource: {
          ...tenantADocument,
          activePolicyId: userAllowPolicy.policyId,
          activePolicyVersion: userAllowPolicy.policyVersion + 1,
        },
      }),
    );
    assert.equal(invalid.reasonCode, "INVALID_CONTEXT");
    assert.equal(missing.reasonCode, "POLICY_MISSING");
    assert.equal(stale.reasonCode, "STALE_POLICY_CONTEXT");
    assert.equal(stale.evaluationContractVersion, 1);
  });
}

const ids = DOCUMENT_ACCESS_FIXTURE_IDS;

function allow(
  harness: DocumentAccessEvaluatorContractHarness,
  action: DocumentAccessAction,
): void {
  harness.capabilities.set(ids.actorA, ids.tenantA, action, true);
}

function input(
  overrides: Partial<DocumentAccessEvaluationInput> = {},
): DocumentAccessEvaluationInput {
  return {
    actor: tenantAActor,
    resource: tenantADocument,
    action: "read",
    policy: userAllowPolicy,
    evaluatedAt: FIXED_EVALUATION_TIME,
    ...overrides,
  };
}
