import {
  Permission,
  type PermissionValue,
} from "@/types/api/permissions.types";
import { isStandardUserRole } from "@/lib/role-home";
import { PLATFORM_NAV_ITEMS } from "@/constants/platform-navigation";

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  COMPANY_ADMIN: "COMPANY_ADMIN",
  EMPLOYEE: "EMPLOYEE",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
export type AppContext = "tenant" | "platform";

export type NavLink = {
  label: string;
  href: string;
  icon: string;
  context: AppContext;
  requiredPermissions: readonly PermissionValue[];
};

export const TENANT_SIDEBAR_LINKS: readonly NavLink[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: "dashboard",
    context: "tenant",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    label: "Documents",
    href: "/dashboard/documents",
    icon: "description",
    context: "tenant",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    label: "Users",
    href: "/dashboard/users",
    icon: "group",
    context: "tenant",
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    label: "Roles",
    href: "/dashboard/roles",
    icon: "manage_accounts",
    context: "tenant",
    requiredPermissions: [Permission.ROLES_READ],
  },
  {
    label: "Billing",
    href: "/dashboard/settings/billing",
    icon: "payments",
    context: "tenant",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    label: "Usage & Limits",
    href: "/company/usage",
    icon: "speed",
    context: "tenant",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: "settings",
    context: "tenant",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    label: "Document Taxonomy",
    href: "/dashboard/settings/document-taxonomy",
    icon: "category",
    context: "tenant",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    label: "Audit Log",
    href: "/dashboard/audit",
    icon: "policy",
    context: "tenant",
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    label: "Email Log",
    href: "/dashboard/emails",
    icon: "mail",
    context: "tenant",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    label: "Chat",
    href: "/dashboard/chat",
    icon: "chat",
    context: "tenant",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    label: "Knowledge Gaps",
    href: "/dashboard/knowledge-gaps",
    icon: "search_insights",
    context: "tenant",
    requiredPermissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    label: "Analytics & Insights",
    href: "/dashboard/analytics",
    icon: "analytics",
    context: "tenant",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    label: "Failed Processing",
    href: "/dashboard/processing-failed",
    icon: "error",
    context: "tenant",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
];

/** Flat view derived from the grouped platform nav (see platform-navigation.ts). */
export const PLATFORM_SIDEBAR_LINKS: readonly NavLink[] = PLATFORM_NAV_ITEMS.map(
  (item) => ({ ...item, context: "platform" as const }),
);

export const TENANT_TOPBAR_LINKS = TENANT_SIDEBAR_LINKS.slice(0, 3);

/** Pinned by href — regrouping PLATFORM_NAV_GROUPS must not change the top bar. */
const PLATFORM_TOPBAR_HREFS = [
  "/super-admin",
  "/super-admin/companies",
  "/super-admin/packages",
] as const;
export const PLATFORM_TOPBAR_LINKS: readonly NavLink[] = PLATFORM_TOPBAR_HREFS.flatMap(
  (href) => PLATFORM_SIDEBAR_LINKS.find((link) => link.href === href) ?? [],
);

export function isKnownRole(role: string): role is Role {
  return Object.values(ROLES).includes(role as Role);
}

export function getAppContext(role: Role): AppContext {
  // BaseRole is used only to select the isolated platform or tenant shell.
  return role === ROLES.SUPER_ADMIN ? "platform" : "tenant";
}

export function filterNavigationLinks(
  links: readonly NavLink[],
  permissionStatus: "loading" | "idle" | "ready" | "denied" | "error" | "maintenance",
  can: (permission: PermissionValue) => boolean,
  role?: string,
): readonly NavLink[] {
  if (permissionStatus !== "ready") return [];
  return links.filter(
    (link) =>
      link.requiredPermissions.every((permission) => can(permission)) &&
      (!isStandardUserRole(role ?? "") || link.href !== "/dashboard"),
  );
}
