import { describe, expect, it } from "vitest";
import type { ActivePolicy, PolicyDraft } from "@/types/api/document-policy.types";
import { createEditablePolicyRule, draftFromPolicy, EDITABLE_POLICY_SUBJECT_TYPES, immutableOwnerRuleId, policyRulesInvalid } from "./document-policy-editor";

const ownerId = "owner-rule";
const omarId = "64a000000000000000000001";
const roleId = "64a000000000000000000002";

function active(rules: ActivePolicy["rules"] = [{ ruleId: ownerId, effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] }]): ActivePolicy {
  return { contractVersion: 1, documentId: "document-1", policyId: "policy-1", policyVersion: 1, status: "active", effectiveFrom: "2026-07-28T00:00:00.000Z", rules, provenance: { createdBy: "admin-1", createdAt: "2026-07-28T00:00:00.000Z" }, indexMetadata: { policyId: "policy-1", policyVersion: 1 } };
}

function draftWith(...rules: PolicyDraft["rules"]): PolicyDraft {
  return { ...draftFromPolicy(active()), rules };
}

describe("policy editor rule state", () => {
  it("identifies exactly the persisted Owner rule as immutable", () => {
    const policy = active();
    expect(immutableOwnerRuleId(policy)).toBe(ownerId);
    expect(policy.rules.filter((rule) => rule.subject.type === "owner")).toHaveLength(1);
  });

  it("adds an editable USER rule and never offers Owner as an editable subject", () => {
    const rule = createEditablePolicyRule("new-rule");
    expect(rule).toEqual({ ruleId: "new-rule", effect: "allow", subject: { type: "user" }, actions: ["read"] });
    expect(EDITABLE_POLICY_SUBJECT_TYPES).toEqual(["user", "custom_role", "department", "tenant_member"]);
    expect(EDITABLE_POLICY_SUBJECT_TYPES).not.toContain("owner");
  });

  it("stores Omar's tenant-scoped user ID and accepts the USER rule", () => {
    const draft = draftWith(active().rules[0]!, { ...createEditablePolicyRule("omar-read"), subject: { type: "user", id: omarId } });
    expect(draft.rules[1]?.subject).toEqual({ type: "user", id: omarId });
    expect(policyRulesInvalid(draft, ownerId)).toBe(false);
  });

  it("stores a selected ROLE ID and accepts the custom-role rule", () => {
    const draft = draftWith(active().rules[0]!, { ...createEditablePolicyRule("role-read"), subject: { type: "custom_role", id: roleId } });
    expect(draft.rules[1]?.subject).toEqual({ type: "custom_role", id: roleId });
    expect(policyRulesInvalid(draft, ownerId)).toBe(false);
  });

  it.each(["user", "custom_role", "department"] as const)("rejects %s without subjectId", (type) => {
    const draft = draftWith(active().rules[0]!, { ...createEditablePolicyRule(`${type}-read`), subject: { type } });
    expect(policyRulesInvalid(draft, ownerId)).toBe(true);
  });

  it("rejects a duplicate, removed, or replaced immutable Owner rule", () => {
    const owner = active().rules[0]!;
    expect(policyRulesInvalid(draftWith(owner, { ...owner, ruleId: "second-owner" }), ownerId)).toBe(true);
    expect(policyRulesInvalid(draftWith(createEditablePolicyRule("user-rule")), ownerId)).toBe(true);
    expect(policyRulesInvalid(draftWith({ ...owner, ruleId: "replacement-owner" }), ownerId)).toBe(true);
  });

  it("restores persisted USER and ROLE subject IDs when reopening", () => {
    const policy = active([
      active().rules[0]!,
      { ...createEditablePolicyRule("omar-read"), subject: { type: "user", id: omarId } },
      { ...createEditablePolicyRule("role-read"), subject: { type: "custom_role", id: roleId } },
    ]);
    expect(draftFromPolicy(policy).rules.map((rule) => rule.subject)).toEqual([
      { type: "owner" }, { type: "user", id: omarId }, { type: "custom_role", id: roleId },
    ]);
  });
});
