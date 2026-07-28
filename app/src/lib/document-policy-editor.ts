import type { ActivePolicy, DocumentAccessAction, PolicyDraft, PolicyRule, PolicySubjectType } from "@/types/api/document-policy.types";

export const EDITABLE_POLICY_SUBJECT_TYPES = ["user", "custom_role", "department", "tenant_member"] as const;
export const IDENTIFIED_POLICY_SUBJECT_TYPES = new Set<PolicySubjectType>(["user", "custom_role", "department"]);
export const OWNER_MINIMUM_ACTIONS = new Set<DocumentAccessAction>(["discover", "read", "download"]);

export function draftFromPolicy(policy: ActivePolicy): PolicyDraft {
  return {
    rules: policy.rules.map((rule) => ({ ...rule, actions: [...rule.actions], subject: { ...rule.subject } })),
    inherits: policy.inherits ?? null,
    effectiveFrom: policy.effectiveFrom,
    effectiveUntil: policy.effectiveUntil ?? null,
    reason: policy.provenance.reason ?? null,
  };
}

export function immutableOwnerRuleId(policy: ActivePolicy): string | null {
  return policy.rules.find((rule) => rule.subject.type === "owner")?.ruleId ?? null;
}

export function createEditablePolicyRule(id: string): PolicyRule {
  return { ruleId: id, effect: "allow", subject: { type: "user" }, actions: ["read"] };
}

export function policyRulesInvalid(draft: PolicyDraft, ownerRuleId: string | null): boolean {
  const ownerRules = draft.rules.filter((rule) => rule.subject.type === "owner");
  if (ownerRules.length !== 1 || ownerRules[0]?.ruleId !== ownerRuleId) return true;
  if ([...OWNER_MINIMUM_ACTIONS].some((action) => !ownerRules[0].actions.includes(action))) return true;

  const semantics = new Set<string>();
  for (const rule of draft.rules) {
    if (!rule.actions.length || new Set(rule.actions).size !== rule.actions.length) return true;
    if (IDENTIFIED_POLICY_SUBJECT_TYPES.has(rule.subject.type) && !rule.subject.id) return true;
    const semantic = JSON.stringify([rule.effect, rule.subject.type, rule.subject.id ?? null, [...rule.actions].sort()]);
    if (semantics.has(semantic)) return true;
    semantics.add(semantic);
  }
  return false;
}
