"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { updateTenantSettings } from "@/services/settings.service";
import { useTenantSettings } from "@/providers/tenant-provider";
import type {
  DeepPartial,
  GetTenantSettingsResult,
  TenantDefaultLanguage,
  TenantResponseStyle,
  TenantSettings,
} from "@/types/api/settings.types";
import { DashboardPanel } from "@/components/ui/DashboardPage";
import { Alert, Button, Checkbox, Input, Select } from "@/components/ui";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function diffGroup<T extends Record<string, unknown>>(
  base: T,
  next: T,
): DeepPartial<T> {
  const out: DeepPartial<T> = {};
  (Object.keys(base) as Array<keyof T>).forEach((key) => {
    if (base[key] !== next[key]) {
      (out as Record<string, unknown>)[key as string] = next[key];
    }
  });
  return out;
}

function diffSettings(
  base: TenantSettings,
  next: TenantSettings,
): DeepPartial<TenantSettings> {
  const patch: DeepPartial<TenantSettings> = {};

  const profile = diffGroup(base.profile, next.profile);
  if (Object.keys(profile).length > 0) patch.profile = profile;

  if (base.defaultLanguage !== next.defaultLanguage) {
    patch.defaultLanguage = next.defaultLanguage;
  }

  const aiRuntimePreferences = diffGroup(
    base.aiRuntimePreferences,
    next.aiRuntimePreferences,
  );
  if (Object.keys(aiRuntimePreferences).length > 0) {
    patch.aiRuntimePreferences = aiRuntimePreferences;
  }

  return patch;
}

