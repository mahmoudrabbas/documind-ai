"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DashboardPanel } from "@/components/ui/DashboardPage";
import type {
  AnalyticsLevel,
  PackageCreateInput,
  PackageVersionInput,
  PackageVisibility,
  PlatformPackage,
  SupportLevel,
} from "@/types/api/super-admin.types";
import {
  ANALYTICS_LEVELS,
  SUPPORT_LEVELS,
} from "@/types/api/super-admin.types";
import { createPackage, createPackageVersion } from "@/services/super-admin.service";
import { ApiError } from "@/lib/api-client";
import { validatePackageInput } from "./package-form.contract";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

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

export function PackageForm({ existing, onSaved }: {
  existing?: PlatformPackage;
  onSaved?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const permissions = usePermissions();
  const canManage = permissions.can(Permission.BILLING_MANAGE);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [modelsInput, setModelsInput] = useState(
    existing?.supportedModels?.join(", ") ?? "basic",
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

    const common = {
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
      monthlyPrice: Number(data.get("monthlyPrice")),
      annualPrice: Number(data.get("annualPrice") ?? 0),
      currency: String(data.get("currency") ?? "USD"),
      trialDays: Number(data.get("trialDays") ?? 0),
      visibility: String(
        data.get("visibility") ?? "public",
      ) as PackageVisibility,
      entitlements,
      supportedModels,
      analyticsLevel: String(
        data.get("analyticsLevel") ?? "basic",
      ) as AnalyticsLevel,
      retentionDays: Number(data.get("retentionDays") ?? 30),
      supportLevel: String(
        data.get("supportLevel") ?? "community",
      ) as SupportLevel,
    };

    const body: PackageCreateInput | PackageVersionInput = existing
      ? { ...common, expectedVersion: existing.version }
      : { ...common, code: String(data.get("code") ?? "").trim().toLowerCase() };
    const validationError = validatePackageInput(body);
    if (validationError) {
      setError(validationError);
      setPending(false);
      return;
    }

    try {
      if (existing) {
        await createPackageVersion(existing._id, body as PackageVersionInput);
        await onSaved?.();
      } else {
        await createPackage(body as PackageCreateInput);
        router.push("/super-admin/packages");
        router.refresh();
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "PACKAGE_VERSION_CONFLICT") {
        setError(t("superAdmin.packageForm.versionConflict"));
        await onSaved?.();
      } else {
        setError(caught instanceof ApiError ? caught.message : t("superAdmin.packageForm.saveError"));
      }
    } finally {
      setPending(false);
    }
  }

  const input =
    "mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30";
  const labelClass = "text-sm font-bold";

  if (!canManage) {
    return (
      <DashboardPanel>
        <p role="alert">{t("superAdmin.packageForm.noPermission")}</p>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel>
      <form onSubmit={submit} className="space-y-6">
        {/* ─── Version bump warning ─── */}
        {existing ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <strong className="block font-bold">
              {t("superAdmin.packageForm.versionBumpTitle")}
            </strong>
            <p className="mt-1">{t("superAdmin.packageForm.versionBumpBody")}</p>
          </div>
        ) : null}

        {/* ─── Basic info ─── */}
        <fieldset>
          <legend className="mb-3 text-title-sm font-bold text-primary">
            {t("superAdmin.packageForm.basicInfo")}
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className={labelClass}>
              {t("superAdmin.packageForm.name")}
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={existing?.name}
                className={input}
              />
            </label>
            <label className={labelClass}>
              {t("superAdmin.packageForm.code")}
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
              {t("superAdmin.packageForm.description")}
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
            {t("superAdmin.packages.pricing")}
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-4">
            <label className={labelClass}>
              {t("superAdmin.packageForm.monthlyPriceMinor")}
              <input
                name="monthlyPrice"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={existing?.monthlyPrice ?? 0}
                className={input}
              />
            </label>
            <label className={labelClass}>
              {t("superAdmin.packageForm.annualPriceMinor")}
              <input
                name="annualPrice"
                type="number"
                min="0"
                step="1"
                defaultValue={existing?.annualPrice ?? 0}
                className={input}
              />
            </label>
            <label className={labelClass}>
              {t("superAdmin.packages.currency")}
              <input
                name="currency"
                required
                maxLength={3}
                defaultValue={existing?.currency ?? "USD"}
                className={input}
              />
            </label>
            <label className={labelClass}>
              {t("superAdmin.packageForm.trialDays")}
              <input
                name="trialDays"
                type="number"
                min={0}
                max={3650}
                step={1}
                defaultValue={existing?.trialDays ?? 30}
                className={input}
              />
            </label>
          </div>
        </fieldset>

        {/* ─── Entitlements ─── */}
        <fieldset>
          <legend className="mb-3 text-title-sm font-bold text-primary">
            {t("superAdmin.packages.entitlements")}
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-4">
            {([
              ["entitlements.employees", "superAdmin.packages.employees"],
              ["entitlements.admins", "superAdmin.packages.admins"],
              ["entitlements.documents", "superAdmin.documents"],
              ["entitlements.storageMb", "superAdmin.packageForm.storageMb"],
              ["entitlements.fileSizeMb", "superAdmin.packageForm.maxFileSizeMb"],
              ["entitlements.queriesPerMonth", "superAdmin.packages.queriesPerMonth"],
              ["entitlements.tokensPerMonth", "superAdmin.packages.tokensPerMonth"],
              ["entitlements.ocrPagesPerMonth", "superAdmin.packages.ocrPagesPerMonth"],
            ] as const).map(([name, labelKey]) => {
              const existingVal = existing?.entitlements
                ? existing.entitlements[
                    name.split(".")[1] as keyof typeof existing.entitlements
                  ]
                : // Fallback to deprecated limits for backward compat
                  (
                    {
                      employees: existing?.limits?.users ?? 1,
                      admins: existing ? 0 : 1,
                      documents: existing?.limits?.documents,
                      storageMb: existing?.limits?.storageMb,
                      fileSizeMb: 10,
                      queriesPerMonth:
                        existing?.limits?.questionsPerMonth,
                      tokensPerMonth: 0,
                      ocrPagesPerMonth: 0,
                    } as Record<string, number | undefined>
                  )[name.split(".")[1] ?? ""] ?? 0;
              return (
                <label key={name} className={labelClass}>
                  {t(labelKey)}
                  <input
                    name={name}
                    type="number"
                    min={name === "entitlements.employees" ? 1 : 0}
                    step={1}
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
            {t("superAdmin.packages.features")}
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className={labelClass}>
              {t("superAdmin.packages.supportedModels")}
              <input
                value={modelsInput}
                onChange={(e) => setModelsInput(e.target.value)}
                placeholder="gpt-4o, claude-3-sonnet, ..."
                className={input}
              />
              <span className="mt-1 block text-xs text-on-surface-variant">
                {t("superAdmin.packageForm.modelsHint", {
                  models:
                    MODEL_SUGGESTIONS.slice(0, 4).join(", ") +
                    (MODEL_SUGGESTIONS.length > 4 ? "…" : ""),
                })}
              </span>
            </label>
            <label className={labelClass}>
              {t("superAdmin.packages.analyticsLevel")}
              <select
                name="analyticsLevel"
                defaultValue={existing?.analyticsLevel ?? "basic"}
                className={input}
              >
                {ANALYTICS_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {codeLabel(t, "superAdmin.analyticsLevel", level)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              {t("superAdmin.packageForm.retentionDays")}
              <input
                name="retentionDays"
                type="number"
                min={0}
                max={36500}
                step={1}
                defaultValue={existing?.retentionDays ?? 90}
                className={input}
              />
            </label>
            <label className={labelClass}>
              {t("superAdmin.packages.supportLevel")}
              <select
                name="supportLevel"
                defaultValue={existing?.supportLevel ?? "community"}
                className={input}
              >
                {SUPPORT_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {codeLabel(t, "superAdmin.supportLevel", level)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {/* ─── Visibility ─── */}
        <fieldset>
          <legend className="mb-3 text-title-sm font-bold text-primary">
            {t("superAdmin.packages.visibility")}
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
                {codeLabel(t, "superAdmin.packageVisibility", value)}
              </label>
            ))}
            <p className="w-full text-xs text-on-surface-variant">
              <strong>
                {codeLabel(t, "superAdmin.packageVisibility", "public")}
              </strong>{" "}
              {t("superAdmin.packageForm.visibilityPublicHelp")}{" "}
              <strong>
                {codeLabel(t, "superAdmin.packageVisibility", "internal")}
              </strong>{" "}
              {t("superAdmin.packageForm.visibilityInternalHelp")}
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
            {t("common.cancel")}
          </button>
          <button
            disabled={pending}
            className="min-h-10 rounded-lg bg-primary px-5 py-2 font-bold text-on-primary disabled:opacity-50"
          >
            {pending
              ? t("superAdmin.packageForm.saving")
              : existing
                ? t("superAdmin.packageForm.updatePackage")
                : t("superAdmin.packageForm.savePackage")}
          </button>
        </div>
      </form>
    </DashboardPanel>
  );
}
