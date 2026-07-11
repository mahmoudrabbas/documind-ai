export function getRoleHome(role: string): string {
  return role === "SUPER_ADMIN" ? "/super-admin" : "/dashboard";
}
