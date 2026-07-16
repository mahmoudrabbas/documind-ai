"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DashboardPanel } from "@/components/ui/DashboardPage";
import type { PlatformPackage } from "@/types/api/super-admin.types";
import { createPackage, updatePackage } from "@/services/super-admin.service";

export function PackageForm({ existing }: { existing?: PlatformPackage }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const rawModels = String(data.get("supportedModels") ?? "");
    const body = {
      name: String(data.get("name") ?? ""),
      ...(existing ? {} : { code: String(data.get("code") ?? "") }),
      description: String(data.get("description") ?? ""),
      monthlyPrice: Number(data.get("monthlyPrice")),
      annualPrice: Number(data.get("annualPrice")),
      currency: String(data.get("currency") ?? "USD"),
      trialDays: Number(data.get("trialDays")),
      visibility: String(data.get("visibility") ?? "public"),
      limits: {
        users: Number(data.get("users")),
        documents: Number(data.get("documents")),
        questionsPerMonth: Number(data.get("questions")),
        storageMb: Number(data.get("storage")),
      },
      entitlements: {
        employees: Number(data.get("entitlement-employees")),
        admins: Number(data.get("entitlement-admins")),
        documents: Number(data.get("entitlement-documents")),
        storageMb: Number(data.get("entitlement-storageMb")),
        fileSizeMb: Number(data.get("entitlement-fileSizeMb")),
        queriesPerMonth: Number(data.get("entitlement-queriesPerMonth")),
        tokensPerMonth: Number(data.get("entitlement-tokensPerMonth")),
        ocrPagesPerMonth: Number(data.get("entitlement-ocrPagesPerMonth")),
      },
      supportedModels: rawModels
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      analyticsLevel: String(data.get("analyticsLevel") ?? "basic"),
      retentionDays: Number(data.get("retentionDays")),
      supportLevel: String(data.get("supportLevel") ?? "community"),
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
  const select = input;
  return (
    <DashboardPanel>
      <form onSubmit={submit} className="space-y-4">
        {existing ? (
          <p
            role="alert"
            className="rounded-xl bg-tertiary-container p-3 text-sm text-on-tertiary-container"
          >
            Editing will create a new version. Existing subscriptions retain the
            current snapshot.
          </p>
        ) : null}
        {/* --- Basic info --- */}
        <fieldset>
          <legend className="mb-3 text-title-md font-bold text-primary">
            Basic Information
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="min-w-0 text-sm font-bold">
              Name
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={existing?.name}
                className={input}
              />
            </label>
            <label className="min-w-0 text-sm font-bold">
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
            <label className="min-w-0 text-sm font-bold md:col-span-2">
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
        {/* --- Pricing --- */}
        <fieldset>
          <legend className="mb-3 text-title-md font-bold text-primary">
            Pricing
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-3">
            <label className="text-sm font-bold">
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
            <label className="text-sm font-bold">
              Annual price
              <input
                name="annualPrice"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={existing?.annualPrice ?? 0}
                className={input}
              />
            </label>
            <label className="text-sm font-bold">
              Currency
              <input
                name="currency"
                required
                maxLength={3}
                defaultValue={existing?.currency ?? "USD"}
                className={input}
              />
            </label>
            <label className="text-sm font-bold md:col-span-2">
              Trial days
              <input
                name="trialDays"
                type="number"
                min="0"
                max={365}
                required
                defaultValue={existing?.trialDays ?? 0}
                className={input}
              />
            </label>
          </div>
        </fieldset>
        {/* --- Entitlements --- */}
        <fieldset>
          <legend className="mb-3 text-title-md font-bold text-primary">
            Entitlements
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-3">
            {[
              ["entitlement-employees", "Employees", existing?.entitlements?.employees ?? 1],
              ["entitlement-admins", "Admins", existing?.entitlements?.admins ?? 1],
              ["entitlement-documents", "Documents", existing?.entitlements?.documents ?? 100],
              ["entitlement-storageMb", "Storage (MB)", existing?.entitlements?.storageMb ?? 1024],
              ["entitlement-fileSizeMb", "File size (MB)", existing?.entitlements?.fileSizeMb ?? 10],
              ["entitlement-queriesPerMonth", "Queries / month", existing?.entitlements?.queriesPerMonth ?? 1000],
              ["entitlement-tokensPerMonth", "Tokens / month", existing?.entitlements?.tokensPerMonth ?? 100000],
              ["entitlement-ocrPagesPerMonth", "OCR pages / month", existing?.entitlements?.ocrPagesPerMonth ?? 100],
            ].map(([name, label, value]) => (
              <label key={String(name)} className="text-sm font-bold">
                {label}
                <input
                  name={String(name)}
                  type="number"
                  min="0"
                  required
                  defaultValue={Number(value)}
                  className={input}
                />
              </label>
            ))}
          </div>
        </fieldset>
        {/* --- Features --- */}
        <fieldset>
          <legend className="mb-3 text-title-md font-bold text-primary">
            Features
          </legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <label className="text-sm font-bold md:col-span-2">
              Supported models (comma-separated)
              <input
                name="supportedModels"
                defaultValue={existing?.supportedModels?.join(", ") ?? ""}
                placeholder="gpt-4o, claude-3-opus, gemini-2.0-flash"
                className={input}
              />
            </label>
            <label className="text-sm font-bold">
              Analytics level
              <select
                name="analyticsLevel"
                defaultValue={existing?.analyticsLevel ?? "basic"}
                className={select}
              >
                <option value="basic">Basic</option>
                <option value="advanced">Advanced</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label className="text-sm font-bold">
              Retention (days)
              <input
                name="retentionDays"
                type="number"
                min="0"
                max={3650}
                required
                defaultValue={existing?.retentionDays ?? 30}
                className={input}
              />
            </label>
            <label className="text-sm font-bold">
              Support level
              <select
                name="supportLevel"
                defaultValue={existing?.supportLevel ?? "community"}
                className={select}
              >
                <option value="community">Community</option>
                <option value="standard">Standard</option>
                <option value="priority">Priority</option>
                <option value="dedicated">Dedicated</option>
              </select>
            </label>
          </div>
        </fieldset>
        {/* --- Visibility --- */}
        <fieldset>
          <legend className="mb-3 text-title-md font-bold text-primary">
            Visibility
          </legend>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="radio"
                name="visibility"
                value="public"
                defaultChecked={
                  !existing || existing.visibility === "public"
                }
                className="h-4 w-4 accent-primary"
              />
              Public
            </label>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="radio"
                name="visibility"
                value="internal"
                defaultChecked={existing?.visibility === "internal"}
                className="h-4 w-4 accent-primary"
              />
              Internal
            </label>
          </div>
        </fieldset>
        {/* --- Legacy limits (deprecated, hidden) --- */}
        <div className="hidden">
          {[
            ["users", existing?.limits.users ?? 10],
            ["documents", existing?.limits.documents ?? 100],
            ["questions", existing?.limits.questionsPerMonth ?? 1000],
            ["storage", existing?.limits.storageMb ?? 1024],
          ].map(([name, value]) => (
            <input
              key={String(name)}
              name={String(name)}
              type="hidden"
              defaultValue={Number(value)}
            />
          ))}
        </div>
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
            {pending ? "Saving…" : "Save package"}
          </button>
        </div>
      </form>
    </DashboardPanel>
  );
}
