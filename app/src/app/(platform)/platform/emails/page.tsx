"use client";

import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { Button } from "@/components/ui/Button";

export default function PlatformEmailsPage() {
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Email Infrastructure Diagnostics"
        description="Monitor the global email queue and test provider connectivity."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardPanel className="flex flex-col gap-4">
          <h3 className="text-title-md font-semibold">SMTP Connection</h3>
          <p className="text-body-sm text-on-surface-variant">
            Send a test email to verify that the worker and SMTP configuration are functioning correctly.
          </p>
          <div className="mt-4">
            <Button onClick={() => alert("Not implemented yet.")}>
              Send Test Email
            </Button>
          </div>
        </DashboardPanel>
      </div>
    </DashboardPage>
  );
}
