"use client";

/**
 * "Pricing" — the honest-cost section.
 *
 * Section 8 of the public landing page. Section 7 closed the trust story on
 * a dark band; pricing returns to a clear light surface. It answers one
 * question: what does DocuMind cost, what do I get, and which plan is right
 * for me?
 *
 * Every number rendered here comes from the platform's public packages
 * endpoint (`GET /public/packages`), which the backend already filters to
 * `active && visibility: "public"`. No price, limit, currency, or plan name
 * is invented in this component, and nothing private (subscription status,
 * billing state, Stripe ids, admin-only packages) is requested or shown.
 *
 * Billing intervals: the product carries real monthly and annual prices
 * (`monthlyPriceCents` / `annualPriceCents`) plus `billingInterval` on the
 * authenticated checkout. Registration, however, provisions a TRIALING
 * subscription from `packageCode` only — it cannot preserve a billing
 * interval from the public page — and the checkout page re-selects the
 * interval itself (defaulting to monthly). So the landing shows the real
 * monthly price as the actionable figure and presents the real annual total
 * (and a factual "Save X%" line) as truthful, NON-INTERACTIVE information:
 * a visitor can never believe they pre-selected an annual checkout.
 * Nothing is discounted, crossed out, or invented.
 *
 * Composition is one integrated architecture — an editorial intro with the
 * billing selector, plans inside ONE shared frame separated by hairline
 * rules (not three floating cards), then an editorial essentials comparison
 * (ruled rows, not a spreadsheet grid). The plan count is never assumed:
 * 1–4 public plans render gracefully.
 *
 * Arabic is first-class: prices localized via Intl with explicit bidi
 * isolation (`dir="ltr"` spans), plan names/descriptions routed through the
 * billing dictionary, and Latin units kept separate from translated copy.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/billing.helpers";
import { mbToGb } from "@/lib/storage";
import { Skeleton } from "@/components/ui";
import type { PublicPackage } from "@/types/api/billing.types";

/* ── Shared comparison rows ─────────────────────────────────────────────── */

const COMPARISON_ROWS: Array<{ key: string; labelKey: string }> = [
  { key: "documents", labelKey: "landing.pricingCompareDocuments" },
  { key: "queries", labelKey: "landing.pricingCompareQueries" },
  { key: "members", labelKey: "landing.pricingCompareMembers" },
  { key: "storage", labelKey: "landing.pricingCompareStorage" },
  { key: "support", labelKey: "landing.pricingCompareSupport" },
];

/** Decision-relevant limits on each plan surface; support stays in the comparison. */
const OVERVIEW_LIMITS = COMPARISON_ROWS.filter((row) => row.key !== "support");

/* Literal Tailwind classes so the JIT keeps them (dynamic counts, 1–4 plans). */
const SURFACE_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-2 xl:grid-cols-4",
};

const COMPARE_COLS: Record<number, string> = {
  1: "lg:grid-cols-2",
  2: "lg:grid-cols-3",
  3: "lg:grid-cols-4",
  4: "lg:grid-cols-5",
};

/* ── Pure display helpers ───────────────────────────────────────────────── */

function isFree(pkg: PublicPackage): boolean {
  return (pkg.monthlyPriceCents ?? pkg.monthlyPrice ?? 0) <= 0;
}

/** Real monthly cents for a plan, or null when unconfigured. */
function monthlyCents(pkg: PublicPackage): number | null {
  const c = pkg.monthlyPriceCents ?? pkg.monthlyPrice ?? 0;
  return c >= 0 ? c : null;
}

/** Real annual cents for a plan, or null when annual billing is not configured. */
function annualCents(pkg: PublicPackage): number | null {
  const c = pkg.annualPriceCents ?? pkg.annualPrice ?? 0;
  return c > 0 ? c : null;
}

/** Resolve the buyer-facing plan name (Arabic routes known tiers). */
function planName(pkg: PublicPackage, t: (key: string) => string, locale: string): string {
  if (locale !== "ar") return pkg.name;

  const code = (pkg.code || "").toLowerCase();
  const name = (pkg.name || "").toLowerCase();

  if (code === "free" || name.includes("free")) return t("billing.packageName.free");
  if (code.includes("pro") || name.includes("pro")) return t("billing.packageName.pro");
  if (code.includes("ultra") || name.includes("ultra")) return t("billing.packageName.ultra");
  if (code.includes("enterprise") || name.includes("enterprise")) {
    return t("billing.packageName.enterprise");
  }

  const key = `billing.packageName.${code}`;
  const translated = t(key);
  return translated !== key ? translated : pkg.name;
}

