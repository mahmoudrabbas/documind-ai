import type { BaseRole } from "../../common/auth/baseRoles.js";

export function policyManagementAllowed(input: { baseRole: BaseRole; coarseAllowed: boolean; policyAllowed: boolean }): boolean {
  if (!input.coarseAllowed) return false;
  if (input.baseRole === "COMPANY_ADMIN" || input.baseRole === "SUPER_ADMIN") return true;
  return input.policyAllowed;
}

export function delegatedPolicyApprovalRequired(baseRole: BaseRole): boolean {
  return baseRole !== "COMPANY_ADMIN" && baseRole !== "SUPER_ADMIN";
}
