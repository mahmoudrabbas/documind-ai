"use client";

import { useState, type FormEvent } from "react";
import { DashboardPanel } from "@/components/ui/DashboardPage";
import { usePlatformData, PlatformState } from "./platform-ui";
import {
  getGlobalSettings,
  updateGlobalSettings,
  getAiConfiguration,
  updateAiConfiguration,
} from "@/services/super-admin.service";
import type { GlobalSettings } from "@/types/api/super-admin.types";
import { useI18n } from "@/providers/i18n-provider";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { ApiError } from "@/lib/api-client";

const aiConfigurationDefaults = {
  provider: "openai",
  chatModel: "",
  embeddingModel: "",
  maxOutputTokens: 2048,
  temperature: 0.2,
};

const globalSettingsDefaults: GlobalSettings = {
  supportEmail: "",
  maintenanceMode: false,
  allowRegistrations: true,
  defaultTrialDays: 14,
  dataRetentionDays: 365,
};

const globalSettingsFields: Array<{
  key: keyof GlobalSettings;
  /** Translation key — resolved through `t()` at render time. */
  label: string;
  type: "email" | "checkbox" | "number";
  min?: number;
  max?: number;
  step?: number;
}> = [
  { key: "supportEmail", label: "superAdmin.platformSettings.supportEmail", type: "email" },
  { key: "maintenanceMode", label: "superAdmin.platformSettings.maintenanceMode", type: "checkbox" },
  { key: "allowRegistrations", label: "superAdmin.platformSettings.allowRegistrations", type: "checkbox" },
  { key: "defaultTrialDays", label: "superAdmin.platformSettings.defaultTrialDays", type: "number", min: 0, max: 3650, step: 1 },
  { key: "dataRetentionDays", label: "superAdmin.platformSettings.dataRetentionDays", type: "number", min: 1, max: 36500, step: 1 },
];

const defaultsByKind = {
  "ai-configuration": aiConfigurationDefaults,
  settings: globalSettingsDefaults,
} as const;

const loaders = {
  "ai-configuration": (signal?: AbortSignal) =>
    getAiConfiguration(signal),
  settings: (signal?: AbortSignal) => getGlobalSettings(signal),
};

/**
 * Format a save failure for display.
 *
 * The API's `message` is passed through untranslated — localizing backend
 * errors is a server concern. `genericMessage` is the only English literal
 * here, so callers hand in the translated string.
 */
export function formatSettingsError(
  error: unknown,
  genericMessage = "Unable to save settings.",
): string {
  if (!(error instanceof ApiError)) return genericMessage;
  return `${error.message}${error.code ? ` (${error.code})` : ""}`;
}

