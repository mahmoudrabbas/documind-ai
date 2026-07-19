"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { getRoleHome } from "@/lib/role-home";

function LoadingShell() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50" aria-busy="true"><p className="text-sm text-slate-600">Restoring your session…</p></main>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => { if (auth.status === "authenticated") router.replace(getRoleHome(auth.user.role)); }, [auth, router]);
  if (auth.status !== "unauthenticated") return <LoadingShell />;
  return children;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (status === "unauthenticated") {
      const query = searchParams.toString();
      const returnTo = `${pathname}${query ? `?${query}` : ""}`;
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [status, pathname, searchParams, router]);
  if (status !== "authenticated") return <LoadingShell />;
  return children;
}

export function RoleGuard({
  role,
  children,
}: {
  role: string | readonly string[];
  children: ReactNode;
}) {
  const auth = useAuth();
  const router = useRouter();
  const allowedRoles: readonly string[] =
    typeof role === "string" ? [role] : role;
  const isAllowed =
    auth.status === "authenticated" && allowedRoles.includes(auth.user.role);
  useEffect(() => {
    const roles: readonly string[] =
      typeof role === "string" ? [role] : role;
    if (auth.status === "authenticated" && !roles.includes(auth.user.role)) {
      router.replace(getRoleHome(auth.user.role));
    }
  }, [auth, role, router]);
  if (!isAllowed) return <LoadingShell />;
  return children;
}
