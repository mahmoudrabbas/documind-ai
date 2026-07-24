import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_POLICY_INVALID } from "../../common/errors/errorCodes.js";
import {
  DOCUMENT_ACCESS_ACTIONS,
  isDocumentAccessAction,
} from "./documentAccess.actions.js";
import type {
  DocumentAccessPolicy,
  DocumentAccessPolicyRule,
  DocumentAccessRuleSubject,
} from "./documentAccess.types.js";

const POLICY_STATUSES = new Set(["draft", "active", "inactive", "retired"]);
const SUBJECT_TYPES = new Set(["user", "custom_role", "department", "owner", "tenant_member"]);

export function normalizeDocumentAccessPolicy(input: unknown): DocumentAccessPolicy {
  const value = record(input, "Policy must be an object");
  const contractVersion = value.contractVersion;
  if (contractVersion !== 1) invalid("contractVersion must equal 1");
  const tenantId = objectId(value.tenantId, "tenantId");
  const documentId = objectId(value.documentId, "documentId");
  const policyId = objectId(value.policyId, "policyId");
  const policyVersion = positiveSafeInteger(value.policyVersion, "policyVersion");
  if (typeof value.status !== "string" || !POLICY_STATUSES.has(value.status)) {
    invalid("Unsupported policy status");
  }
  const effectiveFrom = instant(value.effectiveFrom, "effectiveFrom");
  const effectiveUntil = value.effectiveUntil == null
    ? null
    : instant(value.effectiveUntil, "effectiveUntil");
  if (effectiveUntil && Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)) {
    invalid("effectiveUntil must be later than effectiveFrom");
  }
  if (!Array.isArray(value.rules)) invalid("rules must be an array");
  const ruleIds = new Set<string>();
  const rules = value.rules.map((rule) => normalizeRule(rule, ruleIds));
  rules.sort((left, right) => left.ruleId.localeCompare(right.ruleId));

  const provenanceValue = record(value.provenance, "provenance is required");
  const provenance = {
    createdBy: objectId(provenanceValue.createdBy, "provenance.createdBy"),
    createdAt: instant(provenanceValue.createdAt, "provenance.createdAt"),
    ...(provenanceValue.reason === undefined
      ? {}
      : { reason: nonEmptyString(provenanceValue.reason, "provenance.reason", 500) }),
  };
  const metadataValue = record(value.indexMetadata, "indexMetadata is required");
  const metadataPolicyId = objectId(metadataValue.policyId, "indexMetadata.policyId");
  const metadataVersion = positiveSafeInteger(
    metadataValue.policyVersion,
    "indexMetadata.policyVersion",
  );
  if (metadataPolicyId !== policyId || metadataVersion !== policyVersion) {
    invalid("Policy and index metadata identities must agree");
  }
  const indexMetadata = {
    policyId: metadataPolicyId,
    policyVersion: metadataVersion,
    classificationId: optionalObjectId(metadataValue.classificationId, "classificationId"),
    categoryId: optionalObjectId(metadataValue.categoryId, "categoryId"),
    departmentId: optionalObjectId(metadataValue.departmentId, "departmentId"),
  };
  const inherits = value.inherits == null ? null : normalizeReference(value.inherits);
  if (inherits?.policyId === policyId && inherits.policyVersion === policyVersion) {
    invalid("Policy cannot inherit itself");
  }
  return {
    contractVersion: 1,
    tenantId,
    documentId,
    policyId,
    policyVersion,
    status: value.status as DocumentAccessPolicy["status"],
    effectiveFrom,
    effectiveUntil,
    inherits,
    rules,
    provenance,
    indexMetadata,
  };
}

function normalizeRule(input: unknown, seen: Set<string>): DocumentAccessPolicyRule {
  const value = record(input, "Rule must be an object");
  const ruleId = nonEmptyString(value.ruleId, "ruleId", 120);
  if (seen.has(ruleId)) invalid("Rule IDs must be unique");
  seen.add(ruleId);
  if (value.effect !== "allow" && value.effect !== "deny") invalid("Invalid rule effect");
  const subjectValue = record(value.subject, "Rule subject is required");
  if (typeof subjectValue.type !== "string" || !SUBJECT_TYPES.has(subjectValue.type)) {
    invalid("Invalid subject type");
  }
  const type = subjectValue.type as DocumentAccessRuleSubject["type"];
  const requiresId = type === "user" || type === "custom_role" || type === "department";
  if (requiresId && subjectValue.id === undefined) invalid(`${type} subject requires an ID`);
  if (!requiresId && subjectValue.id !== undefined) invalid(`${type} subject forbids an ID`);
  const subject: DocumentAccessRuleSubject = requiresId
    ? { type, id: objectId(subjectValue.id, "subject.id") }
    : { type };
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    invalid("Rule actions must be a non-empty array");
  }
  const actions = [...new Set(value.actions.map((action) => {
    if (!isDocumentAccessAction(action)) invalid("Unsupported policy action");
    return action;
  }))].sort((left, right) =>
    DOCUMENT_ACCESS_ACTIONS.indexOf(left) - DOCUMENT_ACCESS_ACTIONS.indexOf(right));
  return { ruleId, effect: value.effect, subject, actions };
}

function normalizeReference(input: unknown): { policyId: string; policyVersion: number } {
  const value = record(input, "Invalid inherited policy reference");
  return {
    policyId: objectId(value.policyId, "inherits.policyId"),
    policyVersion: positiveSafeInteger(value.policyVersion, "inherits.policyVersion"),
  };
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(message);
  return value as Record<string, unknown>;
}
function nonEmptyString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    invalid(`${field} must be a non-empty string`);
  }
  return value.trim();
}
function objectId(value: unknown, field: string): string {
  const normalized = nonEmptyString(value, field, 64);
  if (!mongoose.isObjectIdOrHexString(normalized)) invalid(`${field} must be a valid identifier`);
  return normalized;
}
function optionalObjectId(value: unknown, field: string): string | null {
  return value == null ? null : objectId(value, `indexMetadata.${field}`);
}
function positiveSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) invalid(`${field} must be positive`);
  return Number(value);
}
function instant(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(`${field} must be an ISO timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) invalid(`${field} must be an ISO timestamp`);
  return new Date(parsed).toISOString();
}
function invalid(message: string): never {
  throw new AppError(400, DOCUMENT_POLICY_INVALID, message);
}
