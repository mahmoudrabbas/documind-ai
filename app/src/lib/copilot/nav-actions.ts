/**
 * Sidebar section → copilot quick guides (chips).
 *
 * Each sidebar destination that has matching copilot surfaces maps to the
 * chips surfaced when the section's action button opens the panel:
 *
 *   - `tools` → action chips on the Actions tab (backend action tools,
 *     mirrored in `ACTION_CATALOG` / `platformActionToolCatalog`).
 *   - `flows` → guide-flow chips on the Guides tab (server-side flow
 *     catalog in `api/src/modules/copilot/guide/guideFlows.ts`).
 *
 * Sections without an entry (Overview, Audit Log, Chat, …) get no action
 * button.
 */

import { ACTION_CATALOG } from "./action-catalog";
import { Permission, type PermissionValue } from "@/types/api/permissions.types";

export const NAV_ACTION_TOOLS: Readonly<Record<string, readonly string[]>> = {
  "/dashboard/documents": [
    "document.search",
    "document.get",
    "document.updateMetadata",
    "document.archive",
    "document.restore",
    "document.softDelete",
    "document.permanentDelete",
  ],
  "/dashboard/users": [
    "user.invite",
    "user.resendInvitation",
    "user.revokeInvitation",
    "user.delete",
  ],
  "/dashboard/settings": [],
  "/dashboard/roles": [],
};

export const NAV_GUIDE_FLOWS: Readonly<Record<string, readonly string[]>> = {
  "/dashboard/settings": ["settings.open"],
  "/dashboard/roles": ["roles.create"],
  "/dashboard/settings/document-taxonomy": ["taxonomy.manage"],
  "/dashboard/settings/billing": ["billing.open"],
  "/company/usage": ["usage.view"],
};

/** Permission gate per flowId, mirroring the server-side
 * `requiredPermissions` in guideFlows.ts. */
const GUIDE_FLOW_PERMISSIONS: Readonly<Record<string, PermissionValue>> = {
  "settings.open": Permission.COMPANY_SETTINGS_READ,
  "roles.create": Permission.ROLES_CREATE,
  "taxonomy.manage": Permission.COMPANY_SETTINGS_READ,
  "billing.open": Permission.BILLING_READ,
  "usage.view": Permission.BILLING_READ,
};

export interface SectionQuickGuides {
  /** Action chips (Actions tab). */
  tools: string[];
  /** Guide-flow chips (Guides tab). */
  flows: string[];
}

/** Action chips available for a sidebar destination, or null when the
 * section has no matching tools at all. */
export function navActionToolsFor(href: string): readonly string[] | null {
  return NAV_ACTION_TOOLS[href] ?? null;
}

/** Guide-flow chips available for a sidebar destination, or null when the
 * section has no matching flows at all. */
export function navGuideFlowsFor(href: string): readonly string[] | null {
  return NAV_GUIDE_FLOWS[href] ?? null;
}

/** Quick guides declared for a sidebar destination, or null when the
 * section has no matching tools and no matching flows. */
export function navQuickGuidesFor(href: string): SectionQuickGuides | null {
  const tools = navActionToolsFor(href);
  const flows = navGuideFlowsFor(href);
  if (!tools && !flows) return null;
  return { tools: [...(tools ?? [])], flows: [...(flows ?? [])] };
}

/** Section chips the current user may actually trigger (tool exists in the
 * catalog and the permission gate passes). Returns null when the section has
 * no matching tools or none are permitted. Order follows the declared map so
 * the panel offers the section's primary guides first. */
export function permittedNavActionTools(
  href: string,
  can: (permission: PermissionValue) => boolean,
): string[] | null {
  const toolNames = navActionToolsFor(href);
  if (!toolNames) return null;
  const permitted = toolNames.filter((toolName) =>
    ACTION_CATALOG.some(
      (entry) => entry.toolName === toolName && can(entry.permission),
    ),
  );
  return permitted.length > 0 ? permitted : null;
}

/** Section quick guides the current user may actually trigger (tools and
 * flows both permission-gated). Returns null when nothing is permitted. */
export function permittedSectionQuickGuides(
  href: string,
  can: (permission: PermissionValue) => boolean,
): SectionQuickGuides | null {
  const guides = navQuickGuidesFor(href);
  if (!guides) return null;
  const tools = guides.tools.filter((toolName) =>
    ACTION_CATALOG.some(
      (entry) => entry.toolName === toolName && can(entry.permission),
    ),
  );
  const flows = guides.flows.filter((flowId) => {
    const permission = GUIDE_FLOW_PERMISSIONS[flowId];
    return permission !== undefined && can(permission);
  });
  if (tools.length === 0 && flows.length === 0) return null;
  return { tools, flows };
}
