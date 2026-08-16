"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RoleGuard } from "@/components/auth/auth-guard";
import { PermissionBoundary } from "@/components/auth/permission-boundary";
import {
  Permission,
  type PermissionValue,
} from "@/types/api/permissions.types";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";

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
    prefix: "/dashboard/settings/billing",
    permissions: [Permission.BILLING_READ],
  },
  {
    prefix: "/dashboard/settings",
    permissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    prefix: "/dashboard/chat",
    permissions: [Permission.CHAT_READ],
  },
  {
    prefix: "/dashboard/processing-failed",
    permissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    prefix: "/dashboard/notifications",
    permissions: [Permission.NOTIFICATIONS_READ],
  },
];
const TENANT_SHELL_ROLES = ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"] as const;

export default function TenantDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const permissions = usePermissions();
  const isOverviewPath = pathname === "/dashboard" || pathname === "/dashboard/";
  const required = isOverviewPath
    ? [Permission.ANALYTICS_READ]
    : ROUTE_PERMISSIONS.find(({ prefix }) => pathname.startsWith(prefix))
        ?.permissions ?? [];

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    if (
      isOverviewPath &&
      permissions.status === "ready" &&
      !permissions.can(Permission.ANALYTICS_READ)
    ) {
      router.replace("/dashboard/chat");
    }
  }, [auth, isOverviewPath, permissions, router]);

  return (
    <RoleGuard role={TENANT_SHELL_ROLES}>
      <PermissionBoundary permissions={required}>{children}</PermissionBoundary>
    </RoleGuard>
  );
}
