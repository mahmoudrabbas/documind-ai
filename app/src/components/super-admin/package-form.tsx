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
    const body = {
      name: String(data.get("name") ?? ""),
      ...(existing ? {} : { code: String(data.get("code") ?? "") }),
      description: String(data.get("description") ?? ""),
      monthlyPrice: Number(data.get("monthlyPrice")),
      currency: String(data.get("currency") ?? "USD"),
      limits: {
        users: Number(data.get("users")),
        documents: Number(data.get("documents")),
        questionsPerMonth: Number(data.get("questions")),
        storageMb: Number(data.get("storage")),
      },
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
  return (
    <DashboardPanel>
      <form onSubmit={submit} className="space-y-4">
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
            Currency
            <input
              name="currency"
              required
              maxLength={3}
              defaultValue={existing?.currency ?? "USD"}
              className={input}
            />
          </label>
          {[
            ["users", "User limit", existing?.limits.users ?? 10],
            ["documents", "Document limit", existing?.limits.documents ?? 100],
            [
              "questions",
              "Monthly query limit",
              existing?.limits.questionsPerMonth ?? 1000,
            ],
            [
              "storage",
              "Storage limit (MB)",
              existing?.limits.storageMb ?? 1024,
            ],
          ].map(([name, label, value]) => (
            <label key={String(name)} className="text-sm font-bold">
              {label}
              <input
                name={String(name)}
                type="number"
                min={name === "users" ? 1 : 0}
                required
                defaultValue={Number(value)}
                className={input}
              />
            </label>
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
