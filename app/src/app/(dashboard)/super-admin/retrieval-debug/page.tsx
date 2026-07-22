"use client";
import { useState, useCallback } from "react";
import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { PlatformTable, StatusPill, cell } from "@/components/super-admin/platform-ui";
import { searchRetrievalDebug } from "@/services/super-admin.service";
import type { RetrievalDebugResult } from "@/types/api/super-admin.types";

export default function RetrievalDebugPage() {
  const [queryText, setQueryText] = useState("");
  const [topK, setTopK] = useState(10);
  const [method, setMethod] = useState<"hybrid" | "vector" | "keyword">("hybrid");
  const [result, setResult] = useState<RetrievalDebugResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!queryText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchRetrievalDebug({ queryText: queryText.trim(), topK, method });
      setResult(data.data);
    } catch {
      setError("Failed to execute retrieval search");
    } finally {
      setLoading(false);
    }
  }, [queryText, topK, method]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch],
  );

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Retrieval Debug"
        description="Inspect and debug the hybrid retrieval pipeline"
      />

      {error && (
        <div className="mb-4 rounded border border-error/20 bg-error-container p-4 text-sm text-on-error-container">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-outline bg-white p-6">
        <div className="mb-4">
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter search query..."
            disabled={loading}
            className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-2.5 text-sm text-on-surface outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-label-sm text-on-surface-variant">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as "hybrid" | "vector" | "keyword")}
              disabled={loading}
              className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="hybrid">Hybrid</option>
              <option value="vector">Vector</option>
              <option value="keyword">Keyword</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-label-sm text-on-surface-variant">Top K</label>
            <input
              type="number"
              min={1}
              max={100}
              value={topK}
              onChange={(e) => setTopK(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
              disabled={loading}
              className="w-24 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !queryText.trim()}
            className="rounded-lg bg-primary px-6 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="p-8 text-center text-sm text-on-surface-variant">
          Searching...
        </div>
      )}

      {result && !loading && (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="rounded-lg bg-surface-container p-3 text-xs">
              <span className="block text-on-surface-variant">Total Latency</span>
              <span className="text-title-md font-bold text-on-surface">
                {result.diagnostics.totalLatencyMs}ms
              </span>
            </div>
            <div className="rounded-lg bg-surface-container p-3 text-xs">
              <span className="block text-on-surface-variant">Vector Candidates</span>
              <span className="text-title-md font-bold text-on-surface">
                {result.diagnostics.vectorCandidateCount}
              </span>
            </div>
            <div className="rounded-lg bg-surface-container p-3 text-xs">
              <span className="block text-on-surface-variant">Keyword Candidates</span>
              <span className="text-title-md font-bold text-on-surface">
                {result.diagnostics.keywordCandidateCount}
              </span>
            </div>
            <div className="rounded-lg bg-surface-container p-3 text-xs">
              <span className="block text-on-surface-variant">Trace ID</span>
              <span className="font-mono text-title-sm text-on-surface">
                {result.diagnostics.traceId}
              </span>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded bg-surface-container p-2 text-xs">
              Tenant filter: {result.filterSummary.tenantFilter ? "ON" : "OFF"}
            </span>
            <span className="rounded bg-surface-container p-2 text-xs">
              Role filter: {result.filterSummary.roleFilter}
            </span>
            <span className="rounded bg-surface-container p-2 text-xs">
              Version filter: {result.filterSummary.versionFilter ? "ON" : "OFF"}
            </span>
            {result.filterSummary.permissionScopes.map((scope) => (
              <span key={scope} className="rounded bg-surface-container p-2 text-xs">
                Scope: {scope}
              </span>
            ))}
            {result.filterSummary.explicitFilters.map((filter) => (
              <span key={filter} className="rounded bg-surface-container p-2 text-xs">
                Filter: {filter}
              </span>
            ))}
          </div>

          {result.candidates.length === 0 ? (
            <div className="p-8 text-center text-sm text-on-surface-variant">
              No matching chunks found
            </div>
          ) : (
            <PlatformTable
              headers={["Score", "Method", "Page", "Section", "Classification", "Snippet"]}
              minWidth="920px"
            >
              {result.candidates.map((candidate, index) => (
                <tr key={`${candidate.chunkId}-${index}`}>
                  <td className={cell}>
                    <span className="font-mono text-sm text-on-surface">
                      {candidate.score.toFixed(3)}
                    </span>
                  </td>
                  <td className={cell}>
                    <StatusPill value={candidate.retrievalMethod} />
                  </td>
                  <td className={cell}>
                    {candidate.pageNumber ?? "-"}
                  </td>
                  <td className={cell}>
                    <span className="max-w-32 truncate block">
                      {candidate.sectionTitle ?? "-"}
                    </span>
                  </td>
                  <td className={cell}>
                    {candidate.classification ? (
                      <StatusPill value={candidate.classification} />
                    ) : (
                      <span className="text-xs text-on-surface-variant">-</span>
                    )}
                  </td>
                  <td className={cell}>
                    <p className="max-w-sm truncate text-xs text-on-surface-variant">
                      {candidate.text.length > 150
                        ? `${candidate.text.slice(0, 150)}...`
                        : candidate.text}
                    </p>
                  </td>
                </tr>
              ))}
            </PlatformTable>
          )}
        </>
      )}
    </DashboardPage>
  );
}
