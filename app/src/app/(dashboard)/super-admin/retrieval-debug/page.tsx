"use client";
import { useState, useCallback } from "react";
import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { PlatformTable, StatusPill, cell } from "@/components/super-admin/platform-ui";
import { IdCell } from "@/components/ui";
import { searchRetrievalDebug } from "@/services/super-admin.service";
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import type { RetrievalDebugResult } from "@/types/api/super-admin.types";

export default function RetrievalDebugPage() {
  const { t } = useI18n();
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
      setError(t("superAdmin.retrievalDebug.searchError"));
    } finally {
      setLoading(false);
    }
  }, [queryText, t, topK, method]);

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
        title={t("superAdmin.retrievalDebug.title")}
        description={t("superAdmin.retrievalDebug.desc")}
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
            placeholder={t("superAdmin.retrievalDebug.queryPlaceholder")}
            disabled={loading}
            className="w-full rounded-lg border border-outline-variant bg-surface px-4 py-2.5 text-sm text-on-surface outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-label-sm text-on-surface-variant">
              {t("superAdmin.retrievalDebug.method")}
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as "hybrid" | "vector" | "keyword")}
              disabled={loading}
              className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="hybrid">
                {codeLabel(t, "superAdmin.retrievalMethod", "hybrid")}
              </option>
              <option value="vector">
                {codeLabel(t, "superAdmin.retrievalMethod", "vector")}
              </option>
              <option value="keyword">
                {codeLabel(t, "superAdmin.retrievalMethod", "keyword")}
              </option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-label-sm text-on-surface-variant">
              {t("superAdmin.retrievalDebug.topK")}
            </label>
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
            {loading
              ? t("superAdmin.retrievalDebug.searching")
              : t("common.search")}
          </button>
        </div>
      </div>

      {loading && (
        <div className="p-8 text-center text-sm text-on-surface-variant">
          {t("superAdmin.retrievalDebug.searching")}
        </div>
      )}

      {result && !loading && (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="rounded-lg bg-surface-container p-3 text-xs">
              <span className="block text-on-surface-variant">
                {t("superAdmin.retrievalDebug.totalLatency")}
              </span>
              <span className="text-title-md font-bold text-on-surface">
                {t("superAdmin.retrievalDebug.latencyMs", {
                  value: String(result.diagnostics.totalLatencyMs),
                })}
              </span>
            </div>
            <div className="rounded-lg bg-surface-container p-3 text-xs">
              <span className="block text-on-surface-variant">
                {t("superAdmin.retrievalDebug.vectorCandidates")}
              </span>
              <span className="text-title-md font-bold text-on-surface">
                {result.diagnostics.vectorCandidateCount}
              </span>
            </div>
            <div className="rounded-lg bg-surface-container p-3 text-xs">
              <span className="block text-on-surface-variant">
                {t("superAdmin.retrievalDebug.keywordCandidates")}
              </span>
              <span className="text-title-md font-bold text-on-surface">
                {result.diagnostics.keywordCandidateCount}
              </span>
            </div>
            <div className="rounded-lg bg-surface-container p-3 text-xs">
              <span className="block text-on-surface-variant">
                {t("superAdmin.retrievalDebug.traceId")}
              </span>
              <span className="font-mono text-title-sm text-on-surface">
                <IdCell value={result.diagnostics.traceId} />
              </span>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded bg-surface-container p-2 text-xs">
              {t("superAdmin.retrievalDebug.tenantFilter", {
                state: result.filterSummary.tenantFilter
                  ? t("superAdmin.retrievalDebug.filterOn")
                  : t("superAdmin.retrievalDebug.filterOff"),
              })}
            </span>
            <span className="rounded bg-surface-container p-2 text-xs">
              {t("superAdmin.retrievalDebug.roleFilter", {
                role: result.filterSummary.roleFilter,
              })}
            </span>
            <span className="rounded bg-surface-container p-2 text-xs">
              {t("superAdmin.retrievalDebug.versionFilter", {
                state: result.filterSummary.versionFilter
                  ? t("superAdmin.retrievalDebug.filterOn")
                  : t("superAdmin.retrievalDebug.filterOff"),
              })}
            </span>
            {result.filterSummary.permissionScopes.map((scope) => (
              <span key={scope} className="rounded bg-surface-container p-2 text-xs">
                {t("superAdmin.retrievalDebug.scope", { scope })}
              </span>
            ))}
            {result.filterSummary.explicitFilters.map((filter) => (
              <span key={filter} className="rounded bg-surface-container p-2 text-xs">
                {t("superAdmin.retrievalDebug.filter", { filter })}
              </span>
            ))}
          </div>

          {result.candidates.length === 0 ? (
            <div className="p-8 text-center text-sm text-on-surface-variant">
              {t("superAdmin.retrievalDebug.noChunks")}
            </div>
          ) : (
            <PlatformTable
              headers={[
                t("superAdmin.retrievalDebug.tableScore"),
                t("superAdmin.retrievalDebug.method"),
                t("superAdmin.retrievalDebug.tablePage"),
                t("superAdmin.retrievalDebug.tableSection"),
                t("superAdmin.retrievalDebug.tableClassification"),
                t("superAdmin.retrievalDebug.tableSnippet"),
              ]}
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
                    <StatusPill
                      value={candidate.retrievalMethod}
                      label={codeLabel(
                        t,
                        "superAdmin.retrievalMethod",
                        candidate.retrievalMethod,
                      )}
                    />
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
                      <StatusPill
                        value={candidate.classification}
                        label={codeLabel(
                          t,
                          "documents.classificationLevel",
                          candidate.classification,
                        )}
                      />
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

          {result.evidenceBundle && (
            <div className="mt-6">
              <h3 className="text-title-sm font-semibold text-on-surface mb-3">
                {t("superAdmin.retrievalDebug.evidenceBundle")}
              </h3>

              <div className="mb-4 flex flex-wrap gap-3">
                <div className="rounded-lg bg-surface-container p-3 text-xs">
                  <span className="block text-on-surface-variant">
                    {t("superAdmin.retrievalDebug.sufficiency")}
                  </span>
                  <span className={`text-title-md font-bold ${
                    result.evidenceBundle.sufficiency.level === "SUFFICIENT" ? "text-success" :
                    result.evidenceBundle.sufficiency.level === "CONFLICTING" ? "text-error" :
                    result.evidenceBundle.sufficiency.level === "WEAK" ? "text-warning" :
                    "text-on-surface-variant"
                  }`}>
                    {codeLabel(
                      t,
                      "superAdmin.sufficiencyLevel",
                      result.evidenceBundle.sufficiency.level,
                    )}
                  </span>
                </div>
                <div className="rounded-lg bg-surface-container p-3 text-xs">
                  <span className="block text-on-surface-variant">
                    {t("superAdmin.retrievalDebug.inputCandidates")}
                  </span>
                  <span className="text-title-md font-bold text-on-surface">
                    {result.evidenceBundle.inputCandidateCount}
                  </span>
                </div>
                <div className="rounded-lg bg-surface-container p-3 text-xs">
                  <span className="block text-on-surface-variant">
                    {t("superAdmin.retrievalDebug.outputItems")}
                  </span>
                  <span className="text-title-md font-bold text-on-surface">
                    {result.evidenceBundle.items.length}
                  </span>
                </div>
                <div className="rounded-lg bg-surface-container p-3 text-xs">
                  <span className="block text-on-surface-variant">
                    {t("superAdmin.retrievalDebug.tokenBudget")}
                  </span>
                  <span className="text-title-md font-bold text-on-surface">
                    {t("superAdmin.retrievalDebug.tokenBudgetValue", {
                      used: String(result.evidenceBundle.totalTokenCount),
                      max: String(result.evidenceBundle.maxTokenCount),
                    })}
                  </span>
                </div>
                {result.evidenceBundle.conflictGroups.length > 0 && (
                  <div className="rounded-lg bg-error-container/10 border border-error/20 p-3 text-xs">
                    <span className="block text-error">
                      {t("superAdmin.retrievalDebug.conflictsDetected")}
                    </span>
                    <span className="text-title-md font-bold text-error">
                      {result.evidenceBundle.conflictGroups.length}
                    </span>
                  </div>
                )}
              </div>

              {result.evidenceBundle.sufficiency.reasons.length > 0 && (
                <div className="mb-4 rounded-lg bg-surface-container p-3 text-xs text-on-surface-variant">
                  <span className="font-medium text-on-surface">
                    {t("superAdmin.retrievalDebug.reasonsLabel")}{" "}
                  </span>
                  {result.evidenceBundle.sufficiency.reasons.join("; ")}
                </div>
              )}

              <PlatformTable
                headers={[
                  t("superAdmin.retrievalDebug.tableRank"),
                  t("superAdmin.retrievalDebug.tableTotal"),
                  t("superAdmin.retrievalDebug.tableRerank"),
                  t("superAdmin.retrievalDebug.tableSemantic"),
                  t("superAdmin.retrievalDebug.tableExact"),
                  t("superAdmin.retrievalDebug.tableAuthority"),
                  t("superAdmin.subsTableVersion"),
                  t("superAdmin.retrievalDebug.tableExcerpt"),
                ]}
                minWidth="1000px"
              >
                {result.evidenceBundle.items.map((item) => (
                  <tr key={item.rank}>
                    <td className={cell}>
                      <span className="font-mono text-sm font-bold text-on-surface">
                        {t("superAdmin.retrievalDebug.rankValue", {
                          rank: String(item.rank),
                        })}
                      </span>
                    </td>
                    <td className={cell}>
                      <span className="font-mono text-sm text-on-surface">
                        {item.scoreBreakdown.totalScore.toFixed(3)}
                      </span>
                    </td>
                    <td className={cell}>
                      <span className="font-mono text-xs text-on-surface-variant">
                        {item.scoreBreakdown.rerankScore.toFixed(3)}
                      </span>
                    </td>
                    <td className={cell}>
                      <span className="font-mono text-xs text-on-surface-variant">
                        {item.scoreBreakdown.semanticScore.toFixed(3)}
                      </span>
                    </td>
                    <td className={cell}>
                      <span className="font-mono text-xs text-on-surface-variant">
                        {item.scoreBreakdown.exactTermScore.toFixed(3)}
                      </span>
                    </td>
                    <td className={cell}>
                      <span className="font-mono text-xs text-on-surface-variant">
                        {item.scoreBreakdown.sourceAuthorityScore.toFixed(3)}
                      </span>
                    </td>
                    <td className={cell}>
                      <span className="font-mono text-xs text-on-surface-variant">
                        {item.scoreBreakdown.versionPreferenceScore.toFixed(3)}
                      </span>
                    </td>
                    <td className={cell}>
                      <p className="max-w-sm truncate text-xs text-on-surface-variant">
                        {item.textExcerpt.length > 150
                          ? `${item.textExcerpt.slice(0, 150)}...`
                          : item.textExcerpt}
                      </p>
                    </td>
                  </tr>
                ))}
              </PlatformTable>

              {result.evidenceBundle.conflictGroups.length > 0 && (
                <div className="mt-4 rounded-lg border border-error/20 bg-error-container/10 p-4">
                  <h4 className="text-sm font-semibold text-on-error-container mb-2">
                    {t("superAdmin.retrievalDebug.conflictGroups")}
                  </h4>
                  {result.evidenceBundle.conflictGroups.map((group) => (
                    <div key={group.conflictId} className="mb-2 text-xs text-error">
                      <span className="font-mono">{group.conflictId}:</span>{" "}
                      {t("superAdmin.retrievalDebug.conflictDetail", {
                        description: group.description,
                        items: group.itemIndices.join(", "),
                      })}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-lg bg-surface-container p-3 text-xs text-on-surface-variant">
                <span className="font-medium text-on-surface">
                  {t("superAdmin.retrievalDebug.scoreExplanation")}{" "}
                </span>
                {result.evidenceBundle.scoreExplanation}
              </div>
            </div>
          )}
        </>
      )}
    </DashboardPage>
  );
}
