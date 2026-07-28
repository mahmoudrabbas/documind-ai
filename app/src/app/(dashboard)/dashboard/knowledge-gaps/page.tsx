"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { getKnowledgeGaps, getKnowledgeGapMetrics } from "@/services/knowledge-gaps.service";
import { useAuth } from "@/providers/auth-provider";
import type { KnowledgeGap, GapMetrics, GapStatus, GapSeverity } from "@/types/api/knowledge-gaps.types";
import { GapStatusBadge } from "./components/GapStatusBadge";
import { GapSeverityBadge } from "./components/GapSeverityBadge";
import { GapMetricsCards } from "./components/GapMetricsCards";

export default function KnowledgeGapsPage() {
  const auth = useAuth();
  const isEmployee = auth.user?.role === "EMPLOYEE";
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [metrics, setMetrics] = useState<GapMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchGaps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [gapsRes, metricsRes] = await Promise.all([
        getKnowledgeGaps({
          page,
          pageSize: 15,
          status: (statusFilter as GapStatus) || undefined,
          severity: (severityFilter as GapSeverity) || undefined,
          search: search.trim() || undefined,
        }),
        getKnowledgeGapMetrics().catch(() => ({ metrics: null })),
      ]);

      setGaps(gapsRes.gaps);
      setTotal(gapsRes.total);
      if (metricsRes.metrics) setMetrics(metricsRes.metrics);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge gaps");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, severityFilter, search]);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  return (
    <DashboardPage>
      <DashboardPageHeader
        eyebrow={
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <span className="material-symbols-outlined text-[16px]">psychology</span>
            Knowledge Intelligence
          </div>
        }
        title="Knowledge Gaps"
        description={
          isEmployee
            ? "Showing Knowledge Gaps assigned to you for resolution."
            : "Identify unanswered and weak questions, triage high-impact gaps, and assign team resolution."
        }
      />

      <GapMetricsCards metrics={metrics} loading={loading} />

      <DashboardPanel>
        {/* Filter bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" id="gap-filter-bar">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              id="gap-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search gaps..."
              className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary sm:w-64"
            />

            <select
              id="gap-status-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="triaged">Triaged</option>
              <option value="assigned">Assigned</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="reopened">Reopened</option>
            </select>

            <select
              id="gap-severity-select"
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <button
            type="button"
            id="gap-refresh-btn"
            onClick={() => fetchGaps()}
            className="inline-flex items-center gap-1 self-end rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh
          </button>
        </div>

        {/* Content State */}
        {loading ? (
          <div className="mt-6 space-y-3" id="gap-loading-skeleton">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-container/50" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-error/20 bg-error/5 p-6 text-center" id="gap-error-state">
            <span className="material-symbols-outlined text-[32px] text-error">error</span>
            <p className="mt-2 text-sm font-semibold text-error">{error}</p>
            <button
              type="button"
              onClick={() => fetchGaps()}
              className="mt-3 rounded-lg bg-error px-4 py-1.5 text-xs font-semibold text-on-error hover:bg-error/90"
            >
              Retry
            </button>
          </div>
        ) : gaps.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface p-8 text-center" id="gap-empty-state">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant">search_off</span>
            <h3 className="mt-2 text-title-md font-bold text-on-surface">No knowledge gaps found</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              Unanswered or negatively-rated questions will automatically appear here as gap candidates.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto" id="gap-table-container">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-outline-variant/30 text-on-surface-variant font-semibold">
                  <th className="py-3 px-2">Topic & Question</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2">Severity</th>
                  <th className="py-3 px-2">Department</th>
                  <th className="py-3 px-2 text-center">Occurrences</th>
                  <th className="py-3 px-2">Last Seen</th>
                  <th className="py-3 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {gaps.map((gap) => (
                  <tr key={gap.id} className="hover:bg-surface-container/30 transition-colors" id={`gap-row-${gap.id}`}>
                    <td className="py-3 px-2 max-w-md">
                      <Link
                        href={`/dashboard/knowledge-gaps/${gap.id}`}
                        className="font-semibold text-primary hover:underline line-clamp-1"
                      >
                        {gap.topic}
                      </Link>
                      <p className="text-on-surface-variant text-[11px] line-clamp-1 mt-0.5">
                        &ldquo;{gap.representativeQuestion}&rdquo;
                      </p>
                    </td>
                    <td className="py-3 px-2">
                      <GapStatusBadge status={gap.status} />
                    </td>
                    <td className="py-3 px-2">
                      <GapSeverityBadge severity={gap.severity} />
                    </td>
                    <td className="py-3 px-2 text-on-surface-variant font-medium">
                      {gap.department || "General"}
                    </td>
                    <td className="py-3 px-2 text-center font-bold text-on-surface">
                      {gap.occurrenceCount}
                    </td>
                    <td className="py-3 px-2 text-on-surface-variant text-[11px]">
                      {new Date(gap.lastOccurrence).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <Link
                        href={`/dashboard/knowledge-gaps/${gap.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 bg-surface px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
                      >
                        View Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {total > 15 && (
              <div className="mt-4 flex items-center justify-between border-t border-outline-variant/30 pt-3 text-xs">
                <span className="text-on-surface-variant">
                  Showing {(page - 1) * 15 + 1}–{Math.min(page * 15, total)} of {total} gaps
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-outline-variant/40 px-3 py-1 font-semibold text-on-surface disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page * 15 >= total}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-outline-variant/40 px-3 py-1 font-semibold text-on-surface disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </DashboardPanel>
    </DashboardPage>
  );
}
