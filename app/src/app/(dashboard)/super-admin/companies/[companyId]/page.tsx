"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import {
  PlatformState,
  StatusPill,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import { getTenantById } from "@/services/platform.service";

export default function CompanyDetailPage() {
  const id = String(useParams<{ companyId: string }>().companyId ?? "");
  const loader = useCallback(
    (signal?: AbortSignal) => getTenantById(id, signal),
    [id],
  );
  const state = usePlatformData(loader);
  return (
    <DashboardPage>
      <Link
        href="/super-admin/companies"
        className="mb-4 inline-flex w-fit items-center gap-1 text-sm font-bold text-secondary"
      >
        <span className="material-symbols-outlined text-[18px] rtl:rotate-180">
          arrow_back
        </span>
        Companies
      </Link>
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <>
          <DashboardPageHeader
            title={state.data.name}
            description={state.data.slug}
            actions={<StatusPill value={state.data.status} />}
          />
          <div className="grid auto-rows-auto items-start gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 xl:gap-5">
            {[
              ["Plan", state.data.plan],
              ["Users", state.data.stats.users],
              ["Documents", state.data.stats.documents],
              ["Queries", state.data.stats.questions],
              ["Created", new Date(state.data.createdAt).toLocaleDateString()],
              ["Updated", new Date(state.data.updatedAt).toLocaleDateString()],
            ].map(([label, value]) => (
              <DashboardPanel key={label} padding="compact">
                <p className="text-sm text-on-surface-variant">{label}</p>
                <p className="mt-1 break-words text-title-lg font-bold text-primary">
                  {value}
                </p>
              </DashboardPanel>
            ))}
          </div>
        </>
      ) : null}
    </DashboardPage>
  );
}
