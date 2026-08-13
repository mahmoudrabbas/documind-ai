"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";

type PackageData = {
  id: string;
  name: string;
  code: string;
  description: string;
  monthlyPrice: number;
  annualPrice?: number;
  monthlyPriceCents?: number;
  annualPriceCents?: number;
  trialDays?: number;
  currency: string;
  entitlements: {
    employees: number;
    documents: number;
    queriesPerMonth: number;
    storageMb: number;
    admins?: number;
    fileSizeMb?: number;
    tokensPerMonth?: number;
    ocrPagesPerMonth?: number;
  };
  supportedModels?: string[];
  analyticsLevel?: string;
  supportLevel?: string;
  retentionDays?: number;
};

function SectionHeading({ title, subtitle, center = true }: { title: string; subtitle: string; center?: boolean }) {
  return (
    <div className={cn("mb-16", center && "mx-auto max-w-2xl text-center")}>
      <h2 className="text-headline-lg text-primary">{title}</h2>
      <p className="mt-4 text-body-lg text-on-surface-variant">{subtitle}</p>
    </div>
  );
}

function HeroSection() {
  const { t, dir } = useI18n();
  return (
    <section className="relative overflow-hidden bg-primary pb-24 pt-32 sm:pb-32 sm:pt-40">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.08),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,255,255,0.04),transparent_50%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" dir={dir}>
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-on-primary/20 bg-on-primary/10 px-4 py-1.5">
            <span className="material-symbols-outlined text-sm text-on-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>
              verified
            </span>
            <span className="text-label-sm text-on-primary/80">{t("landing.badge")}</span>
          </div>
          <h1 className="text-display-lg text-on-primary">{t("landing.heroTitle")}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-body-lg text-on-primary/70">{t("landing.heroSubtitle")}</p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-on-primary px-8 py-3.5 text-title-lg font-semibold text-primary shadow-lg shadow-primary/30 transition-all hover:opacity-90 active:scale-[0.98]"
            >
              {t("landing.heroCta")}
              <span className="material-symbols-outlined text-xl rtl:rotate-180" style={{ fontVariationSettings: "'FILL' 1" }}>
                arrow_forward
              </span>
            </Link>
            <a
              href="#"
              className="inline-flex items-center gap-2 rounded-xl border border-on-primary/20 px-8 py-3.5 text-title-lg font-semibold text-on-primary transition-all hover:bg-on-primary/10 active:scale-[0.98]"
            >
              {t("landing.heroCtaSecondary")}
            </a>
          </div>
          <p className="mt-8 text-label-sm text-on-primary/50">{t("landing.heroTrust")}</p>
        </div>
      </div>
    </section>
  );
}

