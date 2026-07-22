import assert from "node:assert/strict";
import test from "node:test";
import { delegatedPolicyApprovalRequired, policyManagementAllowed } from "./documentPolicyManagement.authorization.js";

test("Company Admin coarse authority provides control-plane recovery only", () => {
  assert.equal(policyManagementAllowed({ baseRole: "COMPANY_ADMIN", coarseAllowed: true, policyAllowed: false }), true);
  assert.equal(delegatedPolicyApprovalRequired("COMPANY_ADMIN"), false);
});

test("delegated employee requires both coarse and policy manage_access", () => {
  assert.equal(policyManagementAllowed({ baseRole: "EMPLOYEE", coarseAllowed: true, policyAllowed: true }), true);
  assert.equal(policyManagementAllowed({ baseRole: "EMPLOYEE", coarseAllowed: false, policyAllowed: true }), false);
  assert.equal(policyManagementAllowed({ baseRole: "EMPLOYEE", coarseAllowed: true, policyAllowed: false }), false);
  assert.equal(delegatedPolicyApprovalRequired("EMPLOYEE"), true);
});

test("policy allow never overrides coarse denial", () => {
  assert.equal(policyManagementAllowed({ baseRole: "COMPANY_ADMIN", coarseAllowed: false, policyAllowed: true }), false);
  assert.equal(policyManagementAllowed({ baseRole: "SUPER_ADMIN", coarseAllowed: false, policyAllowed: true }), false);
});
