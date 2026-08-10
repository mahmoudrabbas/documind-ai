"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { getTenantById } from "@/services/platform.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import type { PlatformTenant } from "@/types/api/platform.types";

export default function PlatformTenantDetailPage() {
  const id = String(useParams<{ id: string }>().id ?? "");
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const [tenant, setTenant] = useState<PlatformTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        setTenant((await getTenantById(id, signal)).data);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(
          caught instanceof ApiError && caught.status === 404
            ? t("superAdmin.platformTenants.notFound")
            : caught instanceof ApiError && caught.status === 400
              ? t("superAdmin.platformTenants.invalidId")
              : t("superAdmin.platformTenants.loadError"),
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id, t],
  );
  useEffect(() => {
    const controller = new AbortController();
    // The request owns subsequent state updates and is cancelled when the ID changes.
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <Link
        href="/platform/tenants"
        className="text-sm font-semibold text-blue-700"
      >
        {t("superAdmin.platformTenants.back")}
      </Link>
      {loading ? (
        <div
          role="status"
          className="mt-8 h-40 animate-pulse rounded-xl bg-slate-200"
        >
          <span className="sr-only">{t("superAdmin.platformTenants.loading")}</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800"
        >
          <p>{error}</p>
          <button
            onClick={() => void load()}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : tenant ? (
        <>
          <header className="mt-6">
            <p className="text-sm font-semibold text-blue-700">
              {t("superAdmin.platformTenants.eyebrow")}
            </p>
            <h1 className="mt-1 text-3xl font-bold">{tenant.name}</h1>
            <p className="mt-2 text-slate-600">{tenant.slug}</p>
          </header>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              /* `id` is the untranslated React key so the list stays keyed on a
                 machine identifier rather than on display text. */
              {
                id: "status",
                label: t("superAdmin.tableStatus"),
                value: codeLabel(t, "superAdmin.tenantStatus", tenant.status),
              },
              {
                id: "plan",
                label: t("superAdmin.companies.plan"),
                value: codeLabel(t, "superAdmin.tenantPlan", tenant.plan),
              },
              {
                id: "created",
                label: t("superAdmin.tableCreated"),
                value: new Date(tenant.createdAt).toLocaleDateString(intlLocale),
              },
              {
                id: "users",
                label: t("superAdmin.companies.users"),
                value: tenant.stats.users.toLocaleString(intlLocale),
              },
              {
                id: "documents",
                label: t("superAdmin.documents"),
                value: tenant.stats.documents.toLocaleString(intlLocale),
              },
              {
                id: "questions",
                label: t("superAdmin.platformTenants.questions"),
                value: tenant.stats.questions.toLocaleString(intlLocale),
              },
            ].map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <dt className="text-sm text-slate-600">{item.label}</dt>
                <dd className="mt-2 text-2xl font-bold">{item.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </main>
  );
}
