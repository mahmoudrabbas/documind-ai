import assert from "node:assert/strict";
import test from "node:test";
import { Permission, BASE_ROLE_DEFAULTS, getPermissionDefinition } from "../permissions/permissions.catalog.js";
import { InMemoryDocumentCapabilityEvaluator } from "./documentAccess.capability.js";
import { InMemoryDocumentAccessPolicyEvaluator } from "./documentAccess.evaluator.inMemory.js";
import { FIXED_EVALUATION_TIME, DOCUMENT_ACCESS_FIXTURE_IDS, tenantAActor, tenantADocument } from "./documentAccess.fixtures.js";
import { buildDiscoverPolicyPipeline } from "./documentAccess.authorization.service.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";

function policy(effect: "allow" | "deny"): DocumentAccessPolicy { return {
  contractVersion: 1, tenantId: tenantAActor.tenantId, documentId: tenantADocument.documentId,
  policyId: "64a000000000000000000090", policyVersion: 1, status: "active",
  effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveUntil: null, inherits: null,
  rules: [{ ruleId: "actor-rule", effect, subject: { type: "user", id: tenantAActor.actorId }, actions: ["read"] }],
  provenance: { createdBy: tenantAActor.actorId, createdAt: "2026-01-01T00:00:00.000Z" },
  indexMetadata: { policyId: "64a000000000000000000090", policyVersion: 1 },
}; }

test("coarse denial overrides policy allow and policy denial overrides coarse allow", async () => {
  const deniedCapability = new InMemoryDocumentCapabilityEvaluator(false);
  const denied = await new InMemoryDocumentAccessPolicyEvaluator(deniedCapability).evaluate({ actor: tenantAActor, resource: tenantADocument, action: "read", policy: policy("allow"), evaluatedAt: FIXED_EVALUATION_TIME });
  assert.equal(denied.reasonCode, "CAPABILITY_REQUIRED");
  const allowedCapability = new InMemoryDocumentCapabilityEvaluator(true);
  const explicit = await new InMemoryDocumentAccessPolicyEvaluator(allowedCapability).evaluate({ actor: tenantAActor, resource: tenantADocument, action: "read", policy: policy("deny"), evaluatedAt: FIXED_EVALUATION_TIME });
  assert.equal(explicit.reasonCode, "EXPLICIT_DENY");
});

test("canonical permission defaults are distinct and tenant delegable", () => {
  const manage = getPermissionDefinition(Permission.DOCUMENTS_MANAGE_ACCESS);
  const ai = getPermissionDefinition(Permission.DOCUMENTS_USE_IN_AI);
  assert.deepEqual(manage?.defaultBaseRoles, ["SUPER_ADMIN", "COMPANY_ADMIN"]);
  assert.deepEqual(ai?.defaultBaseRoles, ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"]);
  assert.equal(manage?.tenantGrantable, true); assert.equal(ai?.tenantGrantable, true);
  assert.equal(BASE_ROLE_DEFAULTS.EMPLOYEE.includes(Permission.DOCUMENTS_MANAGE_ACCESS), false);
  assert.equal(BASE_ROLE_DEFAULTS.EMPLOYEE.includes(Permission.DOCUMENTS_USE_IN_AI), true);
});

test("discover pipeline joins exact policy before matching and facets remain repository-owned", () => {
  const pipeline = buildDiscoverPolicyPipeline(tenantAActor, null);
  const serialized = JSON.stringify(pipeline);
  assert.ok(serialized.includes("documentaccesspolicies"));
  assert.ok(serialized.includes("activePolicyId"));
  assert.ok(serialized.includes("explicit") === false);
  assert.ok(serialized.includes("deny")); assert.ok(serialized.includes("allow"));
  assert.equal(serialized.includes("$skip"), false);
});

test("discover category scopes resolve active tenant taxonomy before matching", () => {
  const pipeline = buildDiscoverPolicyPipeline(tenantAActor, {
    selfOnly: false,
    departmentIds: [],
    documentCategories: [" Finance "],
    documentClassifications: [],
  });
  const serialized = JSON.stringify(pipeline);
  assert.match(serialized, /documentcategories/);
  assert.match(serialized, /normalizedName/);
  assert.match(serialized, /"\$status","active"/);
  assert.match(serialized, /_categoryScopeName/);
  assert.match(serialized, /finance/);
  assert.equal(serialized.includes("$regexReplace"), false);
});

test("deny-all coarse query produces an impossible match", () => {
  assert.equal(DOCUMENT_ACCESS_FIXTURE_IDS.tenantA, tenantAActor.tenantId);
  const impossible = [{ $match: { _id: { $exists: false } } }];
  assert.deepEqual(impossible, [{ $match: { _id: { $exists: false } } }]);
});

test("use_in_ai evaluates user, role, and department grants with deny precedence", async () => {
  const capability = new InMemoryDocumentCapabilityEvaluator(true);
  const evaluator = new InMemoryDocumentAccessPolicyEvaluator(capability);
  const roleId = tenantAActor.customRoleId!;
  const departmentId = tenantAActor.departmentIds![0]!;
  const base = policy("allow");
  const aiPolicy: DocumentAccessPolicy = { ...base, rules: [
    { ruleId: "user-ai", effect: "allow", subject: { type: "user", id: tenantAActor.actorId }, actions: ["use_in_ai"] },
    { ruleId: "role-ai", effect: "allow", subject: { type: "custom_role", id: roleId }, actions: ["use_in_ai"] },
    { ruleId: "department-ai", effect: "allow", subject: { type: "department", id: departmentId }, actions: ["use_in_ai"] },
  ] };
  const allowed = await evaluator.evaluate({ actor: tenantAActor, resource: tenantADocument, action: "use_in_ai", policy: aiPolicy, evaluatedAt: FIXED_EVALUATION_TIME });
  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.matchedRuleIds, ["department-ai", "role-ai", "user-ai"]);

  const denied = await evaluator.evaluate({ actor: tenantAActor, resource: tenantADocument, action: "use_in_ai", policy: { ...aiPolicy, rules: [...aiPolicy.rules, { ruleId: "deny-user-ai", effect: "deny", subject: { type: "user", id: tenantAActor.actorId }, actions: ["use_in_ai"] }] }, evaluatedAt: FIXED_EVALUATION_TIME });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reasonCode, "EXPLICIT_DENY");
});
