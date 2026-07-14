"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import {
  buildTenantListSearch,
  listTenants,
  parseTenantListQuery,
  updateTenant,
} from "@/services/platform.service";
import {
  PAGE_SIZES,
  TENANT_PLANS,
  TENANT_STATUSES,
  type PlatformTenant,
  type TenantListQuery,
  type TenantPlan,
} from "@/types/api/platform.types";

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );

export function TenantsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(
    () => parseTenantListQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalPages: 0,
    totalRecords: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PlatformTenant | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const navigate = useCallback(
    (changes: Partial<TenantListQuery>, resetPage = false) => {
      const next = {
        ...query,
        ...changes,
        page: resetPage ? 1 : (changes.page ?? query.page),
      };
      const target = `/super-admin/companies?${buildTenantListSearch(next)}`;
      if (target !== `/super-admin/companies?${searchParams.toString()}`)
        router.replace(target, { scroll: false });
    },
    [query, router, searchParams],
  );

  useEffect(() => {
    // Browser history changes are an external source and must restore the draft.
    setSearchDraft(query.search);
  }, [query.search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft.trim().slice(0, 120) !== query.search)
        navigate({ search: searchDraft.trim().slice(0, 120) }, true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, query.search, navigate]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await listTenants(query, signal);
        setTenants(response.data.tenants);
        setPagination(response.data.pagination);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(
          caught instanceof ApiError && caught.status === 403
            ? "You do not have permission to manage tenants."
            : "Unable to load tenants. Please try again.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const controller = new AbortController();
    // The request owns subsequent state updates and is cancelled on URL changes.
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (editing) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialogRef.current?.focus();
      const close = (event: KeyboardEvent) => {
        if (event.key === "Escape" && !pending) setEditing(null);
      };
      window.addEventListener("keydown", close);
      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener("keydown", close);
      };
    }
  }, [editing, pending]);

  async function save(update: {
    status?: "active" | "trial" | "suspended";
    plan?: TenantPlan;
  }) {
    if (!editing || pending) return;
    setPending(true);
    setNotice("");
    try {
      await updateTenant(editing.id, update);
      setEditing(null);
      setNotice("Tenant updated successfully.");
      await load();
    } catch {
      setNotice(
        "The tenant could not be updated. Please verify the requested change and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  const filtered = Boolean(query.search || query.status || query.plan);
  return (
    <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-6 sm:px-5 lg:px-8 lg:py-8 2xl:px-10">
      <header>
        <p className="text-sm font-semibold text-secondary">Super Admin</p>
        <h1 className="mt-1 text-headline-lg-mobile font-bold text-primary sm:text-headline-lg">
          Companies
        </h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          Search, review, and manage organizations across DocuMind AI.
        </p>
      </header>
      <p className="mt-6 font-semibold text-slate-800" aria-live="polite">
        {loading
          ? "Loading tenant count…"
          : `${pagination.totalRecords} tenant${pagination.totalRecords === 1 ? "" : "s"}`}
      </p>
      <section
        aria-label="Tenant filters"
        className="mt-4 grid gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 sm:gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
      >
        <label className="text-sm font-medium text-slate-700">
          Search tenants
          <input
            aria-label="Search tenants"
            value={searchDraft}
            maxLength={120}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Name or slug"
            className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Status
          <select
            value={query.status}
            onChange={(e) =>
              navigate(
                { status: e.target.value as TenantListQuery["status"] },
                true,
              )
            }
            className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All statuses</option>
            {TENANT_STATUSES.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Plan
          <select
            value={query.plan}
            onChange={(e) =>
              navigate(
                { plan: e.target.value as TenantListQuery["plan"] },
                true,
              )
            }
            className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All plans</option>
            {TENANT_PLANS.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setSearchDraft("");
            navigate({ search: "", status: "", plan: "" }, true);
          }}
          disabled={!filtered}
          className="h-11 rounded-xl border border-slate-300 bg-white px-4 font-semibold disabled:opacity-50"
        >
          Clear filters
        </button>
      </section>
      <div aria-live="polite" className="mt-4 min-h-6 text-sm text-slate-700">
        {notice}
      </div>
      {loading ? (
        <div role="status" className="mt-4 space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-20 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
          <span className="sr-only">Loading tenants</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-6"
        >
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : tenants.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <h2 className="font-semibold text-slate-900">
            {filtered ? "No tenants match these filters" : "No tenants yet"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {filtered
              ? "Try clearing or changing the filters."
              : "Tenants will appear here when available."}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1050px] border-collapse text-start text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                {[
                  "Tenant",
                  "Status",
                  "Plan",
                  "Users",
                  "Documents",
                  "Questions",
                  "Created",
                  "Actions",
                ].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-t border-slate-200">
                  <td className="max-w-64 px-4 py-4">
                    <p className="truncate font-semibold text-slate-950">
                      {tenant.name}
                    </p>
                    <p className="truncate text-slate-500">{tenant.slug}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-800">
                      {label(tenant.status)}
                    </span>
                  </td>
                  <td className="px-4 py-4">{label(tenant.plan)}</td>
                  <td className="px-4 py-4">{tenant.stats.users}</td>
                  <td className="px-4 py-4">{tenant.stats.documents}</td>
                  <td className="px-4 py-4">{tenant.stats.questions}</td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {date(tenant.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <a
                        href={`/super-admin/companies/${tenant.id}`}
                        className="rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white"
                      >
                        Open
                      </a>
                      <button
                        onClick={() => {
                          setNotice("");
                          setEditing(tenant);
                        }}
                        aria-label={`Manage ${tenant.name}`}
                        className="rounded-lg border border-slate-300 px-3 py-2 font-semibold hover:bg-slate-50"
                      >
                        Manage
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && pagination.totalRecords > 0 ? (
        <nav
          aria-label="Tenant pagination"
          className="mt-5 flex flex-wrap items-center justify-between gap-4"
        >
          <label className="text-sm">
            Rows per page{" "}
            <select
              value={query.pageSize}
              onChange={(e) =>
                navigate(
                  {
                    pageSize: Number(
                      e.target.value,
                    ) as TenantListQuery["pageSize"],
                  },
                  true,
                )
              }
              className="ms-2 rounded-lg border p-2"
            >
              {PAGE_SIZES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button
              disabled={query.page <= 1}
              onClick={() => navigate({ page: query.page - 1 })}
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm">
              Page {pagination.page} of {Math.max(1, pagination.totalPages)}
            </span>
            <button
              disabled={query.page >= pagination.totalPages}
              onClick={() => navigate({ page: query.page + 1 })}
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}
      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) setEditing(null);
          }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-dialog-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl outline-none sm:p-6"
          >
            <h2 id="tenant-dialog-title" className="text-xl font-bold">
              Manage {editing.name}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose a supported plan or status change. Status changes take
              effect immediately.
            </p>
            <div className="mt-5 grid gap-3">
              <label className="text-sm font-medium">
                Plan
                <select
                  defaultValue={editing.plan}
                  disabled={pending}
                  onChange={(e) =>
                    void save({ plan: e.target.value as TenantPlan })
                  }
                  className="mt-1 block h-11 w-full rounded-xl border px-3"
                >
                  {TENANT_PLANS.map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  disabled={pending || editing.status === "suspended"}
                  onClick={() => void save({ status: "suspended" })}
                  className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-40"
                >
                  Confirm suspend
                </button>
                <button
                  disabled={pending || editing.status === "active"}
                  onClick={() => void save({ status: "active" })}
                  className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-40"
                >
                  Confirm activate
                </button>
                <button
                  disabled={pending}
                  onClick={() => setEditing(null)}
                  className="rounded-lg border px-4 py-2 font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
