import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { draftFingerprint, normalizePolicyDraft, semanticDraftFingerprint } from "./documentPolicyManagement.draft.js";

const user = "64a000000000000000000001";
function draft() { return { rules: [
  { ruleId: "z-rule", effect: "allow", subject: { type: "user", id: user }, actions: ["read", "discover"] },
  { ruleId: "a-rule", effect: "deny", subject: { type: "tenant_member" }, actions: ["download"] },
], reason: "  controlled change  " }; }

test("normalizes rules, actions, reason, and stable fingerprints deterministically", () => {
  const first = normalizePolicyDraft(draft());
  const reordered = normalizePolicyDraft({ ...draft(), rules: [...draft().rules].reverse().map((rule) => ({ ...rule, actions: [...rule.actions].reverse() })) });
  assert.deepEqual(first.rules.map((rule) => rule.ruleId), ["a-rule", "z-rule"]);
  assert.deepEqual(first.rules[1]?.actions, ["discover", "read"]);
  assert.equal(first.reason, "controlled change");
  assert.equal(draftFingerprint(first), draftFingerprint(reordered));
  assert.equal(semanticDraftFingerprint(first), semanticDraftFingerprint(reordered));
});

test("rejects unsupported and duplicate actions", () => {
  assert.throws(() => normalizePolicyDraft({ rules: [{ ruleId: "x", effect: "allow", subject: { type: "owner" }, actions: ["read", "read"] }] }), AppError);
  assert.throws(() => normalizePolicyDraft({ rules: [{ ruleId: "x", effect: "allow", subject: { type: "owner" }, actions: ["share"] }] }), AppError);
});

test("rejects duplicate rule IDs and semantic duplicates", () => {
  const rule = { ruleId: "x", effect: "allow", subject: { type: "owner" }, actions: ["read"] };
  assert.throws(() => normalizePolicyDraft({ rules: [rule, { ...rule }] }), AppError);
  assert.throws(() => normalizePolicyDraft({ rules: [rule, { ...rule, ruleId: "y" }] }), AppError);
});

test("rejects invalid intervals and client-authoritative fields", () => {
  assert.throws(() => normalizePolicyDraft({ rules: [], effectiveFrom: "2026-02-02T00:00:00Z", effectiveUntil: "2026-01-01T00:00:00Z" }), AppError);
  assert.throws(() => normalizePolicyDraft({ rules: [], tenantId: user }), AppError);
  assert.throws(() => normalizePolicyDraft({ rules: [], indexMetadata: {} }), AppError);
});

test("rejects unknown draft, rule, subject, and inheritance fields", () => {
  assert.throws(() => normalizePolicyDraft({ rules: [], unexpected: true }), AppError);
  assert.throws(() => normalizePolicyDraft({ rules: [{ ruleId: "x", effect: "allow", subject: { type: "owner" }, actions: ["read"], tenantId: user }] }), AppError);
  assert.throws(() => normalizePolicyDraft({ rules: [{ ruleId: "x", effect: "allow", subject: { type: "owner", role: "admin" }, actions: ["read"] }] }), AppError);
  assert.throws(() => normalizePolicyDraft({ rules: [], inherits: { policyId: user, policyVersion: 1, documentId: user } }), AppError);
});

test("enforces the 200-rule bound", () => {
  assert.throws(() => normalizePolicyDraft({ rules: Array.from({ length: 201 }, (_, index) => ({ ruleId: `rule-${index}`, effect: "allow", subject: { type: "owner" }, actions: ["read"] })) }), AppError);
});
