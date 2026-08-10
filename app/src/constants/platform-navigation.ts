import { Permission, type PermissionValue } from "@/types/api/permissions.types";

export type PlatformNavItem = {
  label: string;
  href: string;
  icon: string;
  requiredPermissions: readonly PermissionValue[];
  badge?: "beta" | "new";
};

export type PlatformNavGroup = {
  id: string; // stable key for localStorage collapse state
  label: string | null; // null = ungrouped, rendered flat at the top
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
        href: "/super-admin",
        icon: "dashboard",
        requiredPermissions: [Permission.AUDIT_READ],
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: "business",
    defaultOpen: true,
    items: [
      {
        label: "Companies",
        href: "/super-admin/companies",
        icon: "business",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
      {
        label: "Platform Users",
        href: "/super-admin/users",
        icon: "group",
        requiredPermissions: [Permission.USERS_READ],
      },
    ],
  },
  {
    id: "billing",
    label: "Billing & Plans",
    icon: "payments",
    items: [
      {
        label: "Packages",
        href: "/super-admin/packages",
        icon: "inventory_2",
        requiredPermissions: [Permission.BILLING_READ],
      },
      {
        label: "Subscriptions",
        href: "/super-admin/subscriptions",
        icon: "payments",
        requiredPermissions: [Permission.BILLING_READ],
      },
      {
        label: "Payment Diagnostics",
        href: "/super-admin/payments",
        icon: "receipt_long",
        requiredPermissions: [Permission.BILLING_READ],
      },
      {
        label: "Refund Reviews",
        href: "/super-admin/refunds",
        icon: "currency_exchange",
        requiredPermissions: [Permission.BILLING_READ],
      },
      {
        label: "Quota Overrides",
        href: "/super-admin/entitlement",
        icon: "tune",
        requiredPermissions: [Permission.BILLING_MANAGE],
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "manufacturing",
    items: [
      {
        label: "Processing Jobs",
        href: "/super-admin/jobs",
        icon: "manufacturing",
        requiredPermissions: [Permission.DOCUMENTS_READ],
      },
      {
        label: "Processing Overview",
        href: "/super-admin/processing-overview",
        icon: "monitoring",
        requiredPermissions: [Permission.DOCUMENTS_READ],
      },
      {
        label: "System Health",
        href: "/super-admin/system-health",
        icon: "health_and_safety",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
    ],
  },
  {
    id: "intelligence",
    label: "AI & Analytics",
    icon: "psychology",
    items: [
      {
        label: "AI Configuration",
        href: "/super-admin/ai-configuration",
        icon: "psychology",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
      {
        label: "Retrieval Debug",
        href: "/super-admin/retrieval-debug",
        icon: "search",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
      {
        label: "Usage & Costs",
        href: "/super-admin/usage",
        icon: "monitoring",
        requiredPermissions: [Permission.ANALYTICS_READ],
      },
      {
        label: "AI Analytics Deep Dive",
        href: "/super-admin/analytics",
        icon: "analytics",
        requiredPermissions: [Permission.ANALYTICS_READ],
      },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    icon: "policy",
    items: [
      {
        label: "Security & Audit",
        href: "/super-admin/audit",
        icon: "policy",
        requiredPermissions: [Permission.AUDIT_READ],
      },
      {
        label: "Global Settings",
        href: "/super-admin/settings",
        icon: "settings",
        requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
      },
    ],
  },
];

/** Back-compat flat view: keeps PLATFORM_TOPBAR_LINKS and existing tests working. */
export const PLATFORM_NAV_ITEMS = PLATFORM_NAV_GROUPS.flatMap((g) => g.items);
