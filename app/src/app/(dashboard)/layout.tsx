"use client";

import { Suspense, type ReactNode } from "react";
import { AppNavigation } from "@/components/auth/app-navigation";
import { ProtectedRoute } from "@/components/auth/auth-guard";

import { TopNavBar } from "@/components/ui/TopNavBar";

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
        <div className="flex min-h-dvh bg-background text-on-background">
          <AppNavigation />
          <div className="flex-1 md:ml-[280px] flex flex-col">
            <TopNavBar />
            {children}
          </div>
        </div>
      </ProtectedRoute>
    </Suspense>
  );
}
