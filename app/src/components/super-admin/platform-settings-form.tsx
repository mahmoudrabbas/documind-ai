"use client";

import { useState, type FormEvent } from "react";
import { DashboardPanel } from "@/components/ui/DashboardPage";
import { usePlatformData, PlatformState } from "./platform-ui";
import {
  getPlatformSetting,
  updatePlatformSetting,
} from "@/services/super-admin.service";

const defaults = {
  "ai-configuration": {
    provider: "openai",
    chatModel: "",
    embeddingModel: "",
    maxOutputTokens: 2048,
    temperature: 0.2,
  },
  settings: {
    supportEmail: "",
    maintenanceMode: false,
    allowRegistrations: true,
    defaultTrialDays: 14,
    dataRetentionDays: 365,
  },
};
const loaders = {
  "ai-configuration": (signal?: AbortSignal) =>
    getPlatformSetting("ai-configuration", signal),
  settings: (signal?: AbortSignal) => getPlatformSetting("settings", signal),
};
export function PlatformSettingsForm({
  kind,
}: {
  kind: keyof typeof defaults;
}) {
  const state = usePlatformData(loaders[kind]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    for (const [key, fallback] of Object.entries(defaults[kind])) {
      if (typeof fallback === "boolean") body[key] = form.get(key) === "on";
      else if (typeof fallback === "number") body[key] = Number(form.get(key));
      else body[key] = String(form.get(key) ?? "");
    }
    try {
      await updatePlatformSetting(kind, body);
      setNotice("Settings saved successfully.");
      await state.reload();
    } catch {
      setNotice("Unable to save settings.");
    } finally {
      setPending(false);
    }
  }
  const values = { ...defaults[kind], ...(state.data ?? {}) };
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
              {Object.entries(values).map(([key, value]) =>
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
            <div className="flex justify-end">
              <button
                disabled={pending}
                className="min-h-10 w-full rounded-lg bg-primary px-5 py-2 font-bold text-on-primary disabled:opacity-50 sm:w-auto"
              >
                {pending ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
        </DashboardPanel>
      ) : null}
    </>
  );
}
