"use client";

import { Suspense, type ReactNode, useState } from "react";
import { AppNavigation } from "@/components/auth/app-navigation";
import { ProtectedRoute } from "@/components/auth/auth-guard";

import { TopNavBar } from "@/components/ui/TopNavBar";
import { COPILOT_ENABLED } from "@/config/public-env";
import { CopilotProvider } from "@/providers/copilot-provider";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { CopilotLauncher } from "@/components/copilot/CopilotLauncher";
import { GuideOverlay } from "@/components/copilot/guide/GuideOverlay";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-600">
          Restoring your session...
        </main>
      }
    >
      <ProtectedRoute>
        <CopilotProvider>
          <div className="flex min-h-dvh overflow-x-clip bg-background text-on-background">
            <AppNavigation
              open={navigationOpen}
              onClose={() => setNavigationOpen(false)}
            />
            <div className="flex min-w-0 flex-1 flex-col md:ms-[280px]">
              <TopNavBar onNavigationOpen={() => setNavigationOpen(true)} />
              <main
                data-guide-id="section-content"
                className="flex min-w-0 flex-1 flex-col"
              >
                {children}
              </main>
            </div>
          </div>
          {COPILOT_ENABLED ? (
            <>
              <CopilotPanel />
              <CopilotLauncher />
              <GuideOverlay />
            </>
          ) : null}
        </CopilotProvider>
      </ProtectedRoute>
    </Suspense>
  );
}
