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
import { NotificationToasts } from "@/components/ui/NotificationToasts";
import { cn } from "@/lib/utils";

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
          <NotificationToasts />
          <div className="flex h-dvh min-h-0 overflow-x-clip bg-background text-on-background">
            <AppNavigation
              open={navigationOpen}
              onClose={() => setNavigationOpen(false)}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col md:ms-[72px] xl:ms-[280px]">
              <TopNavBar onNavigationOpen={() => setNavigationOpen(true)} />
              <main
                data-guide-id="section-content"
                className={cn(
                  "flex min-w-0 min-h-0 flex-1 flex-col",
                  COPILOT_ENABLED && "pb-20",
                )}
              >
                {children}
              </main>
            </div>
            {COPILOT_ENABLED ? (
              <>
                <CopilotPanel />
                <CopilotLauncher />
                <GuideOverlay />
              </>
            ) : null}
          </div>
        </CopilotProvider>
      </ProtectedRoute>
    </Suspense>
  );
}
