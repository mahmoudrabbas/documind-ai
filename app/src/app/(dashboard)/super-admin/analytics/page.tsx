"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import {
  getAnalyticsOverview,
  getAnalyticsTimeSeries,
  getAnalyticsCostBreakdown,
  getAnalyticsQualityMetrics,
  getAnalyticsInsights,
  type AnalyticsOverviewData,
  type TimeSeriesPoint,
  type CostBreakdownItem,
  type QualityMetricsData,
  type InsightProposal,
} from "@/services/analytics.service";
import { MetricCard } from "../../dashboard/analytics/components/MetricCard";
import { TimeSeriesChart } from "../../dashboard/analytics/components/TimeSeriesChart";
import { CostBreakdownChart } from "../../dashboard/analytics/components/CostBreakdownChart";
import { QualityPanel } from "../../dashboard/analytics/components/QualityPanel";
import { InsightPanel } from "../../dashboard/analytics/components/InsightPanel";
import { AnalyticsFilterBar } from "../../dashboard/analytics/components/AnalyticsFilterBar";
import { ExportButton } from "../../dashboard/analytics/components/ExportButton";

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalStartDateString(daysAgo = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return getLocalDateString(d);
}

export default function SuperAdminAnalyticsPage() {
  const [filters, setFilters] = useState({
    startDate: getLocalStartDateString(30),
    endDate: getLocalDateString(),
    provider: "",
    model: "",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<AnalyticsOverviewData | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdownItem[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetricsData | null>(null);
  const [insights, setInsights] = useState<InsightProposal[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {
        startDate: filters.startDate,
        endDate: filters.endDate,
      };
      if (filters.provider) params.provider = filters.provider;
      if (filters.model) params.model = filters.model;

      const [ovRes, tsRes, cbRes, qmRes] = await Promise.all([
        getAnalyticsOverview(params),
        getAnalyticsTimeSeries(params),
        getAnalyticsCostBreakdown(params),
        getAnalyticsQualityMetrics(params),
      ]);

      setOverview(ovRes.data);
      setTimeSeries(tsRes.data);
      setCostBreakdown(cbRes.data);
      setQualityMetrics(qmRes.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load platform analytics");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadInsights = useCallback(async () => {
    try {
      setLoadingInsights(true);
      const res = await getAnalyticsInsights({
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
      setInsights(res.data);
    } catch {
      // Fallback
    } finally {
      setLoadingInsights(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
    void loadInsights();
  }, [loadData, loadInsights]);

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Platform Analytics & Cross-Tenant Insights"
        description="Global system telemetry, operational cost analysis, and cross-tenant quality monitoring."
        actions={<ExportButton filters={{ startDate: filters.startDate, endDate: filters.endDate }} />}
      />

      <AnalyticsFilterBar
        startDate={filters.startDate}
        endDate={filters.endDate}
        provider={filters.provider}
        model={filters.model}
        onFilterChange={setFilters}
      />

      {error && (
        <DashboardPanel className="mb-6 border-rose-200 bg-rose-50/50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={loadData}
              className="rounded bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-200 dark:bg-rose-900 dark:text-rose-200"
            >
              Retry
            </button>
          </div>
        </DashboardPanel>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              title="Platform Queries"
              value={overview?.totalQueries?.toLocaleString() || "0"}
              changePct={overview?.trends?.queriesChangePct}
              subtitle="All tenants combined"
            />
            <MetricCard
              title="Platform Tokens"
              value={overview?.totalTokens ? `${(overview.totalTokens / 1000).toFixed(1)}k` : "0"}
              changePct={overview?.trends?.tokensChangePct}
              subtitle="Global token consumption"
            />
            <MetricCard
              title="Provider Cost"
              value={`$${overview?.totalCostUsd?.toFixed(2) || "0.00"}`}
              changePct={overview?.trends?.costChangePct}
              costTypeBadge={overview?.costType}
              freshnessLabel="Reconciled"
            />
            <MetricCard
              title="Avg Latency"
              value={`${overview?.avgLatencyMs || 0}ms`}
              changePct={overview?.trends?.latencyChangePct}
              subtitle="System-wide SLA"
            />
            <MetricCard
              title="Quota Drift"
              value={overview?.reconciliationDriftCount || 0}
              subtitle="Entitlement discrepancies"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <TimeSeriesChart data={timeSeries} metricKey="queries" title="Global Platform Traffic" />
            </div>
            <div>
              <CostBreakdownChart data={costBreakdown} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {qualityMetrics && <QualityPanel metrics={qualityMetrics} />}
            <InsightPanel insights={insights} loading={loadingInsights} onRefresh={loadInsights} />
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