function applyPatch(
  base: TenantSettings,
  patch: DeepPartial<TenantSettings>,
): TenantSettings {
  return {
    ...base,
    ...(patch.profile
      ? { profile: { ...base.profile, ...patch.profile } }
      : {}),
    ...(patch.defaultLanguage !== undefined
      ? { defaultLanguage: patch.defaultLanguage }
      : {}),
    ...(patch.aiRuntimePreferences
      ? {
          aiRuntimePreferences: {
            ...base.aiRuntimePreferences,
            ...patch.aiRuntimePreferences,
          },
        }
      : {}),
  };
}

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function validate(
  form: TenantSettings,
  t: (key: string) => string,
): Array<{ field: string; message: string }> {
  const issues: Array<{ field: string; message: string }> = [];
  if (
    form.aiRuntimePreferences.temperature < 0 ||
    form.aiRuntimePreferences.temperature > 2
  ) {
    issues.push({
      field: "aiRuntimePreferences.temperature",
      message: t("settings.temperatureRangeError"),
    });
  }
  if (
    !Number.isInteger(form.aiRuntimePreferences.maxTokens) ||
    form.aiRuntimePreferences.maxTokens < 128 ||
    form.aiRuntimePreferences.maxTokens > 8192
  ) {
    issues.push({
      field: "aiRuntimePreferences.maxTokens",
      message: t("settings.maxTokensRangeError"),
    });
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/* Option values are machine codes sent to the API and stay untranslated.
   Only their display labels are localised, at render time. */
const LANGUAGE_OPTION_VALUES: TenantDefaultLanguage[] = ["en", "ar"];

const RESPONSE_STYLE_OPTION_VALUES: TenantResponseStyle[] = [
  "concise",
  "balanced",
  "detailed",
];

export function TenantSettingsManager() {
  const tenant = useTenantSettings();
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const { refresh, applyUpdated } = tenant;
  const [form, setForm] = useState<TenantSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  /* Kick off the shared provider load when nothing has been fetched yet. */
  useEffect(() => {
    if (tenant.status === "idle") {
      void refresh();
    }
  }, [tenant.status, refresh]);

  /* Initialise the form from the server copy the first time it arrives. */
  const readySettings =
    tenant.status === "ready" ? tenant.settings : null;
  useEffect(() => {
    if (!readySettings) return;
    setForm((current) => current ?? readySettings);
  }, [readySettings]);

  const patch = useMemo(() => {
    if (tenant.status !== "ready" || !form) {
      return {} as DeepPartial<TenantSettings>;
    }
    return diffSettings(tenant.settings, form);
  }, [tenant, form]);

  const hasChanges = Object.keys(patch).length > 0;

  const languageOptions = useMemo(
    () =>
      LANGUAGE_OPTION_VALUES.map((value) => ({
        value,
        label: codeLabel(t, "settings.language", value),
      })),
    [t],
  );

  const responseStyleOptions = useMemo(
    () =>
      RESPONSE_STYLE_OPTION_VALUES.map((value) => ({
        value,
        label: codeLabel(t, "settings.responseStyle", value),
      })),
    [t],
  );

  function update<K extends keyof TenantSettings>(
    group: K,
    value: TenantSettings[K],
  ) {
    setForm((current) => {
      if (!current) return current;
      return { ...current, [group]: value };
    });
    setSuccessMessage(null);
    setErrorMessage(null);
    setConflictMessage(null);
  }

  function updateProfile<K extends keyof TenantSettings["profile"]>(
    key: K,
    value: TenantSettings["profile"][K],
  ) {
    setForm((current) => {
      if (!current) return current;
      return { ...current, profile: { ...current.profile, [key]: value } };
    });
    setSuccessMessage(null);
    setErrorMessage(null);
    setConflictMessage(null);
  }

  function updateAi<K extends keyof TenantSettings["aiRuntimePreferences"]>(
    key: K,
    value: TenantSettings["aiRuntimePreferences"][K],
  ) {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        aiRuntimePreferences: {
          ...current.aiRuntimePreferences,
          [key]: value,
        },
      };
    });
    setSuccessMessage(null);
    setErrorMessage(null);
    setConflictMessage(null);
  }

  async function handleSave() {
    if (tenant.status !== "ready" || !form) return;
    const issues = validate(form, t);
    if (issues.length > 0) {
      setErrorMessage(issues.map((issue) => issue.message).join(" · "));
      return;
    }
    if (!hasChanges) {
      setSuccessMessage(t("settings.noChanges"));
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setConflictMessage(null);
    setSuccessMessage(null);

    try {
      const response = await updateTenantSettings({
        settings: patch,
        expectedVersion: tenant.settingsVersion,
      });
      const nextVersion =
        typeof response.data.settingsVersion === "number"
          ? response.data.settingsVersion
          : tenant.settingsVersion + 1;
      const saved: GetTenantSettingsResult = {
        settings: response.data.settings,
        settingsVersion: nextVersion,
        settingsUpdatedAt: response.data.settingsUpdatedAt,
      };
      applyUpdated(saved);
      setForm(saved.settings);
      setConflictMessage(null);
      setErrorMessage(null);
      setSuccessMessage(
        response.data.updated
          ? t("settings.saveSuccess")
          : t("settings.upToDate"),
      );
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        err.code === "SETTINGS_VERSION_CONFLICT"
      ) {
        setConflictMessage(t("settings.conflictMessage"));
        const latest = await refresh({ background: true });
        if (latest) {
          applyUpdated(latest);
          setForm(applyPatch(latest.settings, patch));
        } else {
          setConflictMessage(t("settings.conflictReloadFailed"));
        }
      } else {
        setErrorMessage(
          err instanceof ApiError
            ? err.message
            : t("settings.saveError"),
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleDiscard() {
    if (tenant.status !== "ready") return;
    setForm(tenant.settings);
    setSuccessMessage(null);
    setErrorMessage(null);
    setConflictMessage(null);
  }

  if (tenant.status === "idle" || tenant.status === "loading") {
    return (
      <div className="space-y-6">
        {[0, 1, 2, 3].map((i) => (
          <DashboardPanel key={i}>
            <div className="space-y-4">
              <div className="h-6 w-48 animate-pulse rounded bg-surface-container-high" />
              <div className="h-10 w-full animate-pulse rounded-md bg-surface-container-high" />
              <div className="h-10 w-full animate-pulse rounded-md bg-surface-container-high" />
            </div>
          </DashboardPanel>
        ))}
      </div>
    );
  }

  if (tenant.status === "error") {
    return (
      <DashboardPanel className="flex flex-col items-center px-4 py-10 text-center">
        <span className="material-symbols-outlined text-4xl text-error">
          error_outline
        </span>
        <p className="mt-2 text-label-md text-on-surface-variant">
          {tenant.message || t("settings.loadError")}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => void refresh()}
        >
          {t("common.retry")}
        </Button>
      </DashboardPanel>
    );
  }

  const { settingsUpdatedAt } = tenant;

  return (
    <div className="space-y-6">
      {successMessage ? (
        <Alert variant="success">{successMessage}</Alert>
      ) : null}
      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
      {conflictMessage ? <Alert variant="warning">{conflictMessage}</Alert> : null}

      {/* Company profile */}
      <DashboardPanel>
        <div className="mb-5">
          <h2 className="text-title-lg font-bold text-primary">
            {t("settings.companyProfileTitle")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            {t("settings.companyProfileDesc")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("settings.companyNameLabel")}
            value={form?.profile.companyName ?? ""}
            onChange={(event) =>
              updateProfile("companyName", emptyToNull(event.target.value))
            }
            placeholder={t("settings.companyNamePlaceholder")}
          />
          <Input
            label={t("settings.timezoneLabel")}
            value={form?.profile.timezone ?? ""}
            onChange={(event) =>
              updateProfile("timezone", emptyToNull(event.target.value))
            }
            placeholder="UTC"
          />
          <Input
            label={t("settings.logoUrlLabel")}
            value={form?.profile.logoUrl ?? ""}
            onChange={(event) =>
              updateProfile("logoUrl", emptyToNull(event.target.value))
            }
            placeholder="https://…/logo.png"
          />
        </div>
        <div className="mt-4 max-w-xs">
          <Select
            label={t("settings.defaultLanguageLabel")}
            options={languageOptions}
            value={form?.defaultLanguage ?? "en"}
            onChange={(event) =>
              update(
                "defaultLanguage",
                event.target.value as TenantDefaultLanguage,
              )
            }
          />
        </div>
      </DashboardPanel>

      {/* AI runtime preferences */}
      <DashboardPanel>
        <div className="mb-5">
          <h2 className="text-title-lg font-bold text-primary">
            {t("settings.aiPreferencesTitle")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            {t("settings.aiPreferencesDesc")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("settings.temperatureLabel")}
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form?.aiRuntimePreferences.temperature ?? 0.4}
            onChange={(event) =>
              updateAi("temperature", Number(event.target.value))
            }
          />
          <Input
            label={t("settings.maxTokensLabel")}
            type="number"
            min={128}
            max={8192}
            step={128}
            value={form?.aiRuntimePreferences.maxTokens ?? 1024}
            onChange={(event) =>
              updateAi("maxTokens", Number(event.target.value))
            }
          />
        </div>
        <div className="mt-4 max-w-xs">
          <Select
            label={t("settings.responseStyleLabel")}
            options={responseStyleOptions}
            value={form?.aiRuntimePreferences.responseStyle ?? "balanced"}
            onChange={(event) =>
              updateAi(
                "responseStyle",
                event.target.value as TenantResponseStyle,
              )
            }
          />
        </div>
        <div className="mt-4">
          <Checkbox
            label={t("settings.citationsLabel")}
            checked={form?.aiRuntimePreferences.citationsEnabled ?? true}
            onChange={(event) =>
              updateAi("citationsEnabled", event.target.checked)
            }
          />
        </div>
      </DashboardPanel>

      {/* Save bar */}
      <DashboardPanel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-on-surface-variant">
          {hasChanges
            ? t("settings.unsavedChanges")
            : settingsUpdatedAt
              ? t("settings.loadedFromVersionUpdated", {
                  version: String(tenant.settingsVersion),
                  timestamp: new Date(settingsUpdatedAt).toLocaleString(
                    intlLocale,
                  ),
                })
              : t("settings.loadedFromVersion", {
                  version: String(tenant.settingsVersion),
                })}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={!hasChanges || isSaving}
            onClick={handleDiscard}
          >
            {t("settings.discardChanges")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            isLoading={isSaving}
            disabled={!hasChanges}
          >
            {t("settings.saveChanges")}
          </Button>
        </div>
      </DashboardPanel>
    </div>
  );
}
