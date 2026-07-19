"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RoleGuard } from "@/components/auth/auth-guard";
import { PermissionBoundary } from "@/components/auth/permission-boundary";
import {
  Permission,
  type PermissionValue,
} from "@/types/api/permissions.types";

const ROUTE_PERMISSIONS: ReadonlyArray<{
  prefix: string;
  permissions: readonly PermissionValue[];
}> = [
  { prefix: "/dashboard/documents", permissions: [Permission.DOCUMENTS_READ] },
  { prefix: "/dashboard/users", permissions: [Permission.USERS_READ] },
  { prefix: "/dashboard/roles", permissions: [Permission.ROLES_READ] },
  { prefix: "/dashboard/audit", permissions: [Permission.AUDIT_READ] },
  {
    prefix: "/dashboard/analytics",
    permissions: [Permission.ANALYTICS_READ],
  },
  {
    prefix: "/dashboard/knowledge-gaps",
    permissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    prefix: "/dashboard/emails",
    permissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    prefix: "/dashboard/settings",
    permissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    prefix: "/dashboard/chat",
    permissions: [Permission.CHAT_READ],
  },
];
const TENANT_SHELL_ROLES = ["COMPANY_ADMIN", "EMPLOYEE"] as const;

export default function TenantDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const required =
    ROUTE_PERMISSIONS.find(({ prefix }) => pathname.startsWith(prefix))
      ?.permissions ?? [];

  return (
    <RoleGuard role={TENANT_SHELL_ROLES}>
      <PermissionBoundary permissions={required}>{children}</PermissionBoundary>
    </RoleGuard>
  );
}
