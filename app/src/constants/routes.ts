import {
  Permission,
  type PermissionValue,
} from "@/types/api/permissions.types";

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
    requiredPermissions: [],
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
    href: "/checkout",
    icon: "payments",
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
];

export const PLATFORM_SIDEBAR_LINKS: readonly NavLink[] = [
  { label: "Overview", href: "/super-admin", icon: "dashboard", context: "platform", requiredPermissions: [Permission.AUDIT_READ] },
  { label: "Companies", href: "/super-admin/companies", icon: "business", context: "platform", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
  { label: "Packages", href: "/super-admin/packages", icon: "inventory_2", context: "platform", requiredPermissions: [Permission.BILLING_READ] },
  { label: "Subscriptions", href: "/super-admin/subscriptions", icon: "payments", context: "platform", requiredPermissions: [Permission.BILLING_READ] },
  { label: "Platform Users", href: "/super-admin/users", icon: "group", context: "platform", requiredPermissions: [Permission.USERS_READ] },
  { label: "Usage & Costs", href: "/super-admin/usage", icon: "monitoring", context: "platform", requiredPermissions: [Permission.ANALYTICS_READ] },
  { label: "Processing Jobs", href: "/super-admin/jobs", icon: "manufacturing", context: "platform", requiredPermissions: [Permission.DOCUMENTS_READ] },
  { label: "System Health", href: "/super-admin/system-health", icon: "health_and_safety", context: "platform", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
  { label: "AI Configuration", href: "/super-admin/ai-configuration", icon: "psychology", context: "platform", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
  { label: "Security & Audit", href: "/super-admin/audit", icon: "policy", context: "platform", requiredPermissions: [Permission.AUDIT_READ] },
  { label: "Global Settings", href: "/super-admin/settings", icon: "settings", context: "platform", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
  { label: "Payment Diagnostics", href: "/super-admin/payments", icon: "payments", context: "platform", requiredPermissions: [Permission.BILLING_READ] },
];

export const TENANT_TOPBAR_LINKS = TENANT_SIDEBAR_LINKS.slice(0, 3);
export const PLATFORM_TOPBAR_LINKS = PLATFORM_SIDEBAR_LINKS.slice(0, 3);

export function isKnownRole(role: string): role is Role {
  return Object.values(ROLES).includes(role as Role);
}

export function getAppContext(role: Role): AppContext {
  // BaseRole is used only to select the isolated platform or tenant shell.
  return role === ROLES.SUPER_ADMIN ? "platform" : "tenant";
}

export function filterNavigationLinks(
  links: readonly NavLink[],
  permissionStatus: "loading" | "idle" | "ready" | "denied" | "error",
  can: (permission: PermissionValue) => boolean,
): readonly NavLink[] {
  if (permissionStatus !== "ready") return [];
  return links.filter((link) =>
    link.requiredPermissions.every((permission) => can(permission)),
  );
}
