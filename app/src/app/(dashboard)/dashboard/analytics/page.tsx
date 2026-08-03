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
import { MetricCard } from "./components/MetricCard";
import { TimeSeriesChart } from "./components/TimeSeriesChart";
import { CostBreakdownChart } from "./components/CostBreakdownChart";
import { QualityPanel } from "./components/QualityPanel";
import { InsightPanel } from "./components/InsightPanel";
import { AnalyticsFilterBar } from "./components/AnalyticsFilterBar";
import { ExportButton } from "./components/ExportButton";

function SkeletonCard() {
  return (
    <div className="flex h-28 min-w-0 animate-pulse flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <div className="h-4 w-1/2 rounded bg-surface-container-high" />
      <div className="h-7 w-2/3 rounded bg-surface-container-high" />
      <div className="h-3 w-1/3 rounded bg-surface-container-high" />
    </div>
  );
}

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

export default function AnalyticsPage() {
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
      setError(err instanceof Error ? err.message : "Failed to load analytics data");
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
        title="Token, Cost & Quality Analytics"
        description="Real-time operational telemetry, LLM token expenditure, and AI quality metrics across your organization."
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
        <DashboardPanel className="mt-4">
          <div
            role="alert"
            className="flex items-center justify-between rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container"
          >
            <p className="text-body-md font-medium">{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="min-h-9 rounded-lg bg-error px-4 py-1.5 text-label-md font-bold text-on-error transition-opacity hover:opacity-90"
            >
              Retry
            </button>
          </div>
        </DashboardPanel>
      )}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              title="Total Queries"
              value={overview?.totalQueries?.toLocaleString() || "0"}
              changePct={overview?.trends?.queriesChangePct}
              subtitle="Questions asked"
              icon="quiz"
            />
            <MetricCard
              title="Total Tokens"
              value={overview?.totalTokens ? `${(overview.totalTokens / 1000).toFixed(1)}k` : "0"}
              changePct={overview?.trends?.tokensChangePct}
              subtitle="Input & Output tokens"
              icon="token"
            />
            <MetricCard
              title="Operational Cost"
              value={`$${overview?.totalCostUsd?.toFixed(2) || "0.00"}`}
              changePct={overview?.trends?.costChangePct}
              costTypeBadge={overview?.costType}
              freshnessLabel="Live"
              icon="payments"
            />
            <MetricCard
              title="Avg Latency"
              value={`${overview?.avgLatencyMs || 0}ms`}
              changePct={overview?.trends?.latencyChangePct}
              subtitle="End-to-end response"
              icon="speed"
            />
            <MetricCard
              title="Quality Index"
              value={`${overview?.qualityScore || 100}%`}
              subtitle="Aggregate AI quality score"
              icon="verified"
            />
          </div>

          {/* Time Series & Cost Breakdown Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <TimeSeriesChart data={timeSeries} metricKey="queries" title="Daily Query Volume & Activity" />
            </div>
            <div>
              <CostBreakdownChart data={costBreakdown} />
            </div>
          </div>

          {/* Quality Panel & AI Insight Proposals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {qualityMetrics && <QualityPanel metrics={qualityMetrics} />}
            <InsightPanel insights={insights} loading={loadingInsights} onRefresh={loadInsights} />
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
