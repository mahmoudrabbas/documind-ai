import { Permission, type PermissionValue } from "@/types/api/permissions.types";

export type PlatformNavItem = {
  /** English label. Retained as the fallback when `labelKey` is absent. */
  label: string;
  /** Translation key for the displayed label. */
  labelKey?: string;
  href: string;
  icon: string;
  requiredPermissions: readonly PermissionValue[];
  badge?: "beta" | "new";
};

export type PlatformNavGroup = {
  id: string; // stable key for localStorage collapse state
  label: string | null; // null = ungrouped, rendered flat at the top
  /** Translation key for the group header. Fallback to `label` when absent. */
  labelKey?: string;
  icon?: string;
  defaultOpen?: boolean;
  items: readonly PlatformNavItem[];
};

export const PLATFORM_NAV_GROUPS: readonly PlatformNavGroup[] = [
  {
    id: "overview",
    label: null,
    defaultOpen: true,
    items: [
      {
        label: "Overview",
        labelKey: "nav.overview",
        href: "/super-admin",
        icon: "dashboard",
        requiredPermissions: [Permission.AUDIT_READ],
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    labelKey: "nav.groupCustomers",
    icon: "business",
    defaultOpen: true,
    items: [
      {
        label: "Companies",
        labelKey: "nav.companies",
        href: "/super-admin/companies",
        icon: "business",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
      {
        label: "Platform Users",
        labelKey: "nav.platformUsers",
        href: "/super-admin/users",
        icon: "group",
        requiredPermissions: [Permission.USERS_READ],
      },
    ],
  },
  {
    id: "billing",
    label: "Billing & Plans",
    labelKey: "nav.groupBillingPlans",
    icon: "payments",
    defaultOpen: true,
    items: [
      {
        label: "Packages",
        labelKey: "nav.packages",
        href: "/super-admin/packages",
        icon: "inventory_2",
        requiredPermissions: [Permission.BILLING_READ],
      },
      {
        label: "Subscriptions",
        labelKey: "nav.subscriptions",
        href: "/super-admin/subscriptions",
        icon: "payments",
        requiredPermissions: [Permission.BILLING_READ],
      },
      {
        label: "Payment Diagnostics",
        labelKey: "nav.paymentDiagnostics",
        href: "/super-admin/payments",
        icon: "receipt_long",
        requiredPermissions: [Permission.BILLING_READ],
      },
      {
        label: "Refund Reviews",
        labelKey: "nav.refundReviews",
        href: "/super-admin/refunds",
        icon: "currency_exchange",
        requiredPermissions: [Permission.BILLING_READ],
      },
      {
        label: "Quota Overrides",
        labelKey: "nav.quotaOverrides",
        href: "/super-admin/entitlement",
        icon: "tune",
        requiredPermissions: [Permission.BILLING_MANAGE],
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    labelKey: "nav.groupOperations",
    icon: "manufacturing",
    defaultOpen: true,
    items: [
      {
        label: "Processing Jobs",
        labelKey: "nav.processingJobs",
        href: "/super-admin/jobs",
        icon: "manufacturing",
        requiredPermissions: [Permission.DOCUMENTS_READ],
      },
      {
        label: "Processing Overview",
        labelKey: "nav.processingOverview",
        href: "/super-admin/processing-overview",
        icon: "monitoring",
        requiredPermissions: [Permission.DOCUMENTS_READ],
      },
      {
        label: "System Health",
        labelKey: "nav.systemHealth",
        href: "/super-admin/system-health",
        icon: "health_and_safety",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
    ],
  },
  {
    id: "intelligence",
    label: "AI & Analytics",
    labelKey: "nav.groupAiAnalytics",
    icon: "psychology",
    defaultOpen: true,
    items: [
      {
        label: "AI Configuration",
        labelKey: "nav.aiConfiguration",
        href: "/super-admin/ai-configuration",
        icon: "psychology",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
      {
        label: "Retrieval Debug",
        labelKey: "nav.retrievalDebug",
        href: "/super-admin/retrieval-debug",
        icon: "search",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
      {
        label: "Usage & Costs",
        labelKey: "nav.usageCosts",
        href: "/super-admin/usage",
        icon: "monitoring",
        requiredPermissions: [Permission.ANALYTICS_READ],
      },
      {
        label: "AI Analytics Deep Dive",
        labelKey: "nav.aiAnalyticsDeepDive",
        href: "/super-admin/analytics",
        icon: "analytics",
        requiredPermissions: [Permission.ANALYTICS_READ],
      },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    labelKey: "nav.groupGovernance",
    icon: "policy",
    defaultOpen: true,
    items: [
      {
        label: "Security & Audit",
        labelKey: "nav.securityAudit",
        href: "/super-admin/audit",
        icon: "policy",
        requiredPermissions: [Permission.AUDIT_READ],
      },
      {
        label: "Global Settings",
        labelKey: "nav.globalSettings",
        href: "/super-admin/settings",
        icon: "settings",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
    ],
  },
];

/** Back-compat flat view: keeps PLATFORM_TOPBAR_LINKS and existing tests working. */
export const PLATFORM_NAV_ITEMS = PLATFORM_NAV_GROUPS.flatMap((g) => g.items);
