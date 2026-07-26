import {
  DOCUMENT_ACCESS_CONTRACT_VERSION,
  isDocumentAccessAction,
} from "./documentAccess.actions.js";
import type { DocumentCapabilityEvaluator } from "./documentAccess.capability.js";
import type { DocumentAccessPolicyEvaluator } from "./documentAccess.evaluator.js";
import type {
  DocumentAccessActorContext,
  DocumentAccessDecision,
  DocumentAccessEvaluationInput,
  DocumentAccessPolicy,
  DocumentAccessPolicyRule,
  DocumentAccessReasonCode,
  DocumentAccessResourceContext,
} from "./documentAccess.types.js";

const SUBJECT_TYPES = new Set([
  "user",
  "custom_role",
  "department",
  "owner",
  "tenant_member",
]);

/** Deterministic contract adapter only; it is not production policy persistence. */
export class InMemoryDocumentAccessPolicyEvaluator
  implements DocumentAccessPolicyEvaluator
{
  constructor(private readonly capabilityEvaluator: DocumentCapabilityEvaluator) {}

  async evaluate(input: DocumentAccessEvaluationInput): Promise<DocumentAccessDecision> {
    const rawAction: unknown = input.action;
    const action = typeof rawAction === "string" ? rawAction : "";
    const base = decisionBase(input, action);

    if (
      tenantMismatch(input.actor?.tenantId, input.resource?.tenantId) ||
      tenantMismatch(input.actor?.tenantId, input.policy?.tenantId) ||
      tenantMismatch(input.actor?.tenantId, input.inheritedPolicy?.tenantId)
    ) {
      return deny(base, "TENANT_MISMATCH");
    }

    if (!validContext(input.actor, input.resource, input.evaluatedAt)) {
      return deny(base, "INVALID_CONTEXT");
    }

    if (!isDocumentAccessAction(rawAction)) {
      return deny(base, "ACTION_NOT_SUPPORTED");
    }

    const policy = input.policy;
    if (!policy) return deny(base, "POLICY_MISSING");

    const policyBase = {
      ...base,
      action: rawAction,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
    };

    if (!validPolicy(policy, input.resource)) {
      return deny(policyBase, "INVALID_POLICY");
    }
    if (policy.status !== "active") return deny(policyBase, "POLICY_INACTIVE");

    const evaluatedAt = Date.parse(input.evaluatedAt);
    if (evaluatedAt < Date.parse(policy.effectiveFrom)) {
      return deny(policyBase, "POLICY_NOT_EFFECTIVE");
    }
    if (policy.effectiveUntil && evaluatedAt >= Date.parse(policy.effectiveUntil)) {
      return deny(policyBase, "POLICY_EXPIRED");
    }

    if (
      (input.resource.activePolicyId && input.resource.activePolicyId !== policy.policyId) ||
      (input.resource.activePolicyVersion !== undefined &&
        input.resource.activePolicyVersion !== null &&
        input.resource.activePolicyVersion !== policy.policyVersion)
    ) {
      return deny(policyBase, "STALE_POLICY_CONTEXT");
    }

    let inheritedRules: readonly DocumentAccessPolicyRule[] = [];
    if (policy.inherits) {
      const inherited = input.inheritedPolicy;
      if (
        !inherited ||
        inherited.policyId !== policy.inherits.policyId ||
        inherited.policyVersion !== policy.inherits.policyVersion ||
        !validPolicy(inherited, input.resource) ||
        inherited.status !== "active" ||
        evaluatedAt < Date.parse(inherited.effectiveFrom) ||
        (inherited.effectiveUntil !== undefined &&
          inherited.effectiveUntil !== null &&
          evaluatedAt >= Date.parse(inherited.effectiveUntil))
      ) {
        return deny(policyBase, "INVALID_POLICY");
      }
      inheritedRules = inherited.rules;
    } else if (input.inheritedPolicy) {
      return deny(policyBase, "INVALID_POLICY");
    }

    const capability = await this.capabilityEvaluator.evaluateCapability({
      actor: input.actor,
      resource: input.resource,
      action: rawAction,
    });
    if (!capability.allowed) {
      return deny(
        policyBase,
        capability.reason === "ACTION_UNMAPPED"
          ? "ACTION_NOT_SUPPORTED"
          : "CAPABILITY_REQUIRED",
      );
    }

    const matching = [...policy.rules, ...inheritedRules]
      .filter((rule) => rule.actions.includes(rawAction))
      .filter((rule) => subjectMatches(rule, input.actor, input.resource));
    const deniedBy = normalizedIds(
      matching.filter((rule) => rule.effect === "deny").map((rule) => rule.ruleId),
    );
    if (deniedBy.length > 0) {
      return { ...deny(policyBase, "EXPLICIT_DENY"), matchedRuleIds: deniedBy };
    }

    const allowedBy = normalizedIds(
      matching.filter((rule) => rule.effect === "allow").map((rule) => rule.ruleId),
    );
    if (allowedBy.length === 0) return deny(policyBase, "NO_MATCHING_GRANT");

    return {
      ...policyBase,
      allowed: true,
      reasonCode: "ACCESS_ALLOWED",
      matchedRuleIds: allowedBy,
    };
  }
}

