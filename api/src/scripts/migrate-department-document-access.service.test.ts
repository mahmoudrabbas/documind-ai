import assert from "node:assert/strict";
import test from "node:test";
import type { ManagementApplyResult } from "../modules/document-access/documentPolicyManagement.persistence.js";
import type { DocumentAccessPolicy } from "../modules/document-access/documentAccess.types.js";
import {
  buildDepartmentAccessPolicy,
  departmentRuleNeedsMigration,
  runDepartmentAccessMigration,
  type DepartmentAccessMigrationDeps,
  type DepartmentAccessMigrationRecord,
} from "./migrate-department-document-access.service.js";

const tenantId = "64a000000000000000000001";
const documentId = "64a000000000000000000010";
const departmentId = "64a000000000000000000005";

function policy(rules: DocumentAccessPolicy["rules"] = []): DocumentAccessPolicy {
  return {
    contractVersion: 1,
    tenantId,
    documentId,
    policyId: "64a000000000000000000011",
    policyVersion: 1,
    status: "active",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    inherits: null,
    rules,
    provenance: { createdBy: "64a000000000000000000002", createdAt: "2026-01-01T00:00:00.000Z" },
    indexMetadata: { policyId: "64a000000000000000000011", policyVersion: 1, classificationId: "64a000000000000000000012", categoryId: null, departmentId },
  };
}

const ownerRule = { ruleId: "owner", effect: "allow" as const, subject: { type: "owner" as const }, actions: ["read" as const] };

test("department policy upgrade appends the four approved actions and preserves existing rules", () => {
  const next = buildDepartmentAccessPolicy(policy([ownerRule]), departmentId);
  assert.equal(next.policyVersion, 2);
  assert.deepEqual(next.rules.find((rule) => rule.ruleId === `default-department-${departmentId}`), {
    ruleId: `default-department-${departmentId}`,
    effect: "allow",
    subject: { type: "department", id: departmentId },
    actions: ["discover", "read", "download", "use_in_ai"],
  });
  assert.deepEqual(next.rules.find((rule) => rule.subject.type === "owner"), ownerRule);
});

test("existing complete department rule is idempotent", () => {
  const complete = { ruleId: `default-department-${departmentId}`, effect: "allow" as const, subject: { type: "department" as const, id: departmentId }, actions: ["discover", "read", "download", "use_in_ai"] as const };
  assert.equal(departmentRuleNeedsMigration(policy([complete]), departmentId), false);
});

test("dry-run is tenant-scoped and never calls the apply dependency", async () => {
  const otherTenant = "64b000000000000000000001";
  const records: DepartmentAccessMigrationRecord[] = [
    { documentId, tenantId, documentVersion: 1, activePolicyId: policy().policyId, activePolicyVersion: 1, departmentId },
    { documentId: "64a000000000000000000099", tenantId: otherTenant, documentVersion: 1, activePolicyId: policy().policyId, activePolicyVersion: 1, departmentId },
  ];
  let applied = 0;
  const scannedTenants: string[] = [];
  const deps: DepartmentAccessMigrationDeps = {
    scan: async (requestedTenant) => { scannedTenants.push(requestedTenant); return records.filter((record) => record.tenantId === requestedTenant); },
    findPolicy: async () => policy([ownerRule]),
    resolveTaxonomy: async () => ({ classificationId: "64a000000000000000000012", classificationName: "Internal", classificationLevel: "internal", categoryId: null, categoryName: null, departmentId, departmentName: "Operations" }),
    apply: async () => { applied += 1; return { outcome: "applied", policyId: policy().policyId, policyVersion: 2, propagationEventId: "event" } satisfies ManagementApplyResult; },
    dispatch: async () => undefined,
    audit: async () => undefined,
  };
  const report = await runDepartmentAccessMigration({ apply: false, tenantId, batchSize: 10, limit: 10 }, deps);
  assert.equal(report.counts.would_migrate, 1);
  assert.equal(applied, 0);
  assert.deepEqual(scannedTenants, [tenantId]);
});
