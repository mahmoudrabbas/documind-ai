/**
 * Static client-side action catalog — the visible subset of the backend
 * `platformActionToolCatalog` (api/src/modules/copilot/action/extractActionInput.ts
 * + agents/platformActionAgent.ts TOOL_RISK_MAP). Actions that are not reliable
 * from the assistant UI stay server-side but are intentionally omitted here.
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
 * Ordered so the panel renders admin-only tools at the bottom.
 * Destructive actions flow through the existing plan → confirm dialog.
 */
export const ACTION_CATALOG: readonly ActionCatalogEntry[] = [
  {
    toolName: "document.search",
    labelKey: "copilot.action.chip.document.search",
    permission: Permission.DOCUMENTS_READ,
    risk: "low",
    destructive: false,
  },
  {
    toolName: "document.get",
    labelKey: "copilot.action.chip.document.get",
    permission: Permission.DOCUMENTS_READ,
    risk: "low",
    destructive: false,
  },
  {
    toolName: "user.invite",
    labelKey: "copilot.action.chip.user.invite",
    permission: Permission.USERS_CREATE,
    risk: "reversible",
    destructive: false,
  },
  {
    toolName: "user.resendInvitation",
    labelKey: "copilot.action.chip.user.resendInvitation",
    permission: Permission.USERS_CREATE,
    risk: "low",
    destructive: false,
  },
  {
    toolName: "document.archive",
    labelKey: "copilot.action.chip.document.archive",
    permission: Permission.DOCUMENTS_ARCHIVE,
    risk: "reversible",
    destructive: false,
  },
  {
    toolName: "document.restore",
    labelKey: "copilot.action.chip.document.restore",
    permission: Permission.DOCUMENTS_ARCHIVE,
    risk: "reversible",
    destructive: false,
  },
  {
    toolName: "document.updateMetadata",
    labelKey: "copilot.action.chip.document.updateMetadata",
    permission: Permission.DOCUMENTS_UPDATE,
    risk: "low",
    destructive: false,
  },
  {
    toolName: "user.revokeInvitation",
    labelKey: "copilot.action.chip.user.revokeInvitation",
    permission: Permission.USERS_DELETE,
    risk: "reversible",
    destructive: false,
  },
  {
    toolName: "document.softDelete",
    labelKey: "copilot.action.chip.document.softDelete",
    permission: Permission.DOCUMENTS_DELETE,
    risk: "destructive",
    destructive: true,
  },
  {
    toolName: "user.delete",
    labelKey: "copilot.action.chip.user.delete",
    permission: Permission.USERS_DELETE,
    risk: "destructive",
    destructive: true,
  },
  {
    toolName: "document.permanentDelete",
    labelKey: "copilot.action.chip.document.permanentDelete",
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
