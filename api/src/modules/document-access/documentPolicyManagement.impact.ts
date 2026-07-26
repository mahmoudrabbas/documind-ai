import type { ClassificationLevel } from "../document-taxonomy/documentTaxonomy.types.js";
import { POLICY_IMPACT_ACTIONS, type PolicyImpact } from "./documentPolicyManagement.types.js";

export function classifyPolicyImpact(byAction: PolicyImpact["byAction"]): PolicyImpact["direction"] {
  const gained = Object.values(byAction).some((item) => item.gained > 0);
  const lost = Object.values(byAction).some((item) => item.lost > 0);
  return gained && lost ? "mixed" : gained ? "broadening" : lost ? "tightening" : "no_change";
}

export function requiresSensitiveBroadeningConfirmation(level: ClassificationLevel | null, byAction: PolicyImpact["byAction"]): boolean {
  return (level === "confidential" || level === "highly_confidential") &&
    POLICY_IMPACT_ACTIONS.some((action) => byAction[action].gained > 0);
}

export function emptyActionImpact(): PolicyImpact["byAction"] {
  return Object.fromEntries(POLICY_IMPACT_ACTIONS.map((action) => [action, { gained: 0, lost: 0 }])) as PolicyImpact["byAction"];
}

export function aggregateBatchImpact(results: Array<{ direction: PolicyImpact["direction"]; usersGainingAny: number; usersLosingAny: number; sensitiveConfirmationRequired: boolean; byAction: PolicyImpact["byAction"] }>) {
  return { broadeningCount: results.filter((r) => r.direction === "broadening").length, tighteningCount: results.filter((r) => r.direction === "tightening").length,
    mixedCount: results.filter((r) => r.direction === "mixed").length, noChangeCount: results.filter((r) => r.direction === "no_change").length,
    usersGainingAccess: results.reduce((sum, result) => sum + result.usersGainingAny, 0), usersLosingAccess: results.reduce((sum, result) => sum + result.usersLosingAny, 0),
    sensitiveConfirmationRequiredCount: results.filter((result) => result.sensitiveConfirmationRequired).length,
    byAction: Object.fromEntries(POLICY_IMPACT_ACTIONS.map((action) => [action, { gained: results.reduce((sum, result) => sum + result.byAction[action].gained, 0), lost: results.reduce((sum, result) => sum + result.byAction[action].lost, 0) }])) };
}
