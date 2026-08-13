import type { BaseRole } from "../../agents/agents.types.js";
import type { PermissionScopes } from "../../permissions/permissions.types.js";

export interface EvaluationPermissionState {
  documentsUseInAiGranted: boolean;
  scopes?: PermissionScopes;
  /** Semantic keys resolved from tenant taxonomy records, never from the dataset. */
  departmentSemanticKeys?: readonly string[];
  baseRole?: BaseRole;
  customRoleId?: string | null;
}

export interface EvaluationPermissionScenario {
  id: string;
  permission: "DOCUMENTS_USE_IN_AI";
  expectedAccess: "allow" | "deny";
  scopeMode: "unrestricted" | "denied" | "departments" | "dataset_explicit";
  departmentSemanticKey?: "hr";
  requiresCustomRole?: boolean;
}

const SCENARIOS = new Map<string, EvaluationPermissionScenario>([
  ["documents_use_in_ai_unrestricted", { id: "documents_use_in_ai_unrestricted", permission: "DOCUMENTS_USE_IN_AI", expectedAccess: "allow", scopeMode: "unrestricted" }],
  ["documents_use_in_ai_denied", { id: "documents_use_in_ai_denied", permission: "DOCUMENTS_USE_IN_AI", expectedAccess: "deny", scopeMode: "denied" }],
  ["documents_use_in_ai_hr_only", { id: "documents_use_in_ai_hr_only", permission: "DOCUMENTS_USE_IN_AI", expectedAccess: "allow", scopeMode: "departments", departmentSemanticKey: "hr" }],
  ["custom_role_hr_scope", { id: "custom_role_hr_scope", permission: "DOCUMENTS_USE_IN_AI", expectedAccess: "allow", scopeMode: "dataset_explicit", departmentSemanticKey: "hr", requiresCustomRole: true }],
]);

export function getEvaluationPermissionScenario(id: string): EvaluationPermissionScenario | null {
  return SCENARIOS.get(id) ?? null;
}

function hasRestrictiveScope(scopes: PermissionScopes | undefined): boolean {
  if (!scopes) return false;
  return scopes.selfOnly || scopes.departmentIds.length > 0 || scopes.documentCategories.length > 0 || scopes.documentClassifications.length > 0;
}

function canonical(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim().toLowerCase()))].sort();
}

export function permissionScenarioMatches(
  scenario: EvaluationPermissionScenario,
  actual: EvaluationPermissionState,
  declaredScopes?: PermissionScopes,
): boolean {
  if (scenario.expectedAccess === "deny") return !actual.documentsUseInAiGranted;
  if (!actual.documentsUseInAiGranted) return false;

  if (scenario.scopeMode === "unrestricted") return !hasRestrictiveScope(actual.scopes);
  if (!actual.scopes) return false;

  const actualDepartments = canonical(actual.departmentSemanticKeys);
  if (scenario.departmentSemanticKey && !actualDepartments.includes(scenario.departmentSemanticKey)) return false;
  if (scenario.scopeMode === "departments") {
    return actual.scopes.departmentIds.length === 1 && actualDepartments.length === 1;
  }
  if (scenario.scopeMode === "dataset_explicit") {
    if (!actual.customRoleId || !declaredScopes) return false;
    return JSON.stringify(canonicalScopes(actual.scopes)) === JSON.stringify(canonicalScopes(declaredScopes));
  }
  return false;
}

export function canonicalScopes(scopes: PermissionScopes): PermissionScopes {
  return {
    selfOnly: scopes.selfOnly,
    departmentIds: canonical(scopes.departmentIds),
    documentCategories: canonical(scopes.documentCategories),
    documentClassifications: canonical(scopes.documentClassifications),
  };
}
