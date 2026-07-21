"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import {
  createCheckoutSession,
  getSubscriptionStatus,
  createBillingPortalSession,
} from "@/services/billing.service";
import type { PublicPackage } from "@/types/api/billing.types";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import {
  Button,
  Badge,
  Skeleton,
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui";
import { cn } from "@/lib/utils";

/* ── Data hooks ─────────────────────────────────────────────────────────── */

function usePublicPackages() {
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiClient<{ success: true; data: PublicPackage[] }>("/public/packages", {
      signal: controller.signal,
      auth: false,
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

/* ── Helpers ────────────────────────────────────────────────────────────── */

function formatPrice(price: number, currency: string): string {
  if (price <= 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function statusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const ENTITLEMENT_ITEMS: {
  key: keyof PublicPackage["entitlements"];
  label: string;
  icon: string;
}[] = [
  { key: "employees", label: "employees", icon: "group" },
  { key: "documents", label: "documents", icon: "description" },
  { key: "storageMb", label: "storage", icon: "cloud" },
  { key: "queriesPerMonth", label: "queries / month", icon: "search" },
];

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function CheckoutPage() {
  const router = useRouter();
  const auth = useAuth();
  const permissions = usePermissions();
  const canReadBilling =
    auth.status === "authenticated" && permissions.can(Permission.BILLING_READ);
  const canManageBilling =
    auth.status === "authenticated" && permissions.can(Permission.BILLING_MANAGE);

  const { packages, loading, error } = usePublicPackages();
  const [selectedPkg, setSelectedPkg] = useState<string>("");
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">(
    "monthly",
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [currentSub, setCurrentSub] = useState<{
    status: string;
    providerCustomerId: string;
    packageId?: { _id: string; name: string };
  } | null>(null);

  useEffect(() => {
    if (!canReadBilling) {
      setCurrentSub(null);
      return;
    }
    getSubscriptionStatus()
      .then((res) => setCurrentSub(res.data))
      .catch(() => {});
  }, [canReadBilling]);

  const selectedPkgData = packages.find((p) => p.id === selectedPkg);
  const selectedPrice = selectedPkgData
    ? billingInterval === "annual"
      ? selectedPkgData.annualPrice
      : selectedPkgData.monthlyPrice
    : 0;

  const handleCheckout = useCallback(async () => {
    if (!selectedPkg || !canManageBilling || selectedPrice <= 0) return;
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
  }, [billingInterval, canManageBilling, selectedPkg, selectedPrice]);

  const handleManageBilling = useCallback(async () => {
    setPortalLoading(true);
    setPortalError("");
    try {
      const result = await createBillingPortalSession();
      if (result.data.url) {
        window.location.href = result.data.url;
      }
    } catch {
      setPortalError("Failed to open billing portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  }, []);

  /* ── Loading state ───────────────────────────────────────────────────── */

  if (loading) {
    return (
      <DashboardPage>
        <DashboardPageHeader
          title="Billing & Plans"
          description="Manage your subscription and explore available plans."
        />
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-12 w-48 rounded-xl" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </div>
      </DashboardPage>
    );
  }

  /* ── Error state ─────────────────────────────────────────────────────── */

  if (error) {
    return (
      <DashboardPage>
        <DashboardPageHeader
          title="Billing & Plans"
          description="Manage your subscription and explore available plans."
        />
        <DashboardPanel className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="material-symbols-outlined text-[48px] text-error">
            error
          </span>
          <p className="text-body-lg text-on-surface-variant">{error}</p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="mt-2"
          >
            Retry
          </Button>
        </DashboardPanel>
      </DashboardPage>
    );
  }

  /* ── Empty state ─────────────────────────────────────────────────────── */

  if (!packages.length) {
    return (
      <DashboardPage>
        <DashboardPageHeader
          title="Billing & Plans"
          description="Manage your subscription and explore available plans."
        />
        <DashboardPanel className="flex flex-col items-center gap-4 py-16 text-center">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant">
            inventory_2
          </span>
          <p className="text-body-lg text-on-surface-variant">
            No packages are currently available.
          </p>
        </DashboardPanel>
      </DashboardPage>
    );
  }

  /* ── Main render ─────────────────────────────────────────────────────── */

  return (
    <DashboardPage>
      {/* Back to Dashboard */}
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        className="mb-5 inline-flex items-center gap-1.5 self-start text-label-md text-on-surface-variant transition-colors hover:text-primary"
      >
        <span className="material-symbols-outlined text-[18px]">
          arrow_back
        </span>
        Dashboard
      </button>

      <DashboardPageHeader
        title="Billing & Plans"
        description="Manage your subscription and explore available plans."
        actions={
          currentSub?.providerCustomerId && canManageBilling ? (
            <Button
              variant="outline"
              size="md"
              isLoading={portalLoading}
              onClick={() => void handleManageBilling()}
            >
              <span className="material-symbols-outlined text-[18px]">
                account_balance
              </span>
              Manage Billing
            </Button>
          ) : undefined
        }
      />

      {/* Current Subscription */}
      {currentSub && (
        <DashboardPanel padding="default" className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  workspace_premium
                </span>
              </div>
              <div>
                <p className="text-label-sm text-on-surface-variant">
                  Current Plan
                </p>
                <h2 className="text-title-lg font-bold text-on-surface">
                  {currentSub.packageId?.name ?? "Unknown Plan"}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge status={currentSub.status}>
                {statusLabel(currentSub.status)}
              </Badge>
            </div>
          </div>
        </DashboardPanel>
      )}

      {/* Billing interval toggle */}
      <div className="mb-8">
        <div className="inline-flex rounded-xl bg-surface-container p-1">
          <button
            type="button"
            onClick={() => setBillingInterval("monthly")}
            className={cn(
              "rounded-lg px-5 py-2 text-label-md font-bold transition-all",
              billingInterval === "monthly"
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval("annual")}
            className={cn(
              "rounded-lg px-5 py-2 text-label-md font-bold transition-all",
              billingInterval === "annual"
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            Annual
            <span className="ml-1.5 inline-block rounded-full bg-tertiary-container px-2 py-0.5 text-[10px] font-bold text-on-tertiary-container">
              Save
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => {
          const isSelected = selectedPkg === pkg.id;
          const price =
            billingInterval === "annual" ? pkg.annualPrice : pkg.monthlyPrice;

          return (
            <button
              key={pkg.id}
              type="button"
              disabled={auth.status === "authenticated" && !canManageBilling}
              onClick={() => setSelectedPkg(pkg.id)}
              className={cn(
                "group relative flex flex-col rounded-2xl border p-6 text-start transition-all",
                isSelected
                  ? "border-primary bg-primary-container/5 shadow-md"
                  : "border-outline-variant/40 bg-surface-container-lowest shadow-card hover:-translate-y-0.5 hover:border-outline-variant hover:shadow-md",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-on-primary">
                  <span className="material-symbols-outlined text-[18px]">
                    check
                  </span>
                </div>
              )}

              {/* Plan name & description */}
              <h3 className="pr-10 text-title-lg font-bold text-on-surface">
                {pkg.name}
              </h3>
              <p className="mt-1.5 line-clamp-2 text-body-sm leading-relaxed text-on-surface-variant">
                {pkg.description}
              </p>

              {/* Price */}
              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="text-headline-md font-bold text-primary">
                  {formatPrice(price, pkg.currency)}
                </span>
                {price > 0 && (
                  <span className="text-body-sm text-on-surface-variant">
                    /{billingInterval === "annual" ? "year" : "month"}
                  </span>
                )}
              </div>

              {/* Divider */}
              <div className="mt-5 mb-5 h-px bg-outline-variant/40" />

              {/* Entitlements */}
              <ul className="flex-1 space-y-3">
                <EntitlementList pkg={pkg} />
              </ul>

              {/* Trial badge */}
              {pkg.trialDays > 0 && (
                <div className="mt-5 rounded-xl bg-tertiary-container/30 px-4 py-2.5 text-center">
                  <span className="text-label-sm font-bold text-tertiary">
                    {pkg.trialDays}-day free trial
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-error/20 bg-error-container px-5 py-3.5">
          <span className="material-symbols-outlined text-[20px] text-on-error-container">
            warning
          </span>
          <p className="text-body-sm text-on-error-container" role="alert">
            {submitError}
          </p>
        </div>
      )}

      {/* Portal error */}
      {portalError && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-error/20 bg-error-container px-5 py-3.5">
          <span className="material-symbols-outlined text-[20px] text-on-error-container">
            warning
          </span>
          <p className="text-body-sm text-on-error-container" role="alert">
            {portalError}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        {auth.status === "unauthenticated" ? (
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push("/login?returnTo=%2Fcheckout")}
            className="min-h-12 px-8"
          >
            Sign in to continue
          </Button>
        ) : canManageBilling ? (
          <Button
            size="lg"
            disabled={!selectedPkg || selectedPrice <= 0 || submitting}
            isLoading={submitting}
            onClick={() => void handleCheckout()}
            className="min-h-12 px-8"
          >
            {submitting
              ? "Redirecting to payment…"
              : "Proceed to checkout"}
          </Button>
        ) : null}

        {auth.status === "authenticated" && !canManageBilling && (
          <p className="text-body-sm text-on-surface-variant">
            You don&apos;t have permission to manage billing. Contact your
            administrator.
          </p>
        )}
      </div>
    </DashboardPage>
  );
}

/* ── Entitlement list item ──────────────────────────────────────────────── */

function EntitlementList({ pkg }: { pkg: PublicPackage }) {
  return (
    <>
      {ENTITLEMENT_ITEMS.map((item) => (
        <li
          key={item.key}
          className="flex items-center gap-3 text-body-sm text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[16px] text-secondary">
            {item.icon}
          </span>
          <span>
            {item.key === "storageMb"
              ? `${pkg.entitlements[item.key]} MB storage`
              : item.key === "queriesPerMonth"
                ? `${pkg.entitlements[item.key].toLocaleString()} queries / month`
                : `${pkg.entitlements[item.key].toLocaleString()} ${item.label}`}
          </span>
        </li>
      ))}
    </>
  );
}
