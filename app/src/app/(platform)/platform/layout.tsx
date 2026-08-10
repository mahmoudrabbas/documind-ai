"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { RoleGuard } from "@/components/auth/auth-guard";
import { PermissionBoundary } from "@/components/auth/permission-boundary";
import { Permission } from "@/types/api/permissions.types";
import { useAuth } from "@/providers/auth-provider";
import { useI18n } from "@/providers/i18n-provider";
import { useRouter } from "next/navigation";

export default function PlatformLayout({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  return (
    <RoleGuard role="SUPER_ADMIN">
      <PermissionBoundary permissions={[Permission.COMPANY_SETTINGS_READ]}>
        <div className="min-h-dvh bg-slate-50 text-slate-950">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
            <Link href="/platform/tenants" className="font-bold">
              {t("superAdmin.platformBrand")}
            </Link>
            <button
              onClick={() =>
                void auth.logout().finally(() => router.replace("/login"))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              {t("auth.signOut")}
            </button>
          </div>
        </header>
        {children}
        </div>
      </PermissionBoundary>
    </RoleGuard>
  );
}
