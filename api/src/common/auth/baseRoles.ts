export const BASE_ROLES = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "EMPLOYEE",
] as const;

export type BaseRole = (typeof BASE_ROLES)[number];

export const TENANT_ROLE_BASES = ["COMPANY_ADMIN", "EMPLOYEE"] as const;
export type TenantRoleBase = (typeof TENANT_ROLE_BASES)[number];

export function isBaseRole(value: unknown): value is BaseRole {
  return (
    value === "SUPER_ADMIN" ||
    value === "COMPANY_ADMIN" ||
    value === "EMPLOYEE"
  );
}
