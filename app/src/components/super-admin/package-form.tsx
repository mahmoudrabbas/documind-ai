"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DashboardPanel } from "@/components/ui/DashboardPage";
import type {
  AnalyticsLevel,
  PackageVisibility,
  PlatformPackage,
  SupportLevel,
} from "@/types/api/super-admin.types";
import {
  ANALYTICS_LEVELS,
  SUPPORT_LEVELS,
} from "@/types/api/super-admin.types";
import { createPackage, updatePackage } from "@/services/super-admin.service";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";

const MODEL_SUGGESTIONS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3-haiku",
  "claude-3.5-sonnet",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
];

export function PackageForm({ existing }: { existing?: PlatformPackage }) {
  const permissions = usePermissions();
  const canManage = permissions.can(Permission.BILLING_MANAGE);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [modelsInput, setModelsInput] = useState(
    existing?.supportedModels?.join(", ") ?? "",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);

    const entitlements = {
      employees: Number(data.get("entitlements.employees") ?? 0),
      admins: Number(data.get("entitlements.admins") ?? 0),
      documents: Number(data.get("entitlements.documents") ?? 0),
      storageMb: Number(data.get("entitlements.storageMb") ?? 0),
      fileSizeMb: Number(data.get("entitlements.fileSizeMb") ?? 0),
      queriesPerMonth: Number(data.get("entitlements.queriesPerMonth") ?? 0),
      tokensPerMonth: Number(data.get("entitlements.tokensPerMonth") ?? 0),
      ocrPagesPerMonth: Number(data.get("entitlements.ocrPagesPerMonth") ?? 0),
    };

    const supportedModels = modelsInput
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    const body: Record<string, unknown> = {
      name: String(data.get("name") ?? ""),
      ...(existing ? {} : { code: String(data.get("code") ?? "") }),
      description: String(data.get("description") ?? ""),
      monthlyPrice: Number(data.get("monthlyPrice")),
      annualPrice: Number(data.get("annualPrice") ?? 0),
      currency: String(data.get("currency") ?? "USD"),
      trialDays: Number(data.get("trialDays") ?? 0),
      visibility: String(
        data.get("visibility") ?? "public",
      ) as PackageVisibility,
      entitlements,
      // deprecated — kept for backward compatibility with older API consumers
      limits: {
        users: entitlements.employees,
        documents: entitlements.documents,
        questionsPerMonth: entitlements.queriesPerMonth,
        storageMb: entitlements.storageMb,
      },
      supportedModels,
      analyticsLevel: String(
        data.get("analyticsLevel") ?? "basic",
      ) as AnalyticsLevel,
      retentionDays: Number(data.get("retentionDays") ?? 30),
      supportLevel: String(
        data.get("supportLevel") ?? "community",
      ) as SupportLevel,
    };

    try {
      if (existing) await updatePackage(existing._id, body);
      else await createPackage(body);
      router.push("/super-admin/packages");
      router.refresh();
    } catch {
      setError("Unable to save this package. Check the values and try again.");
    } finally {
      setPending(false);
    }
  }

  const input =
    "mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30";
  const labelClass = "text-sm font-bold";

  if (!canManage) return null;

  return (
    <DashboardPanel>
      <form onSubmit={submit} className="space-y-6">
        {/* ─── Version bump warning ─── */}
        {existing ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <strong className="block font-bold">Version bump</strong>
            <p className="mt-1">
              Editing will create a new version. Existing subscriptions retain
              the current snapshot.
            </p>
          </div>
        ) : null}

        {/* ─── Basic info ─── */}
        <fieldset>
          <legend className="mb-3 text-title-sm font-bold text-primary">
            Basic Information
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Name
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={existing?.name}
                className={input}
              />
            </label>
            <label className={labelClass}>
              Code
              <input
                name="code"
                required={!existing}
                disabled={Boolean(existing)}
                defaultValue={existing?.code}
                pattern="[a-z0-9-]+"
                className={input}
              />
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              Description
              <textarea
                name="description"
                rows={3}
                maxLength={500}
                defaultValue={existing?.description}
                className={input}
              />
            </label>
          </div>
        </fieldset>

        {/* ─── Pricing ─── */}
        <fieldset>
          <legend className="mb-3 text-title-sm font-bold text-primary">
            Pricing
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-4">
            <label className={labelClass}>
              Monthly price
              <input
                name="monthlyPrice"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={existing?.monthlyPrice ?? 0}
                className={input}
              />
            </label>
            <label className={labelClass}>
              Annual price
              <input
                name="annualPrice"
                type="number"
                min="0"
                step="0.01"
                defaultValue={existing?.annualPrice ?? 0}
                className={input}
              />
            </label>
            <label className={labelClass}>
              Currency
              <input
                name="currency"
                required
                maxLength={3}
                defaultValue={existing?.currency ?? "USD"}
                className={input}
              />
            </label>
            <label className={labelClass}>
              Trial (days)
              <input
                name="trialDays"
                type="number"
                min={0}
                max={365}
                defaultValue={existing?.trialDays ?? 0}
                className={input}
              />
            </label>
          </div>
        </fieldset>

        {/* ─── Entitlements ─── */}
        <fieldset>
          <legend className="mb-3 text-title-sm font-bold text-primary">
            Entitlements
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-4">
            {([
              ["entitlements.employees", "Employees"],
              ["entitlements.admins", "Admins"],
              ["entitlements.documents", "Documents"],
              ["entitlements.storageMb", "Storage (MB)"],
              ["entitlements.fileSizeMb", "Max file size (MB)"],
              ["entitlements.queriesPerMonth", "Queries / month"],
              ["entitlements.tokensPerMonth", "Tokens / month"],
              ["entitlements.ocrPagesPerMonth", "OCR pages / month"],
            ] as const).map(([name, label]) => {
              const existingVal = existing?.entitlements
                ? existing.entitlements[
                    name.split(".")[1] as keyof typeof existing.entitlements
                  ]
                : // Fallback to deprecated limits for backward compat
                  (
                    {
                      employees: existing?.limits.users,
                      admins: 0,
                      documents: existing?.limits.documents,
                      storageMb: existing?.limits.storageMb,
                      fileSizeMb: 50,
                      queriesPerMonth:
                        existing?.limits.questionsPerMonth,
                      tokensPerMonth: 0,
                      ocrPagesPerMonth: 0,
                    } as Record<string, number | undefined>
                  )[name.split(".")[1] ?? ""] ?? 0;
              return (
                <label key={name} className={labelClass}>
                  {label}
                  <input
                    name={name}
                    type="number"
                    min={0}
                    required
                    defaultValue={Number(existingVal)}
                    className={input}
                  />
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* ─── Features ─── */}
        <fieldset>
          <legend className="mb-3 text-title-sm font-bold text-primary">
            Features
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Supported models
              <input
                value={modelsInput}
                onChange={(e) => setModelsInput(e.target.value)}
                placeholder="gpt-4o, claude-3-sonnet, ..."
                className={input}
              />
              <span className="mt-1 block text-xs text-on-surface-variant">
                Comma-separated. Suggestions:{" "}
                {MODEL_SUGGESTIONS.slice(0, 4).join(", ")}
                {MODEL_SUGGESTIONS.length > 4 ? "…" : ""}
              </span>
            </label>
            <label className={labelClass}>
              Analytics level
              <select
                name="analyticsLevel"
                defaultValue={existing?.analyticsLevel ?? "basic"}
                className={input}
              >
                {ANALYTICS_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Retention (days)
              <input
                name="retentionDays"
                type="number"
                min={1}
                max={3650}
                defaultValue={existing?.retentionDays ?? 30}
                className={input}
              />
            </label>
            <label className={labelClass}>
              Support level
              <select
                name="supportLevel"
                defaultValue={existing?.supportLevel ?? "community"}
                className={input}
              >
                {SUPPORT_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {/* ─── Visibility ─── */}
        <fieldset>
          <legend className="mb-3 text-title-sm font-bold text-primary">
            Visibility
          </legend>
          <div className="flex flex-wrap gap-4">
            {(["public", "internal"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  defaultChecked={
                    (existing?.visibility ?? "public") === value
                  }
                  className="h-4 w-4 accent-primary"
                />
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </label>
            ))}
            <p className="w-full text-xs text-on-surface-variant">
              <strong>Public</strong> — visible to all companies during
              provisioning. <strong>Internal</strong> — only the super admin
              can assign it.
            </p>
          </div>
        </fieldset>

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-error-container p-3 text-sm text-on-error-container"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => router.back()}
            className="min-h-10 rounded-lg border px-4 py-2 font-bold"
          >
            Cancel
          </button>
          <button
            disabled={pending}
            className="min-h-10 rounded-lg bg-primary px-5 py-2 font-bold text-on-primary disabled:opacity-50"
          >
            {pending ? "Saving…" : existing ? "Update package" : "Save package"}
          </button>
        </div>
      </form>
    </DashboardPanel>
  );
}
