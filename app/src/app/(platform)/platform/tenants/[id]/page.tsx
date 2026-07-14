"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { getTenantById } from "@/services/platform.service";
import type { PlatformTenant } from "@/types/api/platform.types";

const format = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function PlatformTenantDetailPage() {
  const id = String(useParams<{ id: string }>().id ?? "");
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
            ? "Tenant not found."
            : caught instanceof ApiError && caught.status === 400
              ? "Invalid tenant ID."
              : "Unable to load this tenant.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id],
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
        Back to tenants
      </Link>
      {loading ? (
        <div
          role="status"
          className="mt-8 h-40 animate-pulse rounded-xl bg-slate-200"
        >
          <span className="sr-only">Loading tenant</span>
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
            Retry
          </button>
        </div>
      ) : tenant ? (
        <>
          <header className="mt-6">
            <p className="text-sm font-semibold text-blue-700">
              Tenant details
            </p>
            <h1 className="mt-1 text-3xl font-bold">{tenant.name}</h1>
            <p className="mt-2 text-slate-600">{tenant.slug}</p>
          </header>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Status", format(tenant.status)],
              ["Plan", format(tenant.plan)],
              ["Created", new Date(tenant.createdAt).toLocaleDateString()],
              ["Users", tenant.stats.users],
              ["Documents", tenant.stats.documents],
              ["Questions", tenant.stats.questions],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <dt className="text-sm text-slate-600">{label}</dt>
                <dd className="mt-2 text-2xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </main>
  );
}
