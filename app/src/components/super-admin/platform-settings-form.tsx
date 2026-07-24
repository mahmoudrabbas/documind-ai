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
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";

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
  label: string;
  type: "email" | "checkbox" | "number";
  min?: number;
  max?: number;
  step?: number;
}> = [
  { key: "supportEmail", label: "Support Email", type: "email" },
  { key: "maintenanceMode", label: "Maintenance Mode", type: "checkbox" },
  { key: "allowRegistrations", label: "Allow Registrations", type: "checkbox" },
  { key: "defaultTrialDays", label: "Default Trial Days", type: "number", min: 0, max: 3650, step: 1 },
  { key: "dataRetentionDays", label: "Data Retention Days", type: "number", min: 1, max: 36500, step: 1 },
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

export function PlatformSettingsForm({
  kind,
}: {
  kind: keyof typeof defaultsByKind;
}) {
  const permissions = usePermissions();
  const canUpdate = permissions.can(Permission.COMPANY_SETTINGS_UPDATE);
  const state = usePlatformData<GlobalSettings | Record<string, string | number | boolean | null>>(loaders[kind]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

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
            setNotice(`"${field.label}" must be a whole number.`);
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
        setNotice("Settings saved successfully.");
        await state.reload();
      } catch {
        setNotice("Unable to save settings.");
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
        setNotice("Settings saved successfully.");
        await state.reload();
      } catch {
        setNotice("Unable to save settings.");
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
                          <span>{field.label}</span>
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
                        {field.label}
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
                        <span>{key.replaceAll(/([A-Z])/g, " $1")}</span>
                        <input
                          name={key}
                          type="checkbox"
                          defaultChecked={value}
                          className="h-5 w-5"
                        />
                      </label>
                    ) : (
                      <label key={key} className="min-w-0 text-sm font-bold">
                        {key.replaceAll(/([A-Z])/g, " $1")}
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
                {pending ? "Saving…" : "Save settings"}
              </button>
            </div>
            ) : null}
          </form>
        </DashboardPanel>
      ) : null}
    </>
  );
}