function decisionBase(
  input: DocumentAccessEvaluationInput,
  action: string,
): Omit<DocumentAccessDecision, "allowed" | "reasonCode" | "matchedRuleIds"> {
  return {
    action,
    tenantId: typeof input.actor?.tenantId === "string" ? input.actor.tenantId : "",
    documentId:
      typeof input.resource?.documentId === "string" ? input.resource.documentId : null,
    policyId: input.policy?.policyId ?? null,
    policyVersion: input.policy?.policyVersion ?? null,
    evaluationContractVersion: DOCUMENT_ACCESS_CONTRACT_VERSION,
  };
}

function deny(
  base: Omit<DocumentAccessDecision, "allowed" | "reasonCode" | "matchedRuleIds">,
  reasonCode: Exclude<DocumentAccessReasonCode, "ACCESS_ALLOWED">,
): DocumentAccessDecision {
  return { ...base, allowed: false, reasonCode, matchedRuleIds: [] };
}

function validContext(
  actor: DocumentAccessActorContext | undefined,
  resource: DocumentAccessResourceContext | undefined,
  evaluatedAt: string,
): boolean {
  return Boolean(
    actor &&
      resource &&
      nonEmpty(actor.tenantId) &&
      nonEmpty(actor.actorId) &&
      nonEmpty(resource.tenantId) &&
      nonEmpty(resource.documentId) &&
      validInstant(evaluatedAt) &&
      (actor.departmentIds ?? []).every(nonEmpty),
  );
}

function validPolicy(
  policy: DocumentAccessPolicy,
  resource: DocumentAccessResourceContext,
): boolean {
  if (
    policy.contractVersion !== DOCUMENT_ACCESS_CONTRACT_VERSION ||
    !nonEmpty(policy.tenantId) ||
    !nonEmpty(policy.documentId) ||
    policy.documentId !== resource.documentId ||
    !nonEmpty(policy.policyId) ||
    !Number.isSafeInteger(policy.policyVersion) ||
    policy.policyVersion < 1 ||
    !["draft", "active", "inactive", "retired"].includes(policy.status) ||
    !validInstant(policy.effectiveFrom) ||
    (policy.effectiveUntil !== undefined &&
      policy.effectiveUntil !== null &&
      !validInstant(policy.effectiveUntil)) ||
    (policy.effectiveUntil !== undefined &&
      policy.effectiveUntil !== null &&
      Date.parse(policy.effectiveUntil) <= Date.parse(policy.effectiveFrom)) ||
    !nonEmpty(policy.provenance?.createdBy) ||
    !validInstant(policy.provenance?.createdAt) ||
    policy.indexMetadata?.policyId !== policy.policyId ||
    policy.indexMetadata?.policyVersion !== policy.policyVersion
  ) {
    return false;
  }
  if (
    policy.inherits &&
    (!nonEmpty(policy.inherits.policyId) ||
      !Number.isSafeInteger(policy.inherits.policyVersion) ||
      policy.inherits.policyVersion < 1 ||
      (policy.inherits.policyId === policy.policyId &&
        policy.inherits.policyVersion === policy.policyVersion))
  ) {
    return false;
  }

  const ruleIds = new Set<string>();
  for (const rule of policy.rules) {
    if (!validRule(rule) || ruleIds.has(rule.ruleId)) return false;
    ruleIds.add(rule.ruleId);
  }
  return true;
}

function validRule(rule: DocumentAccessPolicyRule): boolean {
  if (
    !nonEmpty(rule.ruleId) ||
    !["allow", "deny"].includes(rule.effect) ||
    !SUBJECT_TYPES.has(rule.subject?.type) ||
    !Array.isArray(rule.actions) ||
    rule.actions.length === 0 ||
    !rule.actions.every(isDocumentAccessAction)
  ) {
    return false;
  }
  const identified = ["user", "custom_role", "department"].includes(rule.subject.type);
  return identified ? nonEmpty(rule.subject.id) : rule.subject.id === undefined;
}

function subjectMatches(
  rule: DocumentAccessPolicyRule,
  actor: DocumentAccessActorContext,
  resource: DocumentAccessResourceContext,
): boolean {
  switch (rule.subject.type) {
    case "user":
      return rule.subject.id === actor.actorId;
    case "custom_role":
      return Boolean(actor.customRoleId && rule.subject.id === actor.customRoleId);
    case "department":
      return Boolean(rule.subject.id && actor.departmentIds?.includes(rule.subject.id));
    case "owner":
      return Boolean(resource.ownerId && resource.ownerId === actor.actorId);
    case "tenant_member":
      return true;
  }
}

function normalizedIds(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function tenantMismatch(left: unknown, right: unknown): boolean {
  return nonEmpty(left) && nonEmpty(right) && left !== right;
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}
