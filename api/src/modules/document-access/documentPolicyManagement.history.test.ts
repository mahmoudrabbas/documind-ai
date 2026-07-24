import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { DocumentPolicyManagementService } from "./documentPolicyManagement.service.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";

const tenantId = "64a000000000000000000001";
const documentId = "64a000000000000000000002";
const actorId = "64a000000000000000000003";
const policyId = "64a000000000000000000004";
const context = { tenantId, actorId };

test("policy history parses HTTP query strings and defaults the limit before repository access", async () => {
  for (const [input, expectedCursor, expectedLimit] of [
    [{ limit: "20" }, null, 20],
    [{}, null, 20],
    [{ cursor: "2" }, 2, 20],
    [{ limit: 20, cursor: 2 }, 2, 20],
  ] as const) {
    const calls: Array<{ cursor: number | null; limit: number }> = [];
    const service = serviceWithHistory(calls);
    await service.history(documentId, input, context);
    assert.deepEqual(calls, [{ cursor: expectedCursor, limit: expectedLimit }]);
  }
});

test("policy history rejects invalid and out-of-bounds query integers", async () => {
  for (const limit of ["0", "-1", "1.5", "20abc", ["20"], "101", "", Number.NaN, Number.POSITIVE_INFINITY, {}, 0, 101]) {
    const calls: Array<{ cursor: number | null; limit: number }> = [];
    await assert.rejects(
      serviceWithHistory(calls).history(documentId, { limit }, context),
      hasCode("DOCUMENT_POLICY_DRAFT_INVALID"),
    );
    assert.equal(calls.length, 0);
  }
  for (const cursor of ["0", "-1", "1.5", "2abc", ["2"], "", Number.NaN, Number.POSITIVE_INFINITY, {}, 0, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      serviceWithHistory([]).history(documentId, { cursor }, context),
      hasCode("DOCUMENT_POLICY_DRAFT_INVALID"),
    );
  }
});

test("policy history remains newest-first and cursor-based", async () => {
  const service = serviceWithHistory([]);
  const first = await service.history(documentId, { limit: "2" }, context);
  assert.deepEqual(first.policies.map((item) => item.policyVersion), [4, 3]);
  assert.equal(first.nextCursor, 3);

  const second = await service.history(documentId, { limit: "2", cursor: "3" }, context);
  assert.deepEqual(second.policies.map((item) => item.policyVersion), [2, 1]);
  assert.equal(second.nextCursor, null);
});

function serviceWithHistory(calls: Array<{ cursor: number | null; limit: number }>) {
  const service = new DocumentPolicyManagementService();
  Object.defineProperty(service, "managedState", {
    value: async () => ({ policy: policy(4) }),
  });
  Object.defineProperty(service, "policies", {
    value: {
      listFamilyHistory: async (_tenantId: string, _documentId: string, _policyId: string, cursor: number | null, limit: number) => {
        calls.push({ cursor, limit });
        const available = [policy(1), policy(4), policy(2), policy(3)]
          .filter((item) => cursor === null || item.policyVersion < cursor)
          .sort((left, right) => right.policyVersion - left.policyVersion);
        const policies = available.slice(0, limit);
        return { policies, nextCursor: available.length > limit ? policies.at(-1)?.policyVersion ?? null : null };
      },
    },
  });
  return service;
}

function policy(version: number): DocumentAccessPolicy {
  const createdAt = `2026-07-22T10:00:0${version}.000Z`;
  return {
    contractVersion: 1,
    tenantId,
    documentId,
    policyId,
    policyVersion: version,
    status: "active",
    effectiveFrom: createdAt,
    effectiveUntil: null,
    inherits: null,
    rules: [],
    provenance: { createdBy: actorId, createdAt, reason: `Version ${version}` },
    indexMetadata: { policyId, policyVersion: version, classificationId: null, categoryId: null, departmentId: null },
  };
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}