/** Resolve a short description for a plan surface (Arabic known tiers). */
function planDescription(pkg: PublicPackage, t: (key: string) => string, locale: string): string {
  if (locale !== "ar") return pkg.description || "";

  const code = (pkg.code || "").toLowerCase();
  const name = (pkg.name || "").toLowerCase();

  if (code === "free" || name.includes("free")) return t("billing.packageDesc.free");
  if (code.includes("pro") || name.includes("pro")) return t("billing.packageDesc.pro");
  if (code.includes("ultra") || name.includes("ultra")) return t("billing.packageDesc.ultra");
  if (code.includes("enterprise") || name.includes("enterprise")) {
    return t("billing.packageDesc.enterprise");
  }

  const key = `billing.packageDesc.${code}`;
  const translated = t(key);
  return translated !== key ? translated : (pkg.description || "");
}

/** Compact plan name for the mobile stacked comparison (one short word). */
function planShortName(pkg: PublicPackage, t: (key: string) => string, locale: string): string {
  const code = (pkg.code || "").toLowerCase();
  const name = (pkg.name || "").toLowerCase();

  if (code === "free" || name.includes("free")) return t("landing.pricingShortFree");
  if (code.includes("pro") || name.includes("pro")) return t("landing.pricingShortPro");
  if (code.includes("ultra") || name.includes("ultra")) return t("landing.pricingShortUltra");
  if (code.includes("enterprise") || name.includes("enterprise")) {
    return t("landing.pricingShortEnterprise");
  }
  return planName(pkg, t, locale);
}

/** Localized support-tier label ("Community" / "مجتمعي"). */
function supportLabel(level: string, t: (key: string) => string, locale: string): string {
  const key = `billing.supportLevel.${String(level || "community").toLowerCase()}`;
  const resolved = t(key);
  const label = resolved !== key ? resolved : String(level || "community");
  if (locale === "ar") return label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Storage figure: megabytes → a compact "N GB" / "N MB" string. */
function formatStorage(mb: number): string {
  if (mb >= 1000) return `${Math.round(mbToGb(mb)).toLocaleString("en-US")} GB`;
  return `${mb.toLocaleString("en-US")} MB`;
}

/** Locale-formatted count for entitlement cells. */
function formatCount(value: number, intlLocale: string): string {
  return value.toLocaleString(intlLocale);
}

/** The value shown for one plan in one comparison row. */
function dimValue(
  pkg: PublicPackage,
  rowKey: string,
  t: (key: string) => string,
  locale: string,
  intlLocale: string,
): string {
  switch (rowKey) {
    case "documents":
      return formatCount(pkg.entitlements.documents, intlLocale);
    case "queries":
      return formatCount(pkg.entitlements.queriesPerMonth, intlLocale);
    case "members":
      return formatCount(pkg.entitlements.employees, intlLocale);
    case "storage":
      return formatStorage(pkg.entitlements.storageMb);
    case "support":
      return supportLabel(pkg.supportLevel, t, locale);
    default:
      return "";
  }
}

/** Latin values ("10 GB") need bidi isolation inside the RTL document. */
function needsLtrIsolation(rowKey: string): boolean {
  return rowKey === "storage";
}

/** Localized monthly price text for a plan (Free stays Free). */
function monthlyPriceText(
  pkg: PublicPackage,
  t: (key: string) => string,
  intlLocale: string,
): string {
  if (isFree(pkg)) return t("landing.pricingFree");
  const cents = monthlyCents(pkg);
  if (cents == null) return t("landing.pricingFree");
  return formatPrice(cents / 100, pkg.currency || "USD", intlLocale);
}

/** Localized annual price text, or null when annual billing is not configured. */
function annualPriceText(pkg: PublicPackage, intlLocale: string): string | null {
  const annual = annualCents(pkg);
  if (annual == null) return null;
  return formatPrice(annual / 100, pkg.currency || "USD", intlLocale);
}

/** Real saving percent when annual < monthly × 12; else null (never invented). */
function annualSavingsPercent(pkg: PublicPackage): number | null {
  const annual = annualCents(pkg);
  const monthly = monthlyCents(pkg);
  if (annual == null || monthly == null || monthly <= 0) return null;
  const flat = monthly * 12;
  if (annual >= flat) return null;
  return Math.round((1 - annual / flat) * 100);
}

/* ── Staged entrance (same pattern as the sibling marketing sections) ───── */

function Reveal({
  shown,
  delay,
  className,
  children,
  animate = true,
}: {
  shown: boolean;
  delay?: string;
  className?: string;
  children: ReactNode;
  animate?: boolean;
}) {
  if (!animate) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out",
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        className,
      )}
      style={{ transitionDelay: delay }}
    >
      {children}
    </div>
  );
}

