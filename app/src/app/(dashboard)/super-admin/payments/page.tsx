"use client";

import { useState, useCallback } from "react";
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
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";

const loadEvents = (signal?: AbortSignal) =>
  listPaymentEvents({ page: 1, pageSize: 50 }, signal);

export default function PaymentDiagnosticsPage() {
  const permissions = usePermissions();
  const canManage = permissions.can(Permission.BILLING_MANAGE);
  const state = usePlatformData(loadEvents);
  const [notice, setNotice] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconResult, setReconResult] = useState<{
    subscriptions: { examined: number; mismatched: Array<Record<string, unknown>> };
    invoices: {
      examined: number; created: number; updated: number; failed: number;
      failures?: Array<{ code: string; count: number; classification: string; retryable: boolean }>;
      retry?: { status: "NONE" | "RETRY_PENDING"; retryableFailureCount: number };
    };
    refundSettlements: { indexInvariant: { status: "READY" | "MIGRATION_REQUIRED"; issues: string[]; effectiveDuplicateTenantCount: number }; examined: number; eligibleForTransitionRepair: number; transitionOperationsCreated: number; transitionsCompleted: number; transitionsRetryable: number; failed: number };
    subscriptionIndex: { status: "READY" | "MIGRATION_REQUIRED"; issues: string[]; effectiveDuplicateTenantCount: number };
    providerCancellations: { created: number; confirmed: number; retryable: number };
  } | null>(null);

  const handleReprocess = useCallback(
    async (eventId: string) => {
      if (!canManage) return;
      setNotice("");
      try {
        await reprocessPaymentEvent(eventId);
        setNotice(`Event ${eventId} reprocessed.`);
        await state.reload();
      } catch {
        setNotice("Failed to reprocess event.");
      }
    },
    [canManage, state],
  );

  const handleReconcile = useCallback(async () => {
    if (!canManage || reconciling) return;
    setNotice("");
    setReconciling(true);
    try {
      const result = await triggerReconciliation();
      setReconResult(result.data);
      setNotice(result.data.subscriptionIndex.status === "READY"
        ? `Reconciliation complete. ${result.data.subscriptions.mismatched.length} subscription mismatches found; ${result.data.refundSettlements.transitionsCompleted} refund transitions completed.`
        : "Subscription index migration is required before refund transitions can be repaired.");
    } catch {
      setNotice("Reconciliation failed.");
    } finally {
      setReconciling(false);
    }
  }, [canManage, reconciling]);

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Payment Diagnostics"
        description="Monitor webhook events, reprocess failures, and reconcile subscription state."
      />

      {canManage ? (
      <DashboardPanel className="mb-5">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={reconciling}
            aria-busy={reconciling}
            onClick={() => void handleReconcile()}
            className="min-h-10 rounded-lg bg-primary px-4 font-bold text-on-primary disabled:opacity-60"
          >
            {reconciling ? "Reconciling…" : "Run reconciliation"}
          </button>
        </div>
        {notice ? (
          <p className="mt-3 text-sm" aria-live="polite">
            {notice}
          </p>
        ) : null}
      </DashboardPanel>
      ) : null}

      {reconResult ? (
        <DashboardPanel className="mb-5">
          <h2 className="text-title-md font-bold text-on-surface">
            Reconciliation results
          </h2>
          <p className="text-sm text-on-surface-variant">
            {reconResult.subscriptions.examined} subscriptions checked,{" "}
            {reconResult.subscriptions.mismatched.length} mismatches
          </p>
          <p className="text-sm text-on-surface-variant">
            Subscription index: {reconResult.subscriptionIndex.status}; effective duplicate tenants: {reconResult.subscriptionIndex.effectiveDuplicateTenantCount}
          </p>
          <p className="text-sm text-on-surface-variant">
            Refund settlements examined: {reconResult.refundSettlements.examined}; eligible repairs: {reconResult.refundSettlements.eligibleForTransitionRepair}; transitions completed: {reconResult.refundSettlements.transitionsCompleted}; provider cancellations retryable: {reconResult.providerCancellations.retryable}
          </p>
          <p className="text-sm text-on-surface-variant">
            Invoices examined: {reconResult.invoices.examined}; created: {reconResult.invoices.created}; updated: {reconResult.invoices.updated}; failed: {reconResult.invoices.failed}
          </p>
          {reconResult.invoices.failures?.length ? (
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-on-surface-variant">
              {reconResult.invoices.failures.map((failure) => (
                <li key={`${failure.code}:${failure.classification}`}>
                  {failure.classification}: {failure.count} ({failure.code}){failure.retryable ? " — retry pending" : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {reconResult.subscriptions.mismatched.length > 0 ? (
            <div className="mt-3 space-y-2">
              {reconResult.subscriptions.mismatched.map((m, i) => (
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
                {canManage && event.status === "failed" ? (
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
