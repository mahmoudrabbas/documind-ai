import {
  Permission,
  type PermissionValue,
} from "@/types/api/permissions.types";
import { isStandardUserRole } from "@/lib/role-home";

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

export const PLATFORM_SIDEBAR_LINKS: readonly NavLink[] = [
  { label: "Overview", labelKey: "nav.overview", href: "/super-admin", icon: "dashboard", context: "platform", requiredPermissions: [Permission.AUDIT_READ] },
  { label: "Companies", labelKey: "nav.companies", href: "/super-admin/companies", icon: "business", context: "platform", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
  { label: "Packages", labelKey: "nav.packages", href: "/super-admin/packages", icon: "inventory_2", context: "platform", requiredPermissions: [Permission.BILLING_READ] },
  { label: "Subscriptions", labelKey: "nav.subscriptions", href: "/super-admin/subscriptions", icon: "payments", context: "platform", requiredPermissions: [Permission.BILLING_READ] },
  { label: "Platform Users", labelKey: "nav.platformUsers", href: "/super-admin/users", icon: "group", context: "platform", requiredPermissions: [Permission.USERS_READ] },
  { label: "Usage & Costs", labelKey: "nav.usageCosts", href: "/super-admin/usage", icon: "monitoring", context: "platform", requiredPermissions: [Permission.ANALYTICS_READ] },
  { label: "Processing Jobs", labelKey: "nav.processingJobs", href: "/super-admin/jobs", icon: "manufacturing", context: "platform", requiredPermissions: [Permission.DOCUMENTS_READ] },
  { label: "Processing Overview", labelKey: "nav.processingOverview", href: "/super-admin/processing-overview", icon: "monitoring", context: "platform", requiredPermissions: [Permission.DOCUMENTS_READ] },
  { label: "System Health", labelKey: "nav.systemHealth", href: "/super-admin/system-health", icon: "health_and_safety", context: "platform", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
  { label: "Retrieval Debug", labelKey: "nav.retrievalDebug", href: "/super-admin/retrieval-debug", icon: "search", context: "platform", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
  { label: "AI Configuration", labelKey: "nav.aiConfiguration", href: "/super-admin/ai-configuration", icon: "psychology", context: "platform", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
  { label: "Security & Audit", labelKey: "nav.securityAudit", href: "/super-admin/audit", icon: "policy", context: "platform", requiredPermissions: [Permission.AUDIT_READ] },
  { label: "Global Settings", labelKey: "nav.globalSettings", href: "/super-admin/settings", icon: "settings", context: "platform", requiredPermissions: [Permission.COMPANY_SETTINGS_READ] },
  { label: "Payment Diagnostics", labelKey: "nav.paymentDiagnostics", href: "/super-admin/payments", icon: "payments", context: "platform", requiredPermissions: [Permission.BILLING_READ] },
  { label: "Refund Reviews", labelKey: "nav.refundReviews", href: "/super-admin/refunds", icon: "currency_exchange", context: "platform", requiredPermissions: [Permission.BILLING_READ] },
  { label: "Quota Overrides", labelKey: "nav.quotaOverrides", href: "/super-admin/entitlement", icon: "tune", context: "platform", requiredPermissions: [Permission.BILLING_MANAGE] },
  { label: "AI Analytics Deep Dive", labelKey: "nav.aiAnalyticsDeepDive", href: "/super-admin/analytics", icon: "analytics", context: "platform", requiredPermissions: [Permission.ANALYTICS_READ] },
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
