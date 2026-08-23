/**
 * Static client-side action catalog — mirror of the backend
 * `platformActionToolCatalog`. Curated to the three quick-guide actions
 * surfaced in the copilot panel; the backend still validates server-side
 * regardless of what is listed here.
 *
 * Permission-gated on the client via `can(Permission)`; the backend always
 * validates server-side regardless.
 */

import { Permission, type PermissionValue } from "@/types/api/permissions.types";

export type ActionCatalogRisk = "low" | "reversible" | "destructive";

export interface ActionCatalogEntry {
  toolName: string;
  /** i18n key (copilot.action.chip.<toolName>) */
  labelKey: string;
  permission: PermissionValue;
  risk: ActionCatalogRisk;
  destructive: boolean;
}

/**
 * The quick-guide action set surfaced in the copilot panel. Destructive
 * actions flow through the existing plan → confirm dialog.
 */
export const ACTION_CATALOG: readonly ActionCatalogEntry[] = [
  {
    toolName: "user.list",
    labelKey: "copilot.action.chip.user.list",
    permission: Permission.USERS_READ,
    risk: "low",
    destructive: false,
  },
  {
    toolName: "settings.update",
    labelKey: "copilot.action.chip.settings.update",
    permission: Permission.COMPANY_SETTINGS_UPDATE,
    risk: "low",
    destructive: false,
  },
  {
    toolName: "document.softDelete",
    labelKey: "copilot.action.chip.document.softDelete",
    permission: Permission.DOCUMENTS_DELETE,
    risk: "destructive",
    destructive: true,
  },
] as const;

/** Returns action catalog entries the current user has permission to trigger. */
export function permittedActions(
  can: (permission: PermissionValue) => boolean,
): ActionCatalogEntry[] {
  return ACTION_CATALOG.filter((entry) => can(entry.permission));
}