export function PlatformSettingsForm({
  kind,
}: {
  kind: keyof typeof defaultsByKind;
}) {
  const { t } = useI18n();
  const permissions = usePermissions();
  const canUpdate = permissions.can(Permission.COMPANY_SETTINGS_UPDATE);
  const state = usePlatformData<GlobalSettings | Record<string, string | number | boolean | null>>(loaders[kind]);
  const [pending, setPending] = useState(false);
  /* Holds already-rendered text: either a translated notice or an
     untranslated message straight from the API. */
  const [notice, setNotice] = useState("");

  /* AI configuration fields are discovered from the API response, so only
     the known defaults get an authored label; anything else keeps the
     previous camelCase-to-words rendering. */
  const aiFieldLabels: Record<string, string> = {
    provider: t("superAdmin.platformSettings.aiProvider"),
    chatModel: t("superAdmin.platformSettings.aiChatModel"),
    embeddingModel: t("superAdmin.platformSettings.aiEmbeddingModel"),
    maxOutputTokens: t("superAdmin.platformSettings.aiMaxOutputTokens"),
    temperature: t("superAdmin.platformSettings.aiTemperature"),
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;
    setPending(true);
    setNotice("");
    const form = new FormData(event.currentTarget);

    if (kind === "settings") {
      const body: Record<string, unknown> = {};
      for (const field of globalSettingsFields) {
        const raw = form.get(field.key);
        if (field.type === "checkbox") {
          body[field.key] = raw === "on";
        } else if (field.type === "number") {
          const parsed = Number(raw);
          if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
            setNotice(
              t("superAdmin.platformSettings.wholeNumber", {
                field: t(field.label),
              }),
            );
            setPending(false);
            return;
          }
          body[field.key] = parsed;
        } else {
          body[field.key] = String(raw ?? "");
        }
      }
      try {
        await updateGlobalSettings(body as Partial<GlobalSettings>);
        setNotice(t("superAdmin.platformSettings.saveSuccess"));
        await state.reload();
      } catch (caught) {
        setNotice(
          formatSettingsError(caught, t("superAdmin.platformSettings.saveError")),
        );
      } finally {
        setPending(false);
      }
    } else {
      const body: Record<string, unknown> = {};
      for (const [key, fallback] of Object.entries(aiConfigurationDefaults)) {
        if (typeof fallback === "boolean") body[key] = form.get(key) === "on";
        else if (typeof fallback === "number") body[key] = Number(form.get(key));
        else body[key] = String(form.get(key) ?? "");
      }
      try {
        await updateAiConfiguration(body);
        setNotice(t("superAdmin.platformSettings.saveSuccess"));
        await state.reload();
      } catch (caught) {
        setNotice(
          formatSettingsError(caught, t("superAdmin.platformSettings.saveError")),
        );
      } finally {
        setPending(false);
      }
    }
  }

  const values = { ...defaultsByKind[kind], ...(state.data ?? {}) };
  const input =
    "mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2";

  return (
    <>
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <DashboardPanel>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {kind === "settings"
                ? globalSettingsFields.map((field) => {
                    const value = (values as Record<string, unknown>)[field.key];
                    if (field.type === "checkbox") {
                      return (
                        <label
                          key={field.key}
                          className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-outline-variant/30 p-3 text-sm font-bold"
                        >
                          <span>{t(field.label)}</span>
                          <input
                            name={field.key}
                            type="checkbox"
                            defaultChecked={Boolean(value)}
                            className="h-5 w-5"
                          />
                        </label>
                      );
                    }
                    return (
                      <label key={field.key} className="min-w-0 text-sm font-bold">
                        {t(field.label)}
                        <input
                          name={field.key}
                          type={field.type}
                          inputMode={field.type === "number" ? "numeric" : undefined}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          defaultValue={String(value ?? "")}
                          className={input}
                        />
                      </label>
                    );
                  })
                : Object.entries(values).map(([key, value]) =>
                    typeof value === "boolean" ? (
                      <label
                        key={key}
                        className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-outline-variant/30 p-3 text-sm font-bold"
                      >
                        <span>
                          {aiFieldLabels[key] ??
                            key.replaceAll(/([A-Z])/g, " $1")}
                        </span>
                        <input
                          name={key}
                          type="checkbox"
                          defaultChecked={value}
                          className="h-5 w-5"
                        />
                      </label>
                    ) : (
                      <label key={key} className="min-w-0 text-sm font-bold">
                        {aiFieldLabels[key] ??
                          key.replaceAll(/([A-Z])/g, " $1")}
                        <input
                          name={key}
                          type={typeof value === "number" ? "number" : "text"}
                          defaultValue={String(value ?? "")}
                          className={input}
                        />
                      </label>
                    ),
                  )}
            </div>
            {notice ? (
              <p aria-live="polite" className="text-sm">
                {notice}
              </p>
            ) : null}
            {canUpdate ? (
            <div className="flex justify-end">
              <button
                disabled={pending}
                className="min-h-10 w-full rounded-lg bg-primary px-5 py-2 font-bold text-on-primary disabled:opacity-50 sm:w-auto"
              >
                {pending
                  ? t("superAdmin.platformSettings.saving")
                  : t("superAdmin.platformSettings.saveSettings")}
              </button>
            </div>
            ) : null}
          </form>
        </DashboardPanel>
      ) : null}
    </>
  );
}
