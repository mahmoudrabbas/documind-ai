"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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
import { getPlatformHealth } from "@/services/super-admin.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { formatDurationMs } from "@/lib/format-duration";

type WorkerReason = "timeout" | "unreachable" | "not_ready";

function formatCheckedAt(dateString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateString));
}

function formatKey(key: string): string {
  return key
    .replaceAll(/([A-Z])/g, " $1")
    .replaceAll(/[_-]/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function getServiceIcon(name: string): string {
  if (name === "API") return "api";
  if (name === "MongoDB") return "database";
  if (name === "Redis") return "bolt";
  return "memory";
}

function getWorkerIssueLabel(
  t: (key: string, params?: Record<string, string>) => string,
  reason: unknown,
): string | null {
  if (
    reason !== "timeout" &&
    reason !== "unreachable" &&
    reason !== "not_ready"
  ) {
    return null;
  }
  return t(`superAdmin.systemHealthWorkerReason.${reason as WorkerReason}`);
}

function displayValue(
  value: unknown,
  t: (key: string, params?: Record<string, string>) => string,
  readiness = false,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") {
    return readiness
      ? value
        ? t("superAdmin.systemHealthReady")
        : t("superAdmin.systemHealthNotReady")
      : value
        ? t("superAdmin.systemHealthYes")
        : t("superAdmin.systemHealthNo");
  }
  return String(value);
}

function DetailRows({
  entries,
  t,
  readiness = false,
  depth = 0,
}: {
  entries: Array<[string, unknown]>;
  t: (key: string, params?: Record<string, string>) => string;
  readiness?: boolean;
  depth?: number;
}): ReactNode {
  return entries.map(([key, value]) => {
    const nested = value !== null && typeof value === "object";
    return (
      <div
        key={`${depth}-${key}`}
        className={depth > 0 ? "border-s border-outline-variant/40 ps-3" : ""}
      >
        <div className="flex items-start justify-between gap-4 py-2">
          <dt className="min-w-0 text-body-sm text-on-surface-variant">
            {formatKey(key)}
          </dt>
          {!nested ? (
            <dd className="min-w-0 text-end text-body-sm font-semibold text-on-surface">
              {displayValue(value, t, readiness)}
            </dd>
          ) : null}
        </div>
        {nested ? (
          <dl className="space-y-0.5 pb-1">
            <DetailRows
              entries={Object.entries(value as Record<string, unknown>)}
              t={t}
              readiness={readiness || key === "checks"}
              depth={depth + 1}
            />
          </dl>
        ) : null}
      </div>
    );
  });
}

function ServiceMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-1 truncate text-body-sm font-semibold text-on-surface">
        {value}
      </dd>
    </div>
  );
}

function serviceMetrics(
  service: {
    name: string;
    latencyMs: number | null;
    checkedAt: string;
    details: Record<string, unknown>;
  },
  labels: { uptime: string; latency: string; checked: string },
  locale: string,
) {
  const metrics: Array<{ label: string; value: ReactNode }> = [];
  if (service.name === "API" || service.name === "Background workers") {
    if (typeof service.details.uptimeMs === "number") {
      metrics.push({
        label: labels.uptime,
        value: formatDurationMs(service.details.uptimeMs),
      });
    }
  } else if (service.latencyMs !== null) {
    metrics.push({ label: labels.latency, value: `${service.latencyMs} ms` });
  }
  metrics.push({
    label: labels.checked,
    value: formatCheckedAt(service.checkedAt, locale),
  });
  return metrics;
}

