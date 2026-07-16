// Shared, role-based navigation config.
// Both AppNavigation (sidebar) and TopNavBar read from here so the two
// never drift out of sync when a role or route changes.

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  COMPANY_ADMIN: "COMPANY_ADMIN",
  EMPLOYEE: "EMPLOYEE",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export type NavLink = {
  label: string;
  href: string;
  icon: string;
  comingSoon?: boolean;
};

/**
 * Full sidebar nav, per role. This mirrors what AppNavigation.tsx rendered
 * before — moved here so it's the single source of truth.
 */
export const SIDEBAR_LINKS: Record<Role, readonly NavLink[]> = {
  [ROLES.SUPER_ADMIN]: [
    { label: "Overview", href: "/super-admin", icon: "dashboard" },
    { label: "Companies", href: "/super-admin/companies", icon: "business" },
    { label: "Packages", href: "/super-admin/packages", icon: "inventory_2" },
    {
      label: "Subscriptions",
      href: "/super-admin/subscriptions",
      icon: "payments",
    },
    { label: "Platform Users", href: "/super-admin/users", icon: "group" },
    { label: "Usage & Costs", href: "/super-admin/usage", icon: "monitoring" },
    {
      label: "Processing Jobs",
      href: "/super-admin/jobs",
      icon: "manufacturing",
    },
    {
      label: "System Health",
      href: "/super-admin/system-health",
      icon: "health_and_safety",
    },
    {
      label: "AI Configuration",
      href: "/super-admin/ai-configuration",
      icon: "psychology",
    },
    { label: "Security & Audit", href: "/super-admin/audit", icon: "policy" },
    {
      label: "Global Settings",
      href: "/super-admin/settings",
      icon: "settings",
    },
  ],
  [ROLES.COMPANY_ADMIN]: [
    { label: "Overview", href: "/dashboard", icon: "dashboard" },
    { label: "Documents", href: "/dashboard/documents", icon: "description" },
    { label: "Users", href: "/dashboard/users", icon: "group" },
    { label: "Roles", href: "/dashboard/roles", icon: "manage_accounts" },
    {
      label: "Knowledge Gaps",
      href: "/dashboard/knowledge-gaps",
      icon: "search_off",
    },
    { label: "Analytics", href: "/dashboard/analytics", icon: "analytics" },
    { label: "Settings", href: "/dashboard/settings", icon: "settings" },
    { label: "Audit Log", href: "/dashboard/audit", icon: "policy" },
  ],
  [ROLES.EMPLOYEE]: [
    { label: "Overview", href: "/dashboard", icon: "dashboard" },
    {
      label: "Documents",
      href: "/dashboard/documents",
      icon: "description",
    },
    { label: "Chat", href: "/chat", icon: "forum", comingSoon: true },
  ],
};

/**
 * Condensed set shown as pills in the top bar. Only routes that are
 * actually live for that role — deliberately NOT a 1:1 copy of the
 * sidebar, since the top bar has room for far fewer items.
 *
 * NOTE: adjust these per role as real pages ship.
 */
export const TOPBAR_LINKS: Record<Role, readonly NavLink[]> = {
  [ROLES.SUPER_ADMIN]: [
    { label: "Overview", href: "/super-admin", icon: "dashboard" },
    { label: "Companies", href: "/super-admin/companies", icon: "business" },
    { label: "Packages", href: "/super-admin/packages", icon: "inventory_2" },
  ],
  [ROLES.COMPANY_ADMIN]: [
    { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { label: "Documents", href: "/dashboard/documents", icon: "description" },
    { label: "Users", href: "/dashboard/users", icon: "group" },
  ],
  [ROLES.EMPLOYEE]: [
    { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { label: "Documents", href: "/dashboard/documents", icon: "description" },
  ],
};

/**
 * Settings gear icon in the top bar — only rendered for roles with an
 * actual settings page. Currently only COMPANY_ADMIN has one
 * (/dashboard/settings). Add other roles here once their settings page
 * exists.
 */
export const SETTINGS_HREF_BY_ROLE: Partial<Record<Role, string>> = {
  [ROLES.SUPER_ADMIN]: "/super-admin/settings",
  [ROLES.COMPANY_ADMIN]: "/dashboard/settings",
};

/**
 * "Ask AI" / "Ask DocuMind" entry point — same destination for every
 * authenticated role today.
 */
export const ASK_AI_HREF = "/chat";

export function isKnownRole(role: string): role is Role {
  return (
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.COMPANY_ADMIN ||
    role === ROLES.EMPLOYEE
  );
}
