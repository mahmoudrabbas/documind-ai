/**
 * Flow catalog ranking helpers (role-aware relevance). The server is the
 * source of truth — it permission-filters the catalog and tags each flow with
 * an `audience`. The client only re-orders: non-admin users see a
 * "Recommended for you" section (employee/all flows) above the full catalog.
 */

import type { GuideFlowCategory, GuideFlowMeta } from "./copilot-types";

export const CATEGORY_ORDER: GuideFlowCategory[] = [
  "documents",
  "users",
  "roles",
  "settings",
  "billing",
  "chat",
  "platform",
];

export function partitionFlows(
  flows: GuideFlowMeta[],
): { recommended: GuideFlowMeta[]; rest: GuideFlowMeta[] } {
  const recommended = flows.filter(
    (flow) => flow.audience === "employee" || flow.audience === "all",
  );
  const rest = flows.filter(
    (flow) => flow.audience !== "employee" && flow.audience !== "all",
  );
  return { recommended, rest };
}

export function groupFlowsByCategory(
  flows: GuideFlowMeta[],
): Array<{ category: GuideFlowCategory; flows: GuideFlowMeta[] }> {
  const groups = new Map<GuideFlowCategory, GuideFlowMeta[]>();
  for (const flow of flows) {
    const category = flow.category ?? "documents";
    const list = groups.get(category) ?? [];
    list.push(flow);
    groups.set(category, list);
  }
  return CATEGORY_ORDER.filter((category) => groups.has(category)).map(
    (category) => ({ category, flows: groups.get(category) ?? [] }),
  );
}