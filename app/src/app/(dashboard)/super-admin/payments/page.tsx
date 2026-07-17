"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import {
  PlatformState,
  PlatformTable,
  StatusPill,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import {
  listPaymentEvents,
  reprocessPaymentEvent,
  triggerReconciliation,
} from "@/services/billing.service";

const loadEvents = (signal?: AbortSignal) =>
  listPaymentEvents({ page: 1, pageSize: 50 }, signal);

export default function PaymentDiagnosticsPage() {
  const state = usePlatformData(loadEvents);
  const [notice, setNotice] = useState("");
  const [reconResult, setReconResult] = useState<{
    totalSubscriptions: number;
    mismatched: Array<Record<string, unknown>>;
  } | null>(null);

  const handleReprocess = useCallback(
    async (eventId: string) => {
      setNotice("");
      try {
        await reprocessPaymentEvent(eventId);
        setNotice(`Event ${eventId} reprocessed.`);
        await state.reload();
      } catch {
        setNotice("Failed to reprocess event.");
      }
    },
    [state],
  );

  const handleReconcile = useCallback(async () => {
    setNotice("");
    try {
      const result = await triggerReconciliation();
      setReconResult(result.data);
      setNotice(
        `Reconciliation complete. ${result.data.mismatched.length} mismatches found.`,
      );
    } catch {
      setNotice("Reconciliation failed.");
    }
  }, []);

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Payment Diagnostics"
        description="Monitor webhook events, reprocess failures, and reconcile subscription state."
      />

      <DashboardPanel className="mb-5">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleReconcile()}
            className="min-h-10 rounded-lg bg-primary px-4 font-bold text-on-primary"
          >
            Run reconciliation
          </button>
        </div>
        {notice ? (
          <p className="mt-3 text-sm" aria-live="polite">
            {notice}
          </p>
        ) : null}
      </DashboardPanel>

      {reconResult ? (
        <DashboardPanel className="mb-5">
          <h2 className="text-title-md font-bold text-on-surface">
            Reconciliation results
          </h2>
          <p className="text-sm text-on-surface-variant">
            {reconResult.totalSubscriptions} subscriptions checked,{" "}
            {reconResult.mismatched.length} mismatches
          </p>
          {reconResult.mismatched.length > 0 ? (
            <div className="mt-3 space-y-2">
              {reconResult.mismatched.map((m, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-error/20 bg-error-container/10 p-3 text-sm"
                >
                  <strong>Tenant:</strong> {String(m.tenantId)} —{" "}
                  <strong>Status:</strong> {String(m.localStatus)} —{" "}
                  <strong>Issues:</strong>{" "}
                  {(m.issues as string[]).join("; ")}
                </div>
              ))}
            </div>
          ) : null}
        </DashboardPanel>
      ) : null}

      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />

      {state.data ? (
        <PlatformTable
          headers={[
            "Event ID",
            "Type",
            "Status",
            "Errors",
            "Processed",
            "Actions",
          ]}
          minWidth="900px"
        >
          {state.data.events.map((event) => (
            <tr key={event._id}>
              <td className="cell max-w-[200px] truncate font-mono text-xs">
                {event.eventId}
              </td>
              <td className="cell">{event.eventType}</td>
              <td className="cell">
                <StatusPill value={event.status} />
              </td>
              <td className="cell max-w-[200px] truncate text-xs">
                {event.processingErrors?.length
                  ? event.processingErrors.join("; ")
                  : "—"}
              </td>
              <td className="cell text-xs">
                {event.processedAt
                  ? new Date(event.processedAt).toLocaleString()
                  : "—"}
              </td>
              <td className="cell">
                {event.status === "failed" ? (
                  <button
                    type="button"
                    onClick={() => void handleReprocess(event.eventId)}
                    className="rounded bg-primary px-2 py-1 text-xs font-bold text-on-primary"
                  >
                    Reprocess
                  </button>
                ) : (
                  <span className="text-xs text-on-surface-variant">—</span>
                )}
              </td>
            </tr>
          ))}
        </PlatformTable>
      ) : null}
    </DashboardPage>
  );
}