/* ── One integrated plan frame ──────────────────────────────────────────── */

function PlanSurfaces({
  plans,
  shown,
  animate,
}: {
  plans: PublicPackage[];
  shown: boolean;
  animate: boolean;
}) {
  const { t, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const locale = dir === "rtl" ? "ar" : "en";
  const cols = SURFACE_COLS[plans.length] ?? SURFACE_COLS[3];

  return (
    <Reveal shown={shown} animate={animate} className="mt-12 sm:mt-16">
      <div
        className={cn(
          "grid grid-cols-1 overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm",
          cols,
        )}
      >
        {plans.map((pkg, i) => {
          const name = planName(pkg, t, locale);
          const desc = planDescription(pkg, t, locale);
          const free = isFree(pkg);
          const monthly = monthlyPriceText(pkg, t, intlLocale);
          const annual = annualPriceText(pkg, intlLocale);
          const savings = annualSavingsPercent(pkg);
          const savingsLabel =
            savings != null
              ? t("landing.pricingAnnualSave", {
                  percent: savings.toLocaleString(intlLocale),
                })
              : null;

          return (
            <div
              key={pkg.id}
              data-plan={pkg.code}
              className={cn(
                "flex flex-col bg-white px-7 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-12",
                i > 0 && "border-t border-outline-variant lg:border-t-0 lg:border-s",
              )}
            >
              <h3 className="text-title-lg font-semibold text-primary">{name}</h3>
              <p className="mt-3 text-body-sm leading-[1.7] text-on-surface-variant">{desc}</p>

              <div className="mt-8 min-h-[100px]">
                <div className="flex items-baseline gap-2">
                  <span
                    data-price
                    dir={free ? undefined : "ltr"}
                    className="text-[clamp(34px,2.6vw,48px)] font-bold leading-none tracking-[-0.02em] text-primary"
                  >
                    {monthly}
                  </span>
                  {!free && (
                    <span className="text-body-md font-medium text-on-surface-variant">
                      {t("landing.pricingPerMonth")}
                    </span>
                  )}
                </div>

                {/* Annual billing shown as truthful, non-interactive information. */}
                {!free && annual && (
                  <p className="mt-3 text-label-sm text-on-surface-variant" data-annual-price>
                    {t("landing.pricingAnnualAltBefore")}{" "}
                    <span dir="ltr" className="font-semibold">
                      {annual}
                    </span>{" "}
                    {t("landing.pricingPerYear")}
                  </p>
                )}
                {savingsLabel && (
                  <p className="mt-1.5 text-label-sm font-semibold text-[#1688f5]" data-annual-save>
                    {savingsLabel}
                  </p>
                )}
              </div>

              <hr aria-hidden="true" className="mt-8 border-outline-variant" />

              <div className="mt-7">
                {OVERVIEW_LIMITS.map((row, ri) => (
                  <div
                    key={row.key}
                    className={cn(
                      "flex items-baseline justify-between gap-4 py-3",
                      ri > 0 && "border-t border-outline-variant",
                    )}
                  >
                    <span className="text-body-sm text-on-surface-variant">{t(row.labelKey)}</span>
                    <span className="text-body-sm font-semibold text-on-surface">
                      {needsLtrIsolation(row.key) ? (
                        <span dir="ltr">{dimValue(pkg, row.key, t, locale, intlLocale)}</span>
                      ) : (
                        dimValue(pkg, row.key, t, locale, intlLocale)
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-auto flex justify-center pt-10">
                <Link
                  href={free ? "/register" : `/register?package=${pkg.code}`}
                  className="inline-flex min-h-[44px] min-w-[170px] items-center justify-center gap-2 rounded-xl bg-primary px-7 text-label-md font-semibold text-on-primary shadow-sm transition-all hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5] active:scale-[0.98]"
                >
                  {t("landing.pricingChoose", { name })}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </Reveal>
  );
}

/* ── Editorial comparison (ruled rows, not a spreadsheet) ──────────────── */

function ComparisonTable({
  plans,
  shown,
  animate,
}: {
  plans: PublicPackage[];
  shown: boolean;
  animate: boolean;
}) {
  const { t, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const locale = dir === "rtl" ? "ar" : "en";
  const cols = COMPARE_COLS[plans.length] ?? COMPARE_COLS[3];

  return (
    <Reveal shown={shown} animate={animate} className="mt-10 sm:mt-14">
      <div className="mb-6 flex items-center justify-center gap-3">
        <span aria-hidden="true" className="h-px w-8 bg-[#1688f5]" />
        <h3 className="text-title-md font-semibold text-primary sm:text-title-lg">
          {t("landing.pricingCompareTitle")}
        </h3>
        <span aria-hidden="true" className="h-px w-8 bg-[#1688f5]" />
      </div>

      {/* Desktop & tablet: one frame, plan names + ruled dimension rows */}
      <div className="hidden overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm lg:block">
        <div className={cn("grid", cols)}>
          <div aria-hidden="true" className="px-8 py-6" />
          {plans.map((pkg) => {
            const annual = annualPriceText(pkg, intlLocale);
            return (
              <div key={pkg.id} className="px-6 py-6 text-center">
                <p className="text-title-sm font-semibold text-primary">
                  {planName(pkg, t, locale)}
                </p>
                <p className="mt-1 text-label-sm text-on-surface-variant">
                  {isFree(pkg) ? (
                    monthlyPriceText(pkg, t, intlLocale)
                  ) : (
                    <>
                      <span dir="ltr">{monthlyPriceText(pkg, t, intlLocale)}</span>{" "}
                      {t("landing.pricingPerMonth")}
                    </>
                  )}
                </p>
                {!isFree(pkg) && annual && (
                  <p className="mt-0.5 text-label-xs text-on-surface-variant">
                    {t("landing.pricingAnnualAltBefore")}{" "}
                    <span dir="ltr">{annual}</span> {t("landing.pricingPerYear")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {COMPARISON_ROWS.map((row) => (
          <div
            key={row.key}
            data-compare-row={row.key}
            className={cn("grid border-t border-outline-variant", cols)}
          >
            <div className="px-8 py-4 text-body-sm font-medium text-on-surface">
              {t(row.labelKey)}
            </div>
            {plans.map((pkg) => (
              <div
                key={pkg.id}
                className="px-6 py-4 text-center text-body-sm text-on-surface-variant"
              >
                {needsLtrIsolation(row.key) ? (
                  <span dir="ltr" className="whitespace-nowrap">
                    {dimValue(pkg, row.key, t, locale, intlLocale)}
                  </span>
                ) : (
                  dimValue(pkg, row.key, t, locale, intlLocale)
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Mobile: stacked editorial blocks (never squeezes four columns) */}
      <div className="overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm lg:hidden">
        {COMPARISON_ROWS.map((row, i) => (
          <div
            key={row.key}
            data-compare-mobile-row={row.key}
            className={cn("px-6 py-5", i > 0 && "border-t border-outline-variant")}
          >
            <p className="text-label-sm font-semibold text-on-surface">{t(row.labelKey)}</p>
            <div className="mt-3 space-y-2.5">
              {plans.map((pkg) => (
                <div key={pkg.id} className="flex items-baseline justify-between gap-4">
                  <span
                    data-compare-plan-name={pkg.code}
                    className="text-body-sm text-on-surface-variant"
                  >
                    {planShortName(pkg, t, locale)}
                  </span>
                  <span data-compare-value={row.key} className="text-body-sm font-semibold text-on-surface">
                    {needsLtrIsolation(row.key) ? (
                      <span dir="ltr">{dimValue(pkg, row.key, t, locale, intlLocale)}</span>
                    ) : (
                      dimValue(pkg, row.key, t, locale, intlLocale)
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/* ── Restrained loading geometry (no bouncing spinner) ──────────────────── */

function LoadingState() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t("common.loading")} className="mt-12 sm:mt-16">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-[420px] rounded-3xl" />
        <Skeleton className="h-[420px] rounded-3xl" />
        <Skeleton className="h-[420px] rounded-3xl" />
      </div>
      <Skeleton className="mt-8 h-56 w-full rounded-3xl" />
    </div>
  );
}

/* ── Calm error state (never raw API errors) ────────────────────────────── */

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="mx-auto mt-12 flex max-w-xl flex-col items-center rounded-3xl border border-outline-variant bg-surface-container-lowest p-10 text-center sm:mt-16"
    >
      <h3 className="text-title-md font-semibold text-primary">
        {t("landing.pricingUnavailableTitle")}
      </h3>
      <p className="mt-2 text-body-md text-on-surface-variant">
        {t("landing.pricingUnavailableDesc")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-label-md font-semibold text-on-primary shadow-sm transition-all hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5] active:scale-[0.98]"
      >
        {t("common.retry")}
      </button>
    </div>
  );
}

/* ── Section ────────────────────────────────────────────────────────────── */

export function PricingSection() {
  const { t, dir } = useI18n();
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [shown, setShown] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    apiClient<{ success: true; data: PublicPackage[] }>("/public/packages", {
      signal: controller.signal,
      auth: false,
    })
      .then((res) => {
        setPackages(res.data ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    setReducedMotion(Boolean(reduce));
    if (reduce) {
      setShown(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const el = contentRef.current;
    if (!el) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const animate = !reducedMotion;
  const ready = !loading && !error && packages.length > 0;

  return (
    <section
      id="pricing"
      dir={dir}
      aria-labelledby="pricing-heading"
      className="relative scroll-mt-16 bg-surface"
    >
      {/* faint brand wash — depth, not decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(760px_340px_at_50%_0%,rgba(22,136,245,0.05),transparent_70%)]"
      />

      <div
        ref={contentRef}
        className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-20 pt-14 sm:pb-28 sm:pt-16"
      >
        {/* editorial intro */}
        <Reveal shown={shown} animate={animate}>
          <div className="max-w-2xl">
            <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
              {t("landing.pricingEyebrow")}
            </p>
            <h2
              id="pricing-heading"
              className="mt-4 text-balance text-[clamp(28px,3.4vw,42px)] font-bold leading-[1.15] tracking-[-0.02em] text-primary"
            >
              {t("landing.pricingHeadline1")}
              <br className="hidden min-[560px]:inline" /> {t("landing.pricingHeadline2")}
            </h2>
            <p className="mt-5 max-w-2xl text-body-lg leading-[1.7] text-on-surface-variant">
              {t("landing.pricingSupport")}
            </p>
          </div>
        </Reveal>

        {loading ? (
          <LoadingState />
        ) : error || packages.length === 0 ? (
          <ErrorState onRetry={() => setLoadAttempt((n) => n + 1)} />
        ) : (
          <>
            <PlanSurfaces plans={packages} shown={shown} animate={animate} />
            <ComparisonTable plans={packages} shown={shown} animate={animate} />
          </>
        )}

        {/* quiet closing — the final CTA is still coming later */}
        {ready && (
          <Reveal shown={shown} animate={animate} className="mt-14 flex flex-col items-center text-center sm:mt-24">
            <span aria-hidden="true" className="h-0.5 w-10 rounded-full bg-[#1688f5]" />
            <p className="mt-5 max-w-xl text-balance text-title-lg font-semibold leading-[1.6] text-primary sm:text-[22px]">
              {t("landing.pricingClosing1")}
              <br />
              <em className="not-italic text-[#0e5aa8]">{t("landing.pricingClosing2")}</em>
            </p>
          </Reveal>
        )}
      </div>
    </section>
  );
}
