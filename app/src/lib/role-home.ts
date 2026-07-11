export function getRoleHome(role: string): string {
  return role === "SUPER_ADMIN" ? "/platform/tenants" : "/dashboard";
}