function ValueSection() {
  const { t, dir } = useI18n();
  const items = [
    { icon: "cloud_upload", title: t("landing.valueItem1Title"), desc: t("landing.valueItem1Desc") },
    { icon: "question_answer", title: t("landing.valueItem2Title"), desc: t("landing.valueItem2Desc") },
    { icon: "fact_check", title: t("landing.valueItem3Title"), desc: t("landing.valueItem3Desc") },
  ];
  return (
    <section className="bg-surface-container-lowest py-24" dir={dir}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.valueTitle")} subtitle={t("landing.valueSubtitle")} />
        <div className="grid gap-8 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="rounded-xl border border-outline-variant bg-surface p-8 transition-shadow hover:shadow-card">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <span className="material-symbols-outlined text-on-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {item.icon}
                </span>
              </div>
              <h3 className="mt-6 text-title-lg text-primary">{item.title}</h3>
              <p className="mt-3 text-body-md text-on-surface-variant">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const { t, dir } = useI18n();
  const steps = [
    { step: "1", icon: "badge", title: t("landing.howItWorksStep1Title"), desc: t("landing.howItWorksStep1Desc") },
    { step: "2", icon: "description", title: t("landing.howItWorksStep2Title"), desc: t("landing.howItWorksStep2Desc") },
    { step: "3", icon: "chat", title: t("landing.howItWorksStep3Title"), desc: t("landing.howItWorksStep3Desc") },
  ];
  return (
    <section className="bg-surface py-24" dir={dir}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.howItWorksTitle")} subtitle={t("landing.howItWorksSubtitle")} />
        <div className="relative grid gap-8 md:grid-cols-3">
          {steps.map((item, i) => (
            <div key={item.step} className="relative flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-on-primary">
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {item.icon}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="absolute top-8 left-[calc(50%+3rem)] hidden h-0.5 w-[calc(100%-6rem)] bg-primary/20 md:block" />
              )}
              <div className="mt-4 flex h-8 w-8 items-center justify-center rounded-full bg-on-tertiary-container/10 text-label-sm font-semibold text-tertiary">
                {item.step}
              </div>
              <h3 className="mt-4 text-title-lg text-primary">{item.title}</h3>
              <p className="mt-2 max-w-xs text-body-md text-on-surface-variant">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const { t, dir } = useI18n();
  const features = [
    { icon: "layers", title: t("landing.feature1Title"), desc: t("landing.feature1Desc") },
    { icon: "auto_fix_high", title: t("landing.feature2Title"), desc: t("landing.feature2Desc") },
    { icon: "format_quote", title: t("landing.feature3Title"), desc: t("landing.feature3Desc") },
    { icon: "admin_panel_settings", title: t("landing.feature4Title"), desc: t("landing.feature4Desc") },
    { icon: "history", title: t("landing.feature5Title"), desc: t("landing.feature5Desc") },
    { icon: "api", title: t("landing.feature6Title"), desc: t("landing.feature6Desc") },
  ];
  return (
    <section id="features" className="bg-surface-container-lowest py-24" dir={dir}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.featuresTitle")} subtitle={t("landing.featuresSubtitle")} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-outline-variant bg-surface p-6 transition-shadow hover:shadow-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {feature.icon}
                </span>
              </div>
              <h3 className="mt-4 text-title-lg text-primary">{feature.title}</h3>
              <p className="mt-2 text-body-md text-on-surface-variant">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SecuritySection() {
  const { t, dir } = useI18n();
  const items = [
    { icon: "lock", title: t("landing.securityEncryption"), desc: t("landing.securityEncryptionDesc") },
    { icon: "business", title: t("landing.securityIsolation"), desc: t("landing.securityIsolationDesc") },
    { icon: "verified", title: t("landing.securityCompliance"), desc: t("landing.securityComplianceDesc") },
    { icon: "summarize", title: t("landing.securityAudit"), desc: t("landing.securityAuditDesc") },
  ];
  return (
    <section id="security" className="bg-surface py-24" dir={dir}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.securityTitle")} subtitle={t("landing.securitySubtitle")} />
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.title} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-tertiary/10">
                <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {item.icon}
                </span>
              </div>
              <h3 className="mt-4 text-title-lg text-primary">{item.title}</h3>
              <p className="mt-2 text-body-sm text-on-surface-variant">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function UseCasesSection() {
  const { t, dir } = useI18n();
  const cases = [
    { icon: "badge", title: t("landing.useCase1Title"), desc: t("landing.useCase1Desc") },
    { icon: "gavel", title: t("landing.useCase2Title"), desc: t("landing.useCase2Desc") },
    { icon: "settings", title: t("landing.useCase3Title"), desc: t("landing.useCase3Desc") },
    { icon: "biotech", title: t("landing.useCase4Title"), desc: t("landing.useCase4Desc") },
  ];
  return (
    <section className="bg-surface-container-lowest py-24" dir={dir}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.useCasesTitle")} subtitle={t("landing.useCasesSubtitle")} />
        <div className="grid gap-8 md:grid-cols-2">
          {cases.map((item) => (
            <div key={item.title} className="flex gap-6 rounded-xl border border-outline-variant bg-surface p-8 transition-shadow hover:shadow-card">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {item.icon}
                </span>
              </div>
              <div>
                <h3 className="text-title-lg text-primary">{item.title}</h3>
                <p className="mt-2 text-body-md text-on-surface-variant">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatCurrency(amount: number, currency: string): string {
  return formatMoneyMinor(amount, currency);
}

type TranslateFn = (key: string, params?: Record<string, string>) => string;
type PluralFn = (key: string, count: number, params?: Record<string, string>) => string;

/**
 * Render one entitlement row.
 *
 * Counts go through `tPlural` rather than an `n !== 1` suffix: Arabic
 * selects six plural categories, so English's singular/plural pair is
 * simply wrong for it. `{{count}}` is overridden with the locale-formatted
 * number wherever the original formatted the count for display.
 */
function formatEntitlementLabel(
  key: string,
  value: number,
  t: TranslateFn,
  tPlural: PluralFn,
  intlLocale: string,
): string {
  switch (key) {
    case "employees":
      return tPlural("billing.entitlementUsers", value);
    case "documents":
      return tPlural("billing.entitlementDocuments", value, {
        count: value.toLocaleString(intlLocale),
      });
    case "queriesPerMonth":
      return tPlural("billing.entitlementQuestionsPerMonth", value, {
        count: value.toLocaleString(intlLocale),
      });
    case "storageMb": {
      const gbVal = value >= 1000 ? Math.round(value / 1000) : Math.round(value / 1024);
      return value >= 1000
        ? t("billing.entitlementStorageGb", { value: String(gbVal) })
        : t("billing.entitlementStorageMb", { value: String(value) });
    }
    case "admins":
      return tPlural("billing.entitlementAdmins", value);
    case "fileSizeMb":
      return t("billing.entitlementFileSize", { value: String(value) });
    case "tokensPerMonth":
      return t("billing.entitlementTokensPerMonth", {
        value: (value / 1_000_000).toFixed(0),
      });
    case "ocrPagesPerMonth":
      return tPlural("billing.entitlementOcrPagesPerMonth", value, {
        count: value.toLocaleString(intlLocale),
      });
    default:
      // Unmapped machine key — surfaced verbatim so a new entitlement is
      // visible rather than silently dropped. Never user-facing copy.
      return `${key}: ${value}`;
  }
}

function getPackageName(pkg: PackageData, t: TranslateFn): string {
  const code = (pkg.code || "").toLowerCase();
  const name = (pkg.name || "").toLowerCase();

  const isAr = t("landing.pricingMonthly") === "/شهر";
  if (!isAr) return pkg.name;

  if (code === "free" || name.includes("free")) return "الخطة المجانية";
  if (code.includes("pro") || name.includes("pro")) return "دوكيوميند بروفيشينال";
  if (code.includes("ultra") || name.includes("ultra")) return "دوكيوميند ألترا";
  if (code.includes("enterprise") || name.includes("enterprise")) return "دوكيوميند للمؤسسات";

  const key = `billing.packageName.${code}`;
  const translated = t(key);
  return translated !== key ? translated : pkg.name;
}

function getPackageDescription(pkg: PackageData, t: TranslateFn): string {
  const code = (pkg.code || "").toLowerCase();
  const name = (pkg.name || "").toLowerCase();

  const isAr = t("landing.pricingMonthly") === "/شهر";
  if (!isAr) return pkg.description || "";

  if (code === "free" || name.includes("free")) {
    return "ابدأ بالميزات الأساسية للفرق الصغيرة.";
  }
  if (code.includes("pro") || name.includes("pro")) {
    return "الفئة الاحترافية للفرق والشركات المتنامية.";
  }
  if (code.includes("ultra") || name.includes("ultra")) {
    return "حدود فائقة الارتفاع لسير العمل في المؤسسات الكبيرة.";
  }
  if (code.includes("enterprise") || name.includes("enterprise")) {
    return "حدود مخصصة واتفاقيات مستوى الخدمة للمؤسسات الضخمة.";
  }

  const key = `billing.packageDesc.${code}`;
  const translated = t(key);
  return translated !== key ? translated : (pkg.description || "");
}

function getSupportLevelLabel(level: string, t: TranslateFn): string {
  const code = level.toLowerCase();
  const key = `billing.supportLevel.${code}`;
  const translated = t(key);
  if (translated !== key) return translated;

  const levelMap: Record<string, { en: string; ar: string }> = {
    community: { en: "community", ar: "مجتمعي" },
    standard: { en: "standard", ar: "قياسي" },
    priority: { en: "priority", ar: "ذو أولوية" },
    dedicated: { en: "dedicated", ar: "مخصص" },
  };

  if (levelMap[code]) {
    const isAr = t("landing.pricingMonthly") === "/شهر";
    return isAr ? levelMap[code].ar : levelMap[code].en;
  }
  return level;
}

function PricingCard({
  pkg,
  t,
  tPlural,
  intlLocale,
  annual,
  isRecommended,
  isFree,
}: {
  pkg: PackageData;
  t: TranslateFn;
  tPlural: PluralFn;
  intlLocale: string;
  annual: boolean;
  isRecommended?: boolean;
  isFree?: boolean;
}) {
  const effectivePrice = annual && pkg.annualPrice
    ? Math.round(pkg.annualPrice / 12)
    : pkg.monthlyPrice;

  const hasTrial = typeof pkg.trialDays === "number" && pkg.trialDays > 0;
  const annualSavings =
    annual && pkg.annualPrice && pkg.monthlyPrice > 0
      ? Math.round(
          ((pkg.monthlyPrice * 12 - pkg.annualPrice) /
            (pkg.monthlyPrice * 12)) *
            100,
        )
      : 0;

  const entitlementEntries = Object.entries(pkg.entitlements).filter(
    ([, v]) => typeof v === "number" && v > 0,
  );

  const packageName = getPackageName(pkg, t);
  const packageDesc = getPackageDescription(pkg, t);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-surface-container-lowest p-7 transition-all duration-200 sm:p-8",
        isRecommended
          ? "border-primary/40 shadow-md ring-1 ring-primary/10"
          : "border-outline-variant/60 shadow-card hover:border-outline-variant hover:shadow-md",
      )}
    >
      {isRecommended && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1 text-label-xs font-semibold text-on-primary shadow-sm">
            <span
              className="material-symbols-outlined text-sm"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
            {t("landing.pricingMostPopular")}
          </span>
        </div>
      )}

      {/* Reserved top badge slot so title h3 starts at identical vertical height across cards */}
      <div className="h-7 mb-3 flex items-center">
        {hasTrial ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-tertiary/10 px-3 py-1 text-label-xs font-medium text-tertiary">
            {tPlural("billing.entitlementTrialDays", pkg.trialDays ?? 0)}
          </span>
        ) : (
          <span className="inline-block h-6" />
        )}
      </div>

      {/* Reserved title & description height so prices align horizontally */}
      <div className="min-h-[76px] flex flex-col justify-start">
        <h3
          className={cn(
            "text-xl font-bold",
            isRecommended ? "text-primary" : "text-on-surface",
          )}
        >
          {packageName}
        </h3>

        {packageDesc ? (
          <p className="mt-1.5 text-body-sm text-on-surface-variant line-clamp-2">
            {packageDesc}
          </p>
        ) : null}
      </div>

      {/* Reserved price & annual savings height so divider line is perfectly aligned */}
      <div className="mt-4 min-h-[64px] flex flex-col justify-end">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-4xl font-extrabold tracking-tight",
              isRecommended ? "text-primary" : "text-on-surface",
            )}
          >
            {isFree ? "$0" : formatCurrency(effectivePrice, pkg.currency)}
          </span>
          {!isFree && (
            <span className="text-body-sm text-on-surface-variant">{t("landing.pricingMonthly")}</span>
          )}
        </div>

        {annual && annualSavings > 0 && pkg.annualPrice ? (
          <p className="mt-1 text-label-xs text-tertiary">
            {t("landing.pricingBilledAnnuallySave", {
              price: formatCurrency(pkg.annualPrice, pkg.currency),
              percent: annualSavings.toLocaleString(intlLocale),
            })}
          </p>
        ) : annual && pkg.annualPrice ? (
          <p className="mt-1 text-label-xs text-on-surface-variant">
            {t("landing.pricingBilledAnnually", {
              price: formatCurrency(pkg.annualPrice, pkg.currency),
            })}
          </p>
        ) : (
          <div className="h-4" />
        )}
      </div>

      <div className="my-5 h-px bg-outline-variant/50" />

      <ul className="flex-1 space-y-2.5">
        {entitlementEntries.map(([key, value]) => (
          <li
            key={key}
            className="flex items-start gap-2.5 text-sm text-on-surface-variant"
          >
            <span
              className={cn(
                "material-symbols-outlined mt-0.5 text-base shrink-0",
                isRecommended ? "text-primary" : "text-tertiary",
              )}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
            <span>{formatEntitlementLabel(key, value, t, tPlural, intlLocale)}</span>
          </li>
        ))}

        {pkg.supportedModels && pkg.supportedModels.length > 0 && (
          <li className="flex items-start gap-2.5 text-sm text-on-surface-variant">
            <span
              className={cn(
                "material-symbols-outlined mt-0.5 text-base shrink-0",
                isRecommended ? "text-primary" : "text-tertiary",
              )}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
            <span>{tPlural("billing.entitlementAiModels", pkg.supportedModels.length)}</span>
          </li>
        )}

        {pkg.supportLevel && (
          <li className="flex items-start gap-2.5 text-sm text-on-surface-variant">
            <span
              className={cn(
                "material-symbols-outlined mt-0.5 text-base shrink-0",
                isRecommended ? "text-primary" : "text-tertiary",
              )}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
            <span>
              {t("billing.entitlementSupport", {
                level: getSupportLevelLabel(pkg.supportLevel, t),
              })}
            </span>
          </li>
        )}

        {typeof pkg.retentionDays === "number" && pkg.retentionDays > 0 && (
          <li className="flex items-start gap-2.5 text-sm text-on-surface-variant">
            <span
              className={cn(
                "material-symbols-outlined mt-0.5 text-base shrink-0",
                isRecommended ? "text-primary" : "text-tertiary",
              )}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
            <span>{tPlural("billing.entitlementRetentionDays", pkg.retentionDays)}</span>
          </li>
        )}
      </ul>

      <Link
        href={isFree ? "/register" : `/register?package=${pkg.code}`}
        className={cn(
          "mt-6 block w-full rounded-xl py-3 text-center text-label-md font-semibold transition-all active:scale-[0.98]",
          isRecommended
            ? "bg-primary text-on-primary shadow-sm hover:opacity-90"
            : "border border-primary bg-transparent text-primary hover:bg-primary hover:text-on-primary",
        )}
      >
        {isFree ? t("landing.pricingFreeCta") : t("landing.pricingCta")}
      </Link>
    </div>
  );
}

function PricingSection() {
  const { t, tPlural, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await apiClient<{ success: boolean; data: PackageData[] }>("/public/packages", { auth: false });
        if (active) setPackages(response.data);
      } catch {
        // Fallback to empty
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const paidPackages = packages.filter((p) => p.code !== "free");
  const freePkg = packages.find((p) => p.code === "free");
  const recommendedCode =
    paidPackages.length >= 2
      ? paidPackages[paidPackages.length - 1]?.code
      : paidPackages.length === 1
        ? paidPackages[0].code
        : null;

  const gridCols =
    packages.length <= 2
      ? "md:grid-cols-2"
      : "md:grid-cols-2 lg:grid-cols-3";

  return (
    <section id="pricing" className="bg-surface py-24" dir={dir}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.pricingTitle")} subtitle={t("landing.pricingSubtitle")} />

        <div className="mb-12 flex justify-center">
          <div className="inline-flex items-center rounded-xl border border-outline-variant bg-surface p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={cn(
                "rounded-lg px-5 py-2 text-label-md font-medium transition-all",
                !annual
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-primary",
              )}
            >
              {t("billing.monthly")}
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-label-md font-medium transition-all",
                annual
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-primary",
              )}
            >
              {t("billing.annual")}
              <span className="rounded-full bg-tertiary/10 px-2 py-0.5 text-label-xs text-tertiary">
                {t("landing.pricingSaveBadge")}
              </span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          </div>
        ) : packages.length === 0 ? (
          <p className="py-12 text-center text-on-surface-variant">{t("billing.empty")}</p>
        ) : (
          <div className={cn("grid items-stretch gap-6 lg:gap-8", gridCols)}>
            {freePkg ? (
              <PricingCard
                pkg={freePkg}
                t={t}
                tPlural={tPlural}
                intlLocale={intlLocale}
                annual={annual}
                isFree
              />
            ) : null}
            {paidPackages.map((pkg) => (
              <PricingCard
                key={pkg.id}
                pkg={pkg}
                t={t}
                tPlural={tPlural}
                intlLocale={intlLocale}
                annual={annual}
                isRecommended={pkg.code === recommendedCode}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FaqSection() {
  const { t, dir } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const faqs = [
    { q: t("landing.faq1Q"), a: t("landing.faq1A") },
    { q: t("landing.faq2Q"), a: t("landing.faq2A") },
    { q: t("landing.faq3Q"), a: t("landing.faq3A") },
    { q: t("landing.faq4Q"), a: t("landing.faq4A") },
    { q: t("landing.faq5Q"), a: t("landing.faq5A") },
    { q: t("landing.faq6Q"), a: t("landing.faq6A") },
  ];

  return (
    <section id="faq" className="bg-surface-container-lowest py-24" dir={dir}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.faqTitle")} subtitle={t("landing.faqSubtitle")} />
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-outline-variant">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 bg-surface px-6 py-5 text-start transition-colors hover:bg-surface-container-high"
                aria-expanded={openIndex === i}
              >
                <span className="text-title-lg text-primary">{faq.q}</span>
                <span className={cn("material-symbols-outlined shrink-0 text-on-surface-variant transition-transform", openIndex === i && "rotate-180")}>
                  expand_more
                </span>
              </button>
              {openIndex === i && (
                <div className="border-t border-outline-variant bg-surface px-6 py-5">
                  <p className="text-body-md text-on-surface-variant">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  const { t, dir } = useI18n();
  return (
    <section className="bg-primary py-24" dir={dir}>
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-headline-lg text-on-primary">{t("landing.ctaTitle")}</h2>
        <p className="mx-auto mt-4 max-w-xl text-body-lg text-on-primary/70">{t("landing.ctaSubtitle")}</p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-on-primary px-8 py-3.5 text-title-lg font-semibold text-primary shadow-lg shadow-primary/30 transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {t("landing.ctaButton")}
            <span className="material-symbols-outlined text-xl rtl:rotate-180" style={{ fontVariationSettings: "'FILL' 1" }}>
              arrow_forward
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { dir } = useI18n();
  return (
    <div dir={dir}>
      <HeroSection />
      <ValueSection />
      <HowItWorksSection />
      <FeaturesSection />
      <SecuritySection />
      <UseCasesSection />
      <PricingSection />
      <FaqSection />
      <CtaSection />
    </div>
  );
}
