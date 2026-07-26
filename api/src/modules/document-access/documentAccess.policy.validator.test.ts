import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { createDefaultDocumentAccessPolicy } from "./documentAccess.defaultPolicy.js";
import { normalizeDocumentAccessPolicy } from "./documentAccess.policy.validator.js";

const tenantId = "64a000000000000000000001";
const documentId = "64a000000000000000000002";
const policyId = "64a000000000000000000003";
const actorId = "64a000000000000000000004";
const classificationId = "64a000000000000000000005";

function validPolicy() {
  return {
    contractVersion: 1,
    tenantId,
    documentId,
    policyId,
    policyVersion: 1,
    status: "active",
    effectiveFrom: "2026-07-22T10:00:00.000Z",
    effectiveUntil: "2026-07-23T10:00:00.000Z",
    inherits: null,
    rules: [{
      ruleId: "owner",
      effect: "allow",
      subject: { type: "owner" },
      actions: ["read", "discover", "read"],
    }],
    provenance: { createdBy: actorId, createdAt: "2026-07-22T09:00:00.000Z" },
    indexMetadata: {
      policyId,
      policyVersion: 1,
      classificationId,
      categoryId: null,
      departmentId: null,
    },
  };
}

test("normalizes actions deterministically and accepts a valid v1 policy", () => {
  const policy = normalizeDocumentAccessPolicy(validPolicy());
  assert.deepEqual(policy.rules[0]?.actions, ["discover", "read"]);
});

test("rejects non-positive or unsafe versions and non-v1 contracts", () => {
  for (const policyVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => normalizeDocumentAccessPolicy({ ...validPolicy(), policyVersion }),
      hasCode("DOCUMENT_POLICY_INVALID"),
    );
  }
  assert.throws(
    () => normalizeDocumentAccessPolicy({ ...validPolicy(), contractVersion: 2 }),
    hasCode("DOCUMENT_POLICY_INVALID"),
  );
});

test("rejects invalid effective timestamps and reversed effective windows", () => {
  assert.throws(
    () => normalizeDocumentAccessPolicy({ ...validPolicy(), effectiveFrom: "not-a-date" }),
    hasCode("DOCUMENT_POLICY_INVALID"),
  );
  assert.throws(
    () => normalizeDocumentAccessPolicy({
      ...validPolicy(),
      effectiveUntil: "2026-07-22T09:59:59.000Z",
    }),
    hasCode("DOCUMENT_POLICY_INVALID"),
  );
});

test("rejects duplicate rule IDs, unsupported actions, and malformed subjects", () => {
  const duplicate = validPolicy();
  duplicate.rules.push({ ...duplicate.rules[0]! });
  assert.throws(() => normalizeDocumentAccessPolicy(duplicate), hasCode("DOCUMENT_POLICY_INVALID"));
  assert.throws(
    () => normalizeDocumentAccessPolicy({
      ...validPolicy(),
      rules: [{ ...validPolicy().rules[0], actions: ["execute"] }],
    }),
    hasCode("DOCUMENT_POLICY_INVALID"),
  );
  for (const subject of [{ type: "user" }, { type: "owner", id: actorId }]) {
    assert.throws(
      () => normalizeDocumentAccessPolicy({
        ...validPolicy(),
        rules: [{ ...validPolicy().rules[0], subject }],
      }),
      hasCode("DOCUMENT_POLICY_INVALID"),
    );
  }
});

test("rejects policy/index identity mismatch and direct self-inheritance", () => {
  assert.throws(
    () => normalizeDocumentAccessPolicy({
      ...validPolicy(),
      indexMetadata: { ...validPolicy().indexMetadata, policyVersion: 2 },
    }),
    hasCode("DOCUMENT_POLICY_INVALID"),
  );
  assert.throws(
    () => normalizeDocumentAccessPolicy({
      ...validPolicy(),
      inherits: { policyId, policyVersion: 1 },
    }),
    hasCode("DOCUMENT_POLICY_INVALID"),
  );
});

test("default policy is deterministic, deeply frozen, and owner-only", () => {
  const input = {
    tenantId,
    documentId,
    policyId,
    ownerId: actorId,
    classificationId,
    createdAt: "2026-07-22T10:00:00.000Z",
  };
  const first = createDefaultDocumentAccessPolicy(input);
  const second = createDefaultDocumentAccessPolicy(input);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.rules));
  assert.deepEqual(first.rules, [{
    ruleId: "default-owner-minimum",
    effect: "allow",
    subject: { type: "owner" },
    actions: ["discover", "read", "download"],
  }]);
  assert.equal(first.rules.some((rule) => rule.subject.type === "tenant_member"), false);
  assert.equal(first.rules.some((rule) => rule.actions.includes("use_in_ai")), false);
});

test("default policy fails closed when restricted classification context is missing", () => {
  assert.throws(
    () => createDefaultDocumentAccessPolicy({
      tenantId,
      documentId,
      policyId,
      ownerId: actorId,
      classificationId: "",
      createdAt: "2026-07-22T10:00:00.000Z",
    }),
    hasCode("DOCUMENT_POLICY_INVALID"),
  );
});

function hasCode(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}
