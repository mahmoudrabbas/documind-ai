"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { DashboardPanel } from "@/components/ui/DashboardPage";
import { useI18n } from "@/providers/i18n-provider";

export function usePlatformData<T>(
  loader: (signal?: AbortSignal) => Promise<{ data: T }>,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  /* Holds a translation key, not a sentence — `PlatformState` renders it
     through `t()` so the message follows the active locale. */
  const [error, setError] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        setData((await loader(signal)).data);
      } catch {
        if (!signal?.aborted) setError("superAdmin.loadError");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [loader],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  return { data, loading, error, reload: () => load() };
}

export function PlatformState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  if (loading)
    return (
      <DashboardPanel>
        <div className="space-y-3" role="status">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-14 animate-pulse rounded-xl bg-surface-container"
            />
          ))}
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      </DashboardPanel>
    );
  if (error)
    return (
      <DashboardPanel>
        <div
          role="alert"
          className="rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container"
        >
          <p>{t(error)}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 min-h-10 rounded-lg bg-error px-4 py-2 font-bold text-on-error"
          >
            {t("common.retry")}
          </button>
        </div>
      </DashboardPanel>
    );
  return null;
}

export function PlatformTable({
  headers,
  children,
  minWidth = "760px",
}: {
  headers: string[];
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <DashboardPanel padding="none">
      <div className="max-w-full overflow-x-auto">
        <table
          className="w-full border-collapse text-start text-sm"
          style={{ minWidth }}
        >
          <thead className="border-b border-outline-variant/30 bg-surface-container-low">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {children}
          </tbody>
        </table>
      </div>
    </DashboardPanel>
  );
}

/**
 * Status pill for platform tables.
 *
 * `value` is the untranslated machine code — it drives the colour and must
 * never receive a translated string, exactly as with `<Badge status>`.
 * Pass display text through `label` (typically `codeLabel(t, ns, value)`);
 * it falls back to the humanised code so untranslated call sites are
 * unchanged.
 */
export function StatusPill({ value, label }: { value: string; label?: ReactNode }) {
  const positive = ["active", "healthy", "processed", "connected"].includes(
    value,
  );
  const negative = [
    "failed",
    "suspended",
    "cancelled",
    "unavailable",
    "degraded",
  ].includes(value);
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${positive ? "bg-tertiary-container/20 text-on-tertiary-container" : negative ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface-variant"}`}
    >
      {label ?? value.replaceAll("_", " ")}
    </span>
  );
}

export const cell = "px-4 py-4 align-top text-on-surface-variant";
