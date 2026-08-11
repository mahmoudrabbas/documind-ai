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
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

const loadEvents = (signal?: AbortSignal) =>
  listPaymentEvents({ page: 1, pageSize: 50 }, signal);

export default function PaymentDiagnosticsPage() {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
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
        setNotice(t("superAdmin.payments.reprocessed", { eventId }));
        await state.reload();
      } catch {
        setNotice(t("superAdmin.payments.reprocessFailed"));
      }
    },
    [canManage, state, t],
  );

  const handleReconcile = useCallback(async () => {
    if (!canManage || reconciling) return;
    setNotice("");
    setReconciling(true);
    try {
      const result = await triggerReconciliation();
      setReconResult(result.data);
      setNotice(result.data.subscriptionIndex.status === "READY"
        ? t("superAdmin.payments.reconcileComplete", {
            mismatches: String(result.data.subscriptions.mismatched.length),
            transitions: String(result.data.refundSettlements.transitionsCompleted),
          })
        : t("superAdmin.payments.reconcileMigrationRequired"));
    } catch {
      setNotice(t("superAdmin.payments.reconcileFailed"));
    } finally {
      setReconciling(false);
    }
  }, [canManage, reconciling, t]);

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.payments.title")}
        description={t("superAdmin.payments.desc")}
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
            {reconciling ? t("superAdmin.payments.reconciling") : t("superAdmin.payments.runReconciliation")}
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
            {t("superAdmin.payments.reconcileResultsTitle")}
          </h2>
          <p className="text-sm text-on-surface-variant">
            {t("superAdmin.payments.reconcileSubscriptionsLine", {
              examined: String(reconResult.subscriptions.examined),
              mismatches: String(reconResult.subscriptions.mismatched.length),
            })}
          </p>
          <p className="text-sm text-on-surface-variant">
            {t("superAdmin.payments.reconcileIndexLine", {
              status: codeLabel(t, "superAdmin.indexStatus", reconResult.subscriptionIndex.status),
              duplicates: String(reconResult.subscriptionIndex.effectiveDuplicateTenantCount),
            })}
          </p>
          <p className="text-sm text-on-surface-variant">
            {t("superAdmin.payments.reconcileRefundsLine", {
              examined: String(reconResult.refundSettlements.examined),
              eligible: String(reconResult.refundSettlements.eligibleForTransitionRepair),
              completed: String(reconResult.refundSettlements.transitionsCompleted),
              retryable: String(reconResult.providerCancellations.retryable),
            })}
          </p>
          <p className="text-sm text-on-surface-variant">
            {t("superAdmin.payments.reconcileInvoicesLine", {
              examined: String(reconResult.invoices.examined),
              created: String(reconResult.invoices.created),
              updated: String(reconResult.invoices.updated),
              failed: String(reconResult.invoices.failed),
            })}
          </p>
          {reconResult.invoices.failures?.length ? (
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-on-surface-variant">
              {reconResult.invoices.failures.map((failure) => (
                <li key={`${failure.code}:${failure.classification}`}>
                  {failure.retryable
                    ? t("superAdmin.payments.invoiceFailureRetryable", {
                        classification: failure.classification,
                        count: String(failure.count),
                        code: failure.code,
                      })
                    : t("superAdmin.payments.invoiceFailure", {
                        classification: failure.classification,
                        count: String(failure.count),
                        code: failure.code,
                      })}
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
                  <strong>{t("superAdmin.payments.mismatchTenantLabel")}</strong>{" "}
                  {String(m.tenantId)} —{" "}
                  <strong>{t("superAdmin.payments.mismatchStatusLabel")}</strong>{" "}
                  {codeLabel(t, "superAdmin.subsStatus", String(m.localStatus))} —{" "}
                  <strong>{t("superAdmin.payments.mismatchIssuesLabel")}</strong>{" "}
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
            t("superAdmin.payments.tableEventId"),
            t("superAdmin.payments.tableType"),
            t("superAdmin.tableStatus"),
            t("superAdmin.payments.tableErrors"),
            t("superAdmin.payments.tableProcessed"),
            t("superAdmin.payments.tableActions"),
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
                <StatusPill
                  value={event.status}
                  label={codeLabel(t, "superAdmin.payments.eventStatus", event.status)}
                />
              </td>
              <td className="cell max-w-[200px] truncate text-xs">
                {event.processingErrors?.length
                  ? event.processingErrors.join("; ")
                  : "—"}
              </td>
              <td className="cell text-xs">
                {event.processedAt
                  ? new Date(event.processedAt).toLocaleString(intlLocale)
                  : "—"}
              </td>
              <td className="cell">
                {canManage && event.status === "failed" ? (
                  <button
                    type="button"
                    onClick={() => void handleReprocess(event.eventId)}
                    className="rounded bg-primary px-2 py-1 text-xs font-bold text-on-primary"
                  >
                    {t("superAdmin.payments.reprocessButton")}
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
