import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_POLICY_DRAFT_INVALID } from "../../common/errors/errorCodes.js";
import { DOCUMENT_ACCESS_ACTIONS, isDocumentAccessAction } from "./documentAccess.actions.js";
import type { DocumentAccessPolicyRule } from "./documentAccess.types.js";
import { POLICY_DRAFT_MAX_RULES, type NormalizedPolicyDraft } from "./documentPolicyManagement.types.js";

const SUBJECTS = new Set(["user", "custom_role", "department", "owner", "tenant_member"]);
const AUTHORITATIVE = new Set(["tenantId", "documentId", "policyId", "policyVersion", "classificationId", "categoryId", "departmentId", "ownerId", "createdBy", "createdAt", "status", "provenance", "indexMetadata", "contractVersion"]);
const DRAFT_FIELDS = new Set(["rules", "inherits", "effectiveFrom", "effectiveUntil", "reason"]);
const RULE_FIELDS = new Set(["ruleId", "effect", "subject", "actions"]);
const SUBJECT_FIELDS = new Set(["type", "id"]);
const INHERITANCE_FIELDS = new Set(["policyId", "policyVersion"]);

export function normalizePolicyDraft(input: unknown): NormalizedPolicyDraft {
  const value = record(input);
  if (Object.keys(value).some((key) => AUTHORITATIVE.has(key))) invalid("Authoritative fields are not accepted");
  if (Object.keys(value).some((key) => !DRAFT_FIELDS.has(key))) invalid("Unsupported policy draft field");
  if (!Array.isArray(value.rules) || value.rules.length > POLICY_DRAFT_MAX_RULES) invalid("rules must be a bounded array");
  const ids = new Set<string>(); const semantics = new Set<string>();
  const rules = value.rules.map((raw): DocumentAccessPolicyRule => {
    const rule = record(raw); const subject = record(rule.subject);
    if (Object.keys(rule).some((key) => !RULE_FIELDS.has(key)) || Object.keys(subject).some((key) => !SUBJECT_FIELDS.has(key))) invalid("Unsupported policy rule field");
    const ruleId = text(rule.ruleId, 120); if (ids.has(ruleId)) invalid("Duplicate rule ID"); ids.add(ruleId);
    if (rule.effect !== "allow" && rule.effect !== "deny") invalid("Invalid rule effect");
    if (typeof subject.type !== "string" || !SUBJECTS.has(subject.type)) invalid("Invalid subject type");
    const identified = subject.type === "user" || subject.type === "custom_role" || subject.type === "department";
    const subjectId = identified ? text(subject.id, 64) : undefined;
    if (identified && !mongoose.isObjectIdOrHexString(subjectId)) invalid("Invalid subject identifier");
    if (!identified && subject.id !== undefined) invalid("Subject identifier is forbidden");
    if (!Array.isArray(rule.actions) || rule.actions.length < 1 || rule.actions.length > DOCUMENT_ACCESS_ACTIONS.length) invalid("Invalid actions");
    const actions = rule.actions.map((action) => { if (!isDocumentAccessAction(action)) invalid("Unsupported action"); return action; });
    if (new Set(actions).size !== actions.length) invalid("Duplicate actions are not accepted");
    actions.sort();
    const normalized: DocumentAccessPolicyRule = { ruleId, effect: rule.effect, subject: { type: subject.type as DocumentAccessPolicyRule["subject"]["type"], ...(subjectId ? { id: subjectId } : {}) }, actions };
    const semantic = stable({ effect: normalized.effect, subject: normalized.subject, actions });
    if (semantics.has(semantic)) invalid("Duplicate semantic rule"); semantics.add(semantic);
    return normalized;
  }).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const inherits = value.inherits == null ? null : inheritance(value.inherits);
  const effectiveFrom = instant(value.effectiveFrom, "effectiveFrom");
  const effectiveUntil = instant(value.effectiveUntil, "effectiveUntil");
  if (effectiveFrom && effectiveUntil && Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)) invalid("Invalid effective interval");
  const reason = value.reason == null ? null : text(value.reason, 500);
  return { rules, inherits, effectiveFrom, effectiveUntil, reason };
}

export function draftFingerprint(draft: NormalizedPolicyDraft): string { return sha(stable(draft)); }
export function semanticDraftFingerprint(draft: Pick<NormalizedPolicyDraft, "rules" | "inherits" | "effectiveUntil">): string {
  return sha(stable({ rules: draft.rules.map(({ ruleId: _ruleId, ...rule }) => rule), inherits: draft.inherits, effectiveUntil: draft.effectiveUntil }));
}
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
function inheritance(value: unknown) { const item = record(value); if (Object.keys(item).some((key) => !INHERITANCE_FIELDS.has(key))) invalid("Unsupported inheritance field"); const policyId = text(item.policyId, 64); if (!mongoose.isObjectIdOrHexString(policyId) || !Number.isSafeInteger(item.policyVersion) || Number(item.policyVersion) < 1) invalid("Invalid inheritance"); return { policyId, policyVersion: Number(item.policyVersion) }; }
function instant(value: unknown, field: string): string | null { if (value == null) return null; if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) invalid(`Invalid ${field}`); return new Date(value).toISOString(); }
function text(value: unknown, max: number): string { if (typeof value !== "string" || !value.trim() || value.trim().length > max) invalid("Invalid text value"); return value.trim(); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Invalid object"); return value as Record<string, unknown>; }
function invalid(message: string): never { throw new AppError(400, DOCUMENT_POLICY_DRAFT_INVALID, message); }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
