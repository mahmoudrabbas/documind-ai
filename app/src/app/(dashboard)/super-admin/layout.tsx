"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RoleGuard } from "@/components/auth/auth-guard";
import { PermissionBoundary } from "@/components/auth/permission-boundary";
import { Permission, type PermissionValue } from "@/types/api/permissions.types";

const ROUTE_PERMISSIONS: ReadonlyArray<{
  prefix: string;
  permissions: readonly PermissionValue[];
}> = [
  { prefix: "/super-admin/packages/new", permissions: [Permission.BILLING_MANAGE] },
  { prefix: "/super-admin/tenants", permissions: [Permission.COMPANY_SETTINGS_READ] },
  { prefix: "/super-admin/companies", permissions: [Permission.COMPANY_SETTINGS_READ] },
  { prefix: "/super-admin/packages", permissions: [Permission.BILLING_READ] },
  { prefix: "/super-admin/subscriptions", permissions: [Permission.BILLING_READ] },
  { prefix: "/super-admin/users", permissions: [Permission.USERS_READ] },
  { prefix: "/super-admin/usage", permissions: [Permission.ANALYTICS_READ] },
  { prefix: "/super-admin/jobs", permissions: [Permission.DOCUMENTS_READ] },
  { prefix: "/super-admin/system-health", permissions: [Permission.COMPANY_SETTINGS_READ] },
  { prefix: "/super-admin/ai-configuration", permissions: [Permission.COMPANY_SETTINGS_READ] },
  { prefix: "/super-admin/audit", permissions: [Permission.AUDIT_READ] },
  { prefix: "/super-admin/settings", permissions: [Permission.COMPANY_SETTINGS_READ] },
  { prefix: "/super-admin/payments", permissions: [Permission.BILLING_READ] },
  { prefix: "/super-admin", permissions: [Permission.AUDIT_READ] },
];

export default function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const required =
    ROUTE_PERMISSIONS.find(({ prefix }) => pathname.startsWith(prefix))
      ?.permissions ?? [];
  return (
    <RoleGuard role="SUPER_ADMIN">
      <PermissionBoundary permissions={required}>{children}</PermissionBoundary>
    </RoleGuard>
  );
}
