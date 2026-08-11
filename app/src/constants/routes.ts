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
  /** English label. Retained as the fallback when `labelKey` is absent. */
  label: string;
  /**
   * Translation key for the displayed label. Consumers render
   * `labelKey ? t(labelKey) : label`, so links without a key still show
   * their English text rather than a raw dotted key.
   */
  labelKey?: string;
  href: string;
  icon: string;
  context: AppContext;
  requiredPermissions: readonly PermissionValue[];
};

export const TENANT_SIDEBAR_LINKS: readonly NavLink[] = [
  {
    label: "Overview",
    labelKey: "nav.overview",
    href: "/dashboard",
    icon: "dashboard",
    context: "tenant",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    label: "Documents",
    labelKey: "nav.documents",
    href: "/dashboard/documents",
    icon: "description",
    context: "tenant",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    label: "Users",
    labelKey: "nav.users",
    href: "/dashboard/users",
    icon: "group",
    context: "tenant",
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    label: "Roles",
    labelKey: "nav.roles",
    href: "/dashboard/roles",
    icon: "manage_accounts",
    context: "tenant",
    requiredPermissions: [Permission.ROLES_READ],
  },
  {
    label: "Billing",
    labelKey: "nav.billing",
    href: "/dashboard/settings/billing",
    icon: "payments",
    context: "tenant",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    label: "Usage & Limits",
    labelKey: "nav.usageLimits",
    href: "/company/usage",
    icon: "speed",
    context: "tenant",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    label: "Settings",
    labelKey: "nav.settings",
    href: "/dashboard/settings",
    icon: "settings",
    context: "tenant",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    label: "Document Taxonomy",
    labelKey: "nav.documentTaxonomy",
    href: "/dashboard/settings/document-taxonomy",
    icon: "category",
    context: "tenant",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    label: "Audit Log",
    labelKey: "nav.auditLog",
    href: "/dashboard/audit",
    icon: "policy",
    context: "tenant",
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    label: "Email Log",
    labelKey: "nav.emailLog",
    href: "/dashboard/emails",
    icon: "mail",
    context: "tenant",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    label: "Chat",
    labelKey: "nav.chat",
    href: "/dashboard/chat",
    icon: "chat",
    context: "tenant",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    label: "Knowledge Gaps",
    labelKey: "nav.knowledgeGaps",
    href: "/dashboard/knowledge-gaps",
    icon: "search_insights",
    context: "tenant",
    requiredPermissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    label: "Analytics & Insights",
    labelKey: "nav.analyticsInsights",
    href: "/dashboard/analytics",
    icon: "analytics",
    context: "tenant",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    label: "Failed Processing",
    labelKey: "nav.failedProcessing",
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
