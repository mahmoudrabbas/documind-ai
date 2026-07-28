"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionBoundary } from "@/components/auth/permission-boundary";
import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { ApiError } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { usePermissions } from "@/providers/permission-provider";
import { createBillingPortalSession, getBillingSummary, getInvoiceLinks, listInvoices } from "@/services/billing.service";
import type { BillingInvoice, BillingPortalFlow, Pagination, SubscriptionStatus } from "@/types/api/billing.types";
import { Permission } from "@/types/api/permissions.types";

type Loadable<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: T };

export function CompanyBillingPage() {
  return <PermissionBoundary permissions={[Permission.BILLING_READ]}><BillingContent /></PermissionBoundary>;
}

function BillingContent() {
  const { t, locale, dir } = useI18n();
  const permissions = usePermissions();
  const canManage = permissions.can(Permission.BILLING_MANAGE);
  const [summary, setSummary] = useState<Loadable<SubscriptionStatus>>({ kind: "loading" });
  const [invoiceState, setInvoiceState] = useState<Loadable<{ invoices: BillingInvoice[]; pagination: Pagination }>>({ kind: "loading" });
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [portalFlow, setPortalFlow] = useState<BillingPortalFlow | null>(null);
  const [portalError, setPortalError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const portalRequestRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setSummary({ kind: "loading" });
    getBillingSummary(controller.signal).then((response) => setSummary({ kind: "ready", data: response.data })).catch((error) => {
      if (!controller.signal.aborted) setSummary({ kind: "error", message: safeMessage(error, t) });
    });
    return () => controller.abort();
  }, [refresh, t]);

  useEffect(() => {
    const controller = new AbortController();
    setInvoiceState({ kind: "loading" });
    listInvoices({ page, pageSize: 10 }, controller.signal).then((response) => {
      setInvoiceState({ kind: "ready", data: response.data });
      setAnnouncement(t("billingAdmin.refreshSuccess"));
    }).catch((error) => {
      if (!controller.signal.aborted) setInvoiceState({ kind: "error", message: safeMessage(error, t) });
    });
    return () => controller.abort();
  }, [page, refresh, t]);

  useEffect(() => { if (portalError) errorRef.current?.focus(); }, [portalError]);

  const launchPortal = useCallback(async (flow: BillingPortalFlow) => {
    if (portalRequestRef.current) return;
    portalRequestRef.current = true;
    setPortalFlow(flow); setPortalError(""); setAnnouncement(t("billingAdmin.portalOpening"));
    try {
      const response = await createBillingPortalSession(flow);
      window.location.assign(response.data.url);
    } catch (error) {
      setPortalError(safeMessage(error, t));
      setAnnouncement(t("billingAdmin.portalFailed"));
      setPortalFlow(null);
      portalRequestRef.current = false;
    }
  }, [t]);

  const openLinks = useCallback(async (invoice: BillingInvoice) => {
    try {
      setAnnouncement(t("billingAdmin.linkLoading"));
      const response = await getInvoiceLinks(invoice.id);
      const url = response.data.invoicePdfUrl ?? response.data.hostedInvoiceUrl ?? response.data.receiptUrl;
      if (!url) throw new Error("unavailable");
      window.open(url, "_blank", "noopener,noreferrer");
      setAnnouncement(t("billingAdmin.linkOpened"));
    } catch (error) { setAnnouncement(safeMessage(error, t)); }
  }, [t]);

  return (
    <DashboardPage dir={dir}>
      <div className="sr-only" aria-live="polite">{announcement}</div>
      <DashboardPageHeader title={t("billingAdmin.title")} description={t("billingAdmin.description")} actions={<button type="button" onClick={() => setRefresh((value) => value + 1)} className="min-h-11 rounded-xl border border-outline px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t("common.retry")}</button>} />
      {portalError ? <div ref={errorRef} tabIndex={-1} role="alert" className="mb-4 rounded-xl border border-error/40 bg-error-container p-4 text-on-error-container">{portalError}</div> : null}
      <div className="space-y-6">
        <DashboardPanel aria-labelledby="current-subscription-heading">
          <h2 id="current-subscription-heading" className="text-title-lg font-bold">{t("billingAdmin.currentSubscription")}</h2>
          {summary.kind === "loading" ? <Loading label={t("billingAdmin.loadingSummary")} /> : summary.kind === "error" ? <ErrorState message={summary.message} retry={() => setRefresh((value) => value + 1)} label={t("common.retry")} /> : <SubscriptionDetails summary={summary.data} locale={locale} t={t} canManage={canManage} portalFlow={portalFlow} launchPortal={launchPortal} />}
        </DashboardPanel>

        <DashboardPanel padding="none" aria-labelledby="invoice-history-heading">
          <div className="flex items-center justify-between border-b border-outline-variant/30 p-4 sm:p-5"><div><h2 id="invoice-history-heading" className="text-title-lg font-bold">{t("billingAdmin.invoices")}</h2><p className="text-sm text-on-surface-variant">{t("billingAdmin.invoiceDescription")}</p></div></div>
          {invoiceState.kind === "loading" ? <div className="p-5"><Loading label={t("billingAdmin.loadingInvoices")} /></div> : invoiceState.kind === "error" ? <div className="p-5"><ErrorState message={invoiceState.message} retry={() => setRefresh((value) => value + 1)} label={t("common.retry")} /></div> : invoiceState.data.invoices.length === 0 ? <div className="p-8 text-center"><span aria-hidden="true" className="material-symbols-outlined text-4xl">receipt_long</span><h3 className="mt-2 font-bold">{t("billingAdmin.noInvoices")}</h3><p className="text-sm text-on-surface-variant">{t("billingAdmin.noInvoicesDescription")}</p></div> : <InvoiceHistory invoices={invoiceState.data.invoices} pagination={invoiceState.data.pagination} locale={locale} t={t} onLinks={openLinks} setPage={setPage} />}
        </DashboardPanel>
      </div>
    </DashboardPage>
  );
}

