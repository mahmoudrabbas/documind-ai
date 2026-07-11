"use client";

import { Suspense, type ReactNode } from "react";
import { AppNavigation } from "@/components/auth/app-navigation";
import { ProtectedRoute } from "@/components/auth/auth-guard";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-600">
          Restoring your session...
        </main>
      }
    >
      <ProtectedRoute>
        <div className="min-h-dvh bg-slate-50 text-slate-950">
          <AppNavigation />
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </div>
      </ProtectedRoute>
    </Suspense>
  );
}
