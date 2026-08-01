"use client";

import { Suspense, type ReactNode, useState } from "react";
import { AppNavigation } from "@/components/auth/app-navigation";
import { ProtectedRoute } from "@/components/auth/auth-guard";

import { TopNavBar } from "@/components/ui/TopNavBar";
import { CopilotTrigger, CopilotPanel } from "@/components/copilot";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-600">
          Restoring your session...
        </main>
      }
    >
      <ProtectedRoute>
        <div className="flex min-h-dvh overflow-x-clip bg-background text-on-background">
          <AppNavigation
            open={navigationOpen}
            onClose={() => setNavigationOpen(false)}
          />
          <div className="flex min-w-0 flex-1 flex-col md:ms-[280px]">
            <TopNavBar onNavigationOpen={() => setNavigationOpen(true)} />
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
          </div>

          <CopilotTrigger
            open={copilotOpen}
            onClick={() => setCopilotOpen((v) => !v)}
          />
          <CopilotPanel
            open={copilotOpen}
            onClose={() => setCopilotOpen(false)}
          />
        </div>
      </ProtectedRoute>
    </Suspense>
  );
}
