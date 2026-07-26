import { DOCUMENT_ACCESS_CONTRACT_VERSION } from "./documentAccess.actions.js";
import type { DocumentAccessAction } from "./documentAccess.actions.js";

export const DOCUMENT_ACCESS_FILTER_CONTRACT_VERSION = 1 as const;
export const DOCUMENT_RETRIEVAL_FILTER_SCHEMA_VERSION = 1 as const;

export interface DocumentPolicyVersionRequirement {
  policyId: string;
  minimumVersion: number;
  currentVersion?: number;
}

export interface DocumentAccessFilterConstraints {
  allowedDocumentIds?: readonly string[];
  deniedDocumentIds?: readonly string[];
  allowedOwnerIds?: readonly string[];
  allowedCategoryIds?: readonly string[];
  allowedDepartmentIds?: readonly string[];
  allowedClassifications?: readonly string[];
  policyVersions?: readonly DocumentPolicyVersionRequirement[];
}

interface NormalizedDocumentAccessFilterConstraints {
  allowedDocumentIds: readonly string[];
  deniedDocumentIds: readonly string[];
  allowedOwnerIds: readonly string[];
  allowedCategoryIds: readonly string[];
  allowedDepartmentIds: readonly string[];
  allowedClassifications: readonly string[];
  policyVersions: readonly DocumentPolicyVersionRequirement[];
}

export interface DocumentAccessQueryFilter
  extends NormalizedDocumentAccessFilterConstraints {
  contractVersion: 1;
  evaluationContractVersion: 1;
  tenantId: string;
  actorId: string;
  action: DocumentAccessAction;
  mode: "deny_all" | "constrained";
  failClosed: true;
}

export interface DocumentRetrievalAccessFilter
  extends NormalizedDocumentAccessFilterConstraints {
  schemaVersion: 1;
  evaluationContractVersion: 1;
  tenantId: string;
  actorId: string;
  action: "use_in_ai";
  mode: "deny_all" | "constrained";
  failClosed: true;
  requiresCurrentPolicyRevalidation: true;
}

export function createDocumentAccessQueryFilter(input: {
  tenantId: string;
  actorId: string;
  action: DocumentAccessAction;
  mode: "deny_all" | "constrained";
  constraints?: DocumentAccessFilterConstraints;
}): DocumentAccessQueryFilter {
  return {
    contractVersion: DOCUMENT_ACCESS_FILTER_CONTRACT_VERSION,
    evaluationContractVersion: DOCUMENT_ACCESS_CONTRACT_VERSION,
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: input.action,
    mode: input.mode,
    failClosed: true,
    ...normalizeConstraints(input.constraints),
  };
}

export function createDocumentRetrievalAccessFilter(input: {
  tenantId: string;
  actorId: string;
  mode: "deny_all" | "constrained";
  constraints?: DocumentAccessFilterConstraints;
}): DocumentRetrievalAccessFilter {
  return {
    schemaVersion: DOCUMENT_RETRIEVAL_FILTER_SCHEMA_VERSION,
    evaluationContractVersion: DOCUMENT_ACCESS_CONTRACT_VERSION,
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "use_in_ai",
    mode: input.mode,
    failClosed: true,
    requiresCurrentPolicyRevalidation: true,
    ...normalizeConstraints(input.constraints),
  };
}

function normalizeConstraints(
  constraints: DocumentAccessFilterConstraints | undefined,
): NormalizedDocumentAccessFilterConstraints {
  return {
    allowedDocumentIds: normalizedStrings(constraints?.allowedDocumentIds),
    deniedDocumentIds: normalizedStrings(constraints?.deniedDocumentIds),
    allowedOwnerIds: normalizedStrings(constraints?.allowedOwnerIds),
    allowedCategoryIds: normalizedStrings(constraints?.allowedCategoryIds),
    allowedDepartmentIds: normalizedStrings(constraints?.allowedDepartmentIds),
    allowedClassifications: normalizedStrings(
      constraints?.allowedClassifications,
      true,
    ),
    policyVersions: normalizePolicyVersions(constraints?.policyVersions),
  };
}

function normalizedStrings(
  values: readonly string[] | undefined,
  lowercase = false,
): string[] {
  return [...new Set((values ?? []).map((value) => {
    const trimmed = value.trim();
    return lowercase ? trimmed.toLowerCase() : trimmed;
  }).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizePolicyVersions(
  values: readonly DocumentPolicyVersionRequirement[] | undefined,
): DocumentPolicyVersionRequirement[] {
  return [...(values ?? [])]
    .map((value) => ({
      policyId: value.policyId.trim(),
      minimumVersion: value.minimumVersion,
      ...(value.currentVersion === undefined
        ? {}
        : { currentVersion: value.currentVersion }),
    }))
    .filter((value) => value.policyId.length > 0)
    .sort((left, right) =>
      left.policyId.localeCompare(right.policyId) ||
      left.minimumVersion - right.minimumVersion ||
      (left.currentVersion ?? 0) - (right.currentVersion ?? 0));
}
