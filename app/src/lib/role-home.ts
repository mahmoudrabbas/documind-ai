const STANDARD_USER_ROLES = new Set(["EMPLOYEE", "USER"]);

export function isStandardUserRole(role: string): boolean {
  return STANDARD_USER_ROLES.has(role);
}

export function getRoleHome(role: string): string {
  if (role === "SUPER_ADMIN") return "/super-admin";
  if (role === "COMPANY_ADMIN") return "/dashboard";
  return "/chat";
}
