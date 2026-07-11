"use client";

import type { ReactNode } from "react";
import { RoleGuard } from "@/components/auth/auth-guard";

export default function SuperAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <RoleGuard role="SUPER_ADMIN">{children}</RoleGuard>;
}