function WorkerSections({
  details,
  t,
}: {
  details: Record<string, unknown>;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const checks = details.checks;
  const runtime = details.details;
  const runtimeEntries: Array<[string, unknown]> = [
    ["workerStatus", details.workerStatus],
    ["reachable", details.reachable],
    ...(runtime && typeof runtime === "object"
      ? Object.entries(runtime as Record<string, unknown>)
      : []),
  ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;

  return (
    <>
      {checks && typeof checks === "object" ? (
        <section>
          <h3 className="text-label-md font-bold uppercase tracking-wider text-on-surface-variant">
            {t("superAdmin.systemHealthHealthChecks")}
          </h3>
          <dl className="mt-2 divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30 px-3">
            <DetailRows
              entries={Object.entries(checks as Record<string, unknown>)}
              t={t}
              readiness
            />
          </dl>
        </section>
      ) : null}
      {runtimeEntries.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-label-md font-bold uppercase tracking-wider text-on-surface-variant">
            {t("superAdmin.systemHealthRuntimeDetails")}
          </h3>
          <dl className="mt-2 divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30 px-3">
            <DetailRows entries={runtimeEntries} t={t} />
          </dl>
        </section>
      ) : null}
    </>
  );
}

export default function SystemHealthPage() {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const state = usePlatformData(getPlatformHealth);
  const [selectedService, setSelectedService] = useState<{
    name: string;
    status: string;
    checkedAt: string;
    latencyMs: number | null;
    details: Record<string, unknown>;
  } | null>(null);
  const services = state.data ? Object.values(state.data.services) : [];
  const healthyCount = services.filter(
    (service) => service.status === "healthy",
  ).length;
  const degradedCount = services.filter(
    (service) => service.status === "degraded",
  ).length;
  const unavailableCount = services.filter(
    (service) => service.status === "unavailable" || service.status === "down",
  ).length;
  const totalCount = services.length;
  const overallSummary = state.data
    ? state.data.status === "healthy"
      ? t("superAdmin.systemHealthSummary.healthy", {
          count: String(totalCount),
        })
      : state.data.status === "degraded"
        ? t("superAdmin.systemHealthSummary.degraded", {
            healthyCount: String(healthyCount),
            totalCount: String(totalCount),
          })
        : t("superAdmin.systemHealthSummary.down")
    : "";
  const statCards = [
    {
      label: t("superAdmin.systemHealthTotalServices"),
      value: totalCount,
      icon: "apps",
      tone: "text-primary",
    },
    {
      label: t("superAdmin.systemHealthHealthy"),
      value: healthyCount,
      icon: "check_circle",
      tone: "text-tertiary",
    },
    {
      label: t("superAdmin.systemHealthDegraded"),
      value: degradedCount,
      icon: "warning",
      tone: "text-secondary",
    },
    {
      label: t("superAdmin.systemHealthUnavailable"),
      value: unavailableCount,
      icon: "error",
      tone: "text-error",
    },
  ];

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.systemHealthTitle")}
        description={t("superAdmin.systemHealthDesc")}
        className="mb-7"
        actions={
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            {state.data ? (
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    value={state.data.status}
                    label={codeLabel(
                      t,
                      "superAdmin.serviceStatus",
                      state.data.status,
                    )}
                  />
                  <span className="text-body-sm text-on-surface-variant">
                    {overallSummary}
                  </span>
                </div>
                <p className="mt-1 text-label-sm text-on-surface-variant">
                  {t("superAdmin.systemHealthLastChecked")}:{" "}
                  {formatCheckedAt(state.data.checkedAt, intlLocale)}
                </p>
              </div>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="min-h-10 shrink-0"
              onClick={() => void state.reload()}
              isLoading={state.loading}
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[18px]"
              >
                refresh
              </span>
              {t("common.refresh")}
            </Button>
          </div>
        }
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />

      {state.data ? (
        <>
          <section
            aria-label={t("superAdmin.systemHealthSummaryTitle")}
            className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            {statCards.map((stat) => (
              <DashboardPanel
                key={stat.label}
                padding="compact"
                className="rounded-2xl"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-label-md font-medium text-on-surface-variant">
                    {stat.label}
                  </p>
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined text-[20px] ${stat.tone}`}
                  >
                    {stat.icon}
                  </span>
                </div>
                <p className="mt-2 text-headline-sm font-bold text-on-surface">
                  {stat.value}
                </p>
              </DashboardPanel>
            ))}
          </section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-title-lg font-bold text-on-surface">
              {t("superAdmin.systemHealthServicesTitle")}
            </h2>
            <span className="text-label-md text-on-surface-variant">
              {t("superAdmin.systemHealthLastChecked")}:{" "}
              {formatCheckedAt(state.data.checkedAt, intlLocale)}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((service) => {
              const metrics = serviceMetrics(
                service,
                {
                  uptime: t("superAdmin.systemHealthUptime"),
                  latency: t("superAdmin.systemHealthLatency"),
                  checked: t("superAdmin.systemHealthCheckedAt"),
                },
                intlLocale,
              );
              const workerIssue = getWorkerIssueLabel(
                t,
                service.details.reason,
              );
              return (
                <button
                  key={service.name}
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`${service.name}: ${codeLabel(t, "superAdmin.serviceStatus", service.status)}`}
                  onClick={() => setSelectedService(service)}
                  className="group flex min-h-[190px] w-full cursor-pointer flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-outline hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                      >
                        <span className="material-symbols-outlined text-[22px]">
                          {getServiceIcon(service.name)}
                        </span>
                      </span>
                      <h3 className="truncate text-title-md font-bold text-on-surface">
                        {service.name}
                      </h3>
                    </div>
                    <StatusPill
                      value={service.status}
                      label={codeLabel(
                        t,
                        "superAdmin.serviceStatus",
                        service.status,
                      )}
                    />
                  </div>
                  {workerIssue ? (
                    <p className="mt-4 text-body-sm text-on-surface-variant">
                      {workerIssue}
                    </p>
                  ) : null}
                  <dl className="mt-auto grid grid-cols-2 gap-4 pt-6">
                    {metrics.map((metric) => (
                      <ServiceMetric key={metric.label} {...metric} />
                    ))}
                  </dl>
                  <div className="mt-5 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-label-md font-semibold text-primary">
                    <span>{t("superAdmin.systemHealthViewDetails")}</span>
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[18px] rtl:rotate-180"
                    >
                      arrow_forward
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {selectedService ? (
        <Modal
          open
          onClose={() => setSelectedService(null)}
          title={selectedService.name}
          maxWidth="max-w-2xl"
          panelClassName="max-h-[min(720px,calc(100dvh-2rem))]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant/20 pb-5">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"
              >
                <span className="material-symbols-outlined text-[24px]">
                  {getServiceIcon(selectedService.name)}
                </span>
              </span>
              <div>
                <p className="text-body-sm text-on-surface-variant">
                  {t("superAdmin.systemHealthLiveDetails")}
                </p>
                <div className="mt-1">
                  <StatusPill
                    value={selectedService.status}
                    label={codeLabel(
                      t,
                      "superAdmin.serviceStatus",
                      selectedService.status,
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          <section className="mt-5">
            <h3 className="text-label-md font-bold uppercase tracking-wider text-on-surface-variant">
              {t("superAdmin.systemHealthOverview")}
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-4 rounded-xl border border-outline-variant/30 p-4 sm:grid-cols-4">
              <ServiceMetric
                label={t("superAdmin.systemHealthStatus")}
                value={codeLabel(
                  t,
                  "superAdmin.serviceStatus",
                  selectedService.status,
                )}
              />
              {selectedService.latencyMs !== null ? (
                <ServiceMetric
                  label={t("superAdmin.systemHealthLatency")}
                  value={`${selectedService.latencyMs} ms`}
                />
              ) : null}
              {typeof selectedService.details.uptimeMs === "number" ? (
                <ServiceMetric
                  label={t("superAdmin.systemHealthUptime")}
                  value={formatDurationMs(selectedService.details.uptimeMs)}
                />
              ) : null}
              <ServiceMetric
                label={t("superAdmin.systemHealthCheckedAt")}
                value={formatCheckedAt(selectedService.checkedAt, intlLocale)}
              />
            </dl>
          </section>

          {getWorkerIssueLabel(t, selectedService.details.reason) ? (
            <p
              role="status"
              className="mt-4 rounded-xl border border-error/20 bg-error-container/50 px-3 py-2 text-body-sm text-on-error-container"
            >
              {getWorkerIssueLabel(t, selectedService.details.reason)}
            </p>
          ) : null}

          {selectedService.name === "Background workers" ? (
            <div className="mt-5">
              <WorkerSections details={selectedService.details} t={t} />
            </div>
          ) : (
            <section className="mt-5">
              <dl className="divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30 px-3">
                {Object.entries(selectedService.details)
                  .filter(([key]) => key !== "uptimeMs" && key !== "reason")
                  .map(([key, value]) => (
                    <DetailRows key={key} entries={[[key, value]]} t={t} />
                  ))}
              </dl>
            </section>
          )}
        </Modal>
      ) : null}
    </DashboardPage>
  );
}
