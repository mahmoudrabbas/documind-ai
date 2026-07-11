// Shared, role-based navigation config.
// Both AppNavigation (sidebar) and TopNavBar read from here so the two
// never drift out of sync when a role or route changes.

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  COMPANY_ADMIN: "COMPANY_ADMIN",
  USER: "USER",
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
    { label: "Tenant Management", href: "/platform/tenants", icon: "business" },
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
  ],
  [ROLES.USER]: [
    { label: "Overview", href: "/dashboard", icon: "dashboard" },
    {
      label: "Documents",
      href: "/documents",
      icon: "description",
      comingSoon: true,
    },
    { label: "Chat", href: "/chat", icon: "forum", comingSoon: true },
  ],
};

/**
 * Condensed set shown as pills in the top bar. Only routes that are
 * actually live for that role — deliberately NOT a 1:1 copy of the
 * sidebar, since the top bar has room for far fewer items.
 *
 * NOTE: adjust these per role as real pages ship (e.g. once /chat and
 * /documents are live for USER, they can be added here too).
 */
export const TOPBAR_LINKS: Record<Role, readonly NavLink[]> = {
  [ROLES.SUPER_ADMIN]: [
    { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { label: "Tenant Management", href: "/platform/tenants", icon: "business" },
  ],
  [ROLES.COMPANY_ADMIN]: [
    { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { label: "Documents", href: "/dashboard/documents", icon: "description" },
    { label: "Users", href: "/dashboard/users", icon: "group" },
  ],
  [ROLES.USER]: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard" }],
};

/**
 * Settings gear icon in the top bar — only rendered for roles with an
 * actual settings page. Currently only COMPANY_ADMIN has one
 * (/dashboard/settings). Add other roles here once their settings page
 * exists.
 */
export const SETTINGS_HREF_BY_ROLE: Partial<Record<Role, string>> = {
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
    role === ROLES.USER
  );
}
