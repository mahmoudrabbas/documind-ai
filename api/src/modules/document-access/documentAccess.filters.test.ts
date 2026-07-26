import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDocumentAccessQueryFilter,
  createDocumentRetrievalAccessFilter,
} from "./documentAccess.filters.js";
import { DOCUMENT_ACCESS_FIXTURE_IDS } from "./documentAccess.fixtures.js";

const ids = DOCUMENT_ACCESS_FIXTURE_IDS;
const unorderedConstraints = {
  allowedDocumentIds: [ids.documentA, "doc-1", ids.documentA],
  deniedDocumentIds: ["doc-9", "doc-8"],
  allowedOwnerIds: [ids.actorA],
  allowedCategoryIds: [ids.categoryA],
  allowedDepartmentIds: [ids.departmentA],
  allowedClassifications: ["Restricted", "internal", "restricted"],
  policyVersions: [
    { policyId: "policy-z", minimumVersion: 2, currentVersion: 3 },
    { policyId: "policy-a", minimumVersion: 1 },
  ],
} as const;

test("query filter is deterministic, serializable, versioned, and fail closed", () => {
  const first = createDocumentAccessQueryFilter({
    tenantId: ids.tenantA,
    actorId: ids.actorA,
    action: "discover",
    mode: "constrained",
    constraints: unorderedConstraints,
  });
  const second = createDocumentAccessQueryFilter({
    tenantId: ids.tenantA,
    actorId: ids.actorA,
    action: "discover",
    mode: "constrained",
    constraints: {
      ...unorderedConstraints,
      allowedDocumentIds: [...unorderedConstraints.allowedDocumentIds].reverse(),
      allowedClassifications: [...unorderedConstraints.allowedClassifications].reverse(),
      policyVersions: [...unorderedConstraints.policyVersions].reverse(),
    },
  });

  assert.deepEqual(first, second);
  assert.equal(first.contractVersion, 1);
  assert.equal(first.failClosed, true);
  assert.doesNotThrow(() => JSON.stringify(first));
});

test("retrieval filter fixes use_in_ai and requires current-policy revalidation", () => {
  const filter = createDocumentRetrievalAccessFilter({
    tenantId: ids.tenantA,
    actorId: ids.actorA,
    mode: "constrained",
    constraints: unorderedConstraints,
  });

  assert.equal(filter.schemaVersion, 1);
  assert.equal(filter.action, "use_in_ai");
  assert.equal(filter.failClosed, true);
  assert.equal(filter.requiresCurrentPolicyRevalidation, true);
  assert.deepEqual(filter.allowedClassifications, ["internal", "restricted"]);
  assert.doesNotThrow(() => JSON.stringify(filter));
});

test("empty deny_all filters cannot be interpreted as unrestricted access", () => {
  const query = createDocumentAccessQueryFilter({
    tenantId: ids.tenantA,
    actorId: ids.actorA,
    action: "discover",
    mode: "deny_all",
  });
  const retrieval = createDocumentRetrievalAccessFilter({
    tenantId: ids.tenantA,
    actorId: ids.actorA,
    mode: "deny_all",
  });

  assert.equal(query.mode, "deny_all");
  assert.equal(retrieval.mode, "deny_all");
  assert.deepEqual(query.allowedDocumentIds, []);
  assert.deepEqual(retrieval.allowedDocumentIds, []);
});
