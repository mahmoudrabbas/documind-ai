"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { createCheckoutSession, getSubscriptionStatus } from "@/services/billing.service";
import type { PublicPackage } from "@/types/api/billing.types";

function usePublicPackages() {
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiClient<{ success: true; data: PublicPackage[] }>("/public/packages", {
      signal: controller.signal,
    })
      .then((res) => {
        setPackages(res.data);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("Unable to load packages");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  return { packages, loading, error };
}

export default function CheckoutPage() {
  const { packages, loading, error } = usePublicPackages();
  const [selectedPkg, setSelectedPkg] = useState<string>("");
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [currentSub, setCurrentSub] = useState<{ status: string; packageId?: { _id: string; name: string } } | null>(null);

  useEffect(() => {
    getSubscriptionStatus()
      .then((res) => setCurrentSub(res.data))
      .catch(() => {});
  }, []);

  const handleCheckout = useCallback(async () => {
    if (!selectedPkg) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await createCheckoutSession(selectedPkg, billingInterval);
      if (result.data.sessionUrl) {
        window.location.href = result.data.sessionUrl;
      }
    } catch {
      setSubmitError("Failed to create checkout session. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedPkg, billingInterval]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-on-surface-variant">Loading packages…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md rounded-xl border border-error/20 bg-error-container p-6 text-center text-on-error-container">
          <p className="mb-4">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-error px-4 py-2 font-bold text-on-error"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!packages.length) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-on-surface-variant">No packages are currently available.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-headline-lg font-bold text-on-surface">Choose a plan</h1>
      <p className="mt-2 text-on-surface-variant">
        Select the plan that best fits your needs.
      </p>

      {currentSub && (
        <div className="mt-4 rounded-xl bg-surface-container p-4 text-sm">
          Current subscription: <strong>{currentSub.status.replaceAll("_", " ")}</strong>
          {currentSub.packageId ? ` — ${currentSub.packageId.name}` : ""}
        </div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <button
            key={pkg._id}
            type="button"
            onClick={() => setSelectedPkg(pkg._id)}
            className={`rounded-2xl border-2 p-6 text-start transition-all ${
              selectedPkg === pkg._id
                ? "border-primary bg-primary-container/20 shadow-lg"
                : "border-outline-variant bg-surface hover:border-primary/50"
            }`}
          >
            <h2 className="text-title-lg font-bold text-on-surface">{pkg.name}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{pkg.description}</p>
            <div className="mt-4">
              <span className="text-display-sm font-bold text-primary">
                {billingInterval === "annual" ? pkg.annualPrice : pkg.monthlyPrice}
              </span>
              <span className="text-on-surface-variant">
                /{billingInterval === "annual" ? "year" : "month"}
              </span>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-on-surface-variant">
              <li>Up to {pkg.entitlements.employees} employees</li>
              <li>{pkg.entitlements.documents} documents</li>
              <li>{pkg.entitlements.storageMb} MB storage</li>
              <li>{pkg.entitlements.queriesPerMonth} queries/month</li>
              <li>{pkg.retentionDays} day retention</li>
            </ul>
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <input
            type="radio"
            name="billing"
            checked={billingInterval === "monthly"}
            onChange={() => setBillingInterval("monthly")}
            className="h-4 w-4 accent-primary"
          />
          Monthly
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <input
            type="radio"
            name="billing"
            checked={billingInterval === "annual"}
            onChange={() => setBillingInterval("annual")}
            className="h-4 w-4 accent-primary"
          />
          Annual
        </label>
      </div>

      {submitError ? (
        <p className="mt-4 text-sm text-error" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="mt-6">
        <button
          type="button"
          disabled={!selectedPkg || submitting}
          onClick={() => void handleCheckout()}
          className="min-h-12 rounded-xl bg-primary px-8 font-bold text-on-primary disabled:opacity-50"
        >
          {submitting ? "Redirecting to payment…" : "Proceed to checkout"}
        </button>
      </div>
    </div>
  );
}
