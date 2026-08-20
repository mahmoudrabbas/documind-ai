"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
  IdCell,
  Input,
  Select,
} from "@/components/ui";
import { CompactPagination } from "@/components/ui/CompactPagination";
import { usePlatformQuery } from "@/components/super-admin/use-platform-query";
import {
  getAuditLogs,
  type AuditLog,
  type AuditLogsResponse,
  type AuditQueryFilter,
} from "@/services/audit.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { actionLabel, describeChanges, resourceLabel } from "@/lib/audit-formatters";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

const RESOURCE_OPTIONS = [
  "User",
  "Role",
  "Document",
  "DocumentQuality",
  "OcrPageResult",
  "EmailMessage",
  "Package",
  "Subscription",
  "PlatformSetting",
  "Tenant",
  "Session",
  "System",
  "Permission",
  "PaymentEvent",
] as const;

type Translate = (key: string, params?: Record<string, string>) => string;

function buildSummary(t: Translate, page: number, pageSize: number, totalRecords: number) {
  if (totalRecords === 0) return t("audit.noResults");
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalRecords, page * pageSize);
  return t("audit.showing", {
    start: String(start),
    end: String(end),
    total: String(totalRecords),
  });
}

function makeQuery(
  page: number,
  pageSize: number,
  action: string,
  actorEmail: string,
  resourceType: string,
  resourceId: string,
  outcome: string,
  dateFrom: string,
  dateTo: string,
): AuditQueryFilter {
  return {
    page,
    pageSize,
    ...(action ? { action } : {}),
    ...(actorEmail ? { actorEmail } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(outcome ? { outcome: outcome as AuditQueryFilter["outcome"] } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
}

export default function TenantAuditPage() {
  const { t, tPlural, dir } = useI18n();
  const intlLocale = useIntlLocale();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [outcome, setOutcome] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const query = useMemo(
    () =>
      makeQuery(
        page,
        pageSize,
        action.trim(),
        actorEmail.trim(),
        resourceType,
        resourceId.trim(),
        outcome,
        dateFrom,
        dateTo,
      ),
    [page, pageSize, action, actorEmail, resourceType, resourceId, outcome, dateFrom, dateTo],
  );

  const state = usePlatformQuery(
    async (params: AuditQueryFilter, signal?: AbortSignal) => {
      const response: AuditLogsResponse = await getAuditLogs(params, signal);
      return { data: response };
    },
    query,
  );
  const logs = state.data?.logs ?? [];
  const pagination = state.data?.pagination;
  const totalRecords = pagination?.totalRecords ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  const summary = buildSummary(t, page, pageSize, totalRecords);

  const resourceOptions = [
    { value: "", label: t("audit.allResources") },
    ...RESOURCE_OPTIONS.map((value) => ({
      value,
      label: resourceLabel(value, t),
    })),
  ];

  const outcomeOptions = [
    { value: "", label: t("audit.allOutcomes") },
    { value: "SUCCESS", label: t("audit.outcome.success") },
    { value: "FAILURE", label: t("audit.outcome.failure") },
    { value: "DENIED", label: t("audit.outcome.denied") },
  ];

  function resetFilters() {
    setPage(1);
    setAction("");
    setActorEmail("");
    setResourceType("");
    setResourceId("");
    setOutcome("");
    setDateFrom("");
    setDateTo("");
  }

  function updatePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  const pageCountLabel = t("audit.pageOf", {
    page: String(page),
    total: String(totalPages),
  });

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        guideId="page-heading-audit"
        title={t("audit.title")}
        description={t("audit.description")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            isLoading={state.loading || state.refreshing}
            onClick={() => void state.reload()}
          >
            {t("common.tryAgain")}
          </Button>
        }
      />

      <DashboardPanel tone="muted" padding="compact" className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input
            label={t("audit.actorEmail")}
            value={actorEmail}
            onChange={(event) => {
              setActorEmail(event.target.value);
              setPage(1);
            }}
            placeholder="admin@acme.com"
          />
          <Input
            label={t("audit.actionFilter")}
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            placeholder="USER_UPDATED"
          />
          <Select
            label={t("audit.resourceFilter")}
            value={resourceType}
            onChange={(event) => {
              setResourceType(event.target.value);
              setPage(1);
            }}
            options={resourceOptions}
          />
          <Input
            label={t("audit.resourceId")}
            value={resourceId}
            onChange={(event) => {
              setResourceId(event.target.value);
              setPage(1);
            }}
            placeholder="a8b08ec7-62f0..."
          />
          <Select
            label={t("audit.outcomeFilter")}
            value={outcome}
            onChange={(event) => {
              setOutcome(event.target.value);
              setPage(1);
            }}
            options={outcomeOptions}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t("audit.dateFrom")}
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
            <Input
              label={t("audit.dateTo")}
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-on-surface-variant">
            {pagination ? pageCountLabel : t("audit.noResults")}
          </p>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            {t("audit.clearFilters")}
          </Button>
        </div>
      </DashboardPanel>

      {state.loading && !state.data ? (
        <DashboardPanel>
          <div className="space-y-3" role="status">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="h-14 animate-pulse rounded-xl bg-surface-container"
              />
            ))}
            <span className="sr-only">{t("common.loading")}</span>
          </div>
        </DashboardPanel>
      ) : state.error ? (
        <DashboardPanel>
          <div
            role="alert"
            className="rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container"
          >
            <p>{state.error}</p>
            <Button
              className="mt-3"
              variant="secondary"
              size="sm"
              onClick={() => void state.reload()}
            >
              {t("common.retry")}
            </Button>
          </div>
        </DashboardPanel>
      ) : !state.data || logs.length === 0 ? (
        <DashboardPanel>
          <div className="py-10 text-center">
            <p className="text-title-md font-semibold text-on-surface">
              {t("audit.noLogs")}
            </p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {t("audit.noResultsHint")}
            </p>
          </div>
        </DashboardPanel>
      ) : (
        <>
          {state.refreshing ? (
            <div
              role="progressbar"
              aria-label={t("common.loading")}
              className="mb-3 h-0.5 overflow-hidden rounded-full bg-surface-container-high"
            >
              <div className="h-full w-full animate-pulse bg-primary" />
            </div>
          ) : null}

          <DashboardPanel padding="none">
            <div className="overflow-x-auto" data-guide-id="audit-table">
              <table className="w-full min-w-[1080px] border-collapse text-start text-body-sm">
                <thead className="bg-surface-container-low">
                  <tr className="border-b border-outline-variant/30">
                    <th className="px-4 py-3 text-label-sm font-semibold text-on-surface-variant">
                      {t("audit.tableAction")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-semibold text-on-surface-variant">
                      {t("audit.tableActor")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-semibold text-on-surface-variant">
                      {t("audit.tableRole")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-semibold text-on-surface-variant">
                      {t("audit.tableResource")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-semibold text-on-surface-variant">
                      {t("audit.tableDetails")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-semibold text-on-surface-variant">
                      {t("audit.tableTime")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {logs.map((log: AuditLog) => {
                    const changeDesc = describeChanges(log.action, log.changes, {
                      t,
                      tPlural,
                    });
                    const actor = log.actorEmail ?? t("audit.unauthenticated");

                    return (
                      <tr
                        key={log._id}
                        className="transition-colors hover:bg-surface-container-low/50"
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-1">
                            <p className="font-semibold text-on-surface">
                              {actionLabel(log.action, t)}
                            </p>
                            <Badge
                              status={log.outcome === "SUCCESS" ? "success" : log.outcome === "DENIED" ? "warning" : "error"}
                              label={codeLabel(t, "audit.outcome", log.outcome)}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span className="block max-w-44 truncate text-on-surface" title={actor}>
                            {actor}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Badge
                            status={log.actorRole ? "neutral" : "info"}
                            label={codeLabel(t, "audit.actorRole", log.actorRole ?? "unknown")}
                          />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-1">
                            <p className="font-medium text-on-surface">
                              {resourceLabel(log.resourceType, t)}
                            </p>
                            <IdCell value={log.resourceId} prefixLength={10} suffixLength={4} />
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          {changeDesc ? (
                            <p className="max-w-80 text-body-sm leading-relaxed text-on-surface-variant">
                              {changeDesc}
                            </p>
                          ) : (
                            <span className="inline-flex rounded-full bg-surface-container-high px-2.5 py-1 text-label-sm text-on-surface-variant">
                              {t("audit.noChanges")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top text-on-surface-variant">
                          <time
                            dateTime={log.createdAt}
                            title={new Date(log.createdAt).toLocaleString(intlLocale)}
                            className="whitespace-nowrap"
                          >
                            {new Date(log.createdAt).toLocaleString(intlLocale)}
                          </time>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination ? (
              <CompactPagination
                dir={dir}
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={updatePageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                summary={summary}
                previousLabel={t("audit.previous")}
                nextLabel={t("audit.next")}
                rowsPerPageLabel={t("audit.rowsPerPage")}
              />
            ) : null}
          </DashboardPanel>
        </>
      )}
    </DashboardPage>
  );
}