function SubscriptionDetails({ summary, locale, t, canManage, portalFlow, launchPortal }: { summary: SubscriptionStatus; locale: string; t: (key: string) => string; canManage: boolean; portalFlow: BillingPortalFlow | null; launchPortal: (flow: BillingPortalFlow) => void }) {
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium" }).format(new Date(value)) : t("billingAdmin.notAvailable");
  return <div className="mt-4 space-y-4">
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Detail label={t("billingAdmin.plan")} value={`${summary.packageId?.name ?? t("billingAdmin.notAvailable")} · v${summary.packageVersion}`} />
      <Detail label={t("billingAdmin.status")} value={t(`billingAdmin.status.${summary.status.toLowerCase()}`)} />
      <Detail label={t("billingAdmin.paymentState")} value={t(`billingAdmin.status.${summary.paymentState.toLowerCase()}`)} />
      <Detail label={t("billingAdmin.period")} value={`${date(summary.currentPeriodStart ?? summary.periodStart)} – ${date(summary.currentPeriodEnd ?? summary.periodEnd)}`} />
    </dl>
    {summary.lifecycle.inGracePeriod ? <p role="status" className="rounded-xl bg-warning-container p-3 text-on-warning-container">{t("billingAdmin.graceWarning")}</p> : null}
    {summary.pendingOperation ? <p role="status" className="rounded-xl bg-secondary-container p-3">{t("billingAdmin.pendingOperation")}</p> : null}
    {!summary.providerLinked ? <p className="rounded-xl bg-surface-container p-3">{t("billingAdmin.notLinked")}</p> : null}
    <div className="flex flex-wrap gap-3">
      {canManage && summary.canOpenPortal ? <button type="button" disabled={portalFlow !== null} onClick={() => launchPortal("general")} className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-on-primary disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{portalFlow === "general" ? t("billingAdmin.opening") : t("billingAdmin.openPortal")}</button> : null}
      {canManage && summary.canUpdatePaymentMethod ? <button type="button" disabled={portalFlow !== null} onClick={() => launchPortal("payment_method_update")} className="min-h-11 rounded-xl border border-outline px-4 font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{portalFlow === "payment_method_update" ? t("billingAdmin.opening") : t("billingAdmin.updatePayment")}</button> : null}
    </div>
  </div>;
}

function InvoiceHistory({ invoices, pagination, locale, t, onLinks, setPage }: { invoices: BillingInvoice[]; pagination: Pagination; locale: string; t: (key: string) => string; onLinks: (invoice: BillingInvoice) => void; setPage: (page: number) => void }) {
  const currentLocale = locale === "ar" ? "ar-EG" : "en-US";
  const money = (invoice: BillingInvoice) => new Intl.NumberFormat(currentLocale, { style: "currency", currency: invoice.currency }).format(invoice.amountDueMinor / 100);
  const date = (value: string) => new Intl.DateTimeFormat(currentLocale, { dateStyle: "medium" }).format(new Date(value));
  return <>
    <div className="hidden overflow-x-auto md:block"><table className="w-full text-start"><thead className="bg-surface-container"><tr><Th>{t("billingAdmin.invoiceNumber")}</Th><Th>{t("billingAdmin.date")}</Th><Th>{t("billingAdmin.status")}</Th><Th>{t("billingAdmin.amount")}</Th><Th>{t("billingAdmin.actions")}</Th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-t border-outline-variant/20"><Td>{invoice.invoiceNumber || "—"}</Td><Td>{date(invoice.createdAt)}</Td><Td>{t(`billingAdmin.status.${invoice.status}`)}</Td><Td>{money(invoice)}</Td><Td><InvoiceAction invoice={invoice} t={t} onLinks={onLinks} /></Td></tr>)}</tbody></table></div>
    <div className="space-y-3 p-4 md:hidden">{invoices.map((invoice) => <article key={invoice.id} className="rounded-2xl border border-outline-variant p-4"><h3 className="font-bold">{invoice.invoiceNumber || t("billingAdmin.invoice")}</h3><dl className="mt-2 grid grid-cols-2 gap-2"><Detail label={t("billingAdmin.date")} value={date(invoice.createdAt)} /><Detail label={t("billingAdmin.amount")} value={money(invoice)} /><Detail label={t("billingAdmin.status")} value={t(`billingAdmin.status.${invoice.status}`)} /></dl><div className="mt-3"><InvoiceAction invoice={invoice} t={t} onLinks={onLinks} /></div></article>)}</div>
    <nav aria-label={t("billingAdmin.pagination")} className="flex items-center justify-between border-t border-outline-variant/30 p-4"><button type="button" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">{t("billingAdmin.previous")}</button><span>{pagination.page} / {Math.max(1, pagination.totalPages)}</span><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">{t("billingAdmin.next")}</button></nav>
  </>;
}

function InvoiceAction({ invoice, t, onLinks }: { invoice: BillingInvoice; t: (key: string) => string; onLinks: (invoice: BillingInvoice) => void }) { return invoice.hostedInvoiceAvailable || invoice.invoicePdfAvailable || invoice.receiptAvailable ? <button type="button" onClick={() => onLinks(invoice)} aria-label={`${t("billingAdmin.openInvoice")} ${invoice.invoiceNumber}`} className="rounded-lg border border-outline px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t("billingAdmin.openInvoice")} <span className="sr-only">{t("billingAdmin.externalLink")}</span></button> : <span className="text-sm text-on-surface-variant">{t("billingAdmin.noLinks")}</span>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-on-surface-variant">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th scope="col" className="px-4 py-3 text-start text-sm font-bold">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-4 py-3 text-sm">{children}</td>; }
function Loading({ label }: { label: string }) { return <div role="status" aria-busy="true" className="animate-pulse space-y-3"><div className="h-5 w-40 rounded bg-surface-container-high"/><div className="h-14 rounded bg-surface-container-high"/><span className="sr-only">{label}</span></div>; }
function ErrorState({ message, retry, label }: { message: string; retry: () => void; label: string }) { return <div role="alert"><p>{message}</p><button type="button" onClick={retry} className="mt-3 rounded-lg border px-3 py-2 font-semibold">{label}</button></div>; }
function safeMessage(error: unknown, t: (key: string) => string): string { if (error instanceof ApiError) { if (error.code === "BILLING_PROVIDER_UNAVAILABLE") return t("billingAdmin.providerUnavailable"); if (error.code === "BILLING_PROVIDER_CONFIGURATION_INVALID") return t("billingAdmin.configurationError"); if (error.status === 403) return t("permissions.deniedMessage"); } return t("billingAdmin.loadError"); }
