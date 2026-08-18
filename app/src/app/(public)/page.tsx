"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";
import { mbToGb } from "@/lib/storage";
import { HeroSection } from "@/components/marketing/HeroSection";
import { BuriedKnowledgeSection } from "@/components/marketing/BuriedKnowledgeSection";
import { HowDocuMindWorksSection } from "@/components/marketing/HowDocuMindWorksSection";
import { PermissionAwareIntelligenceSection } from "@/components/marketing/PermissionAwareIntelligenceSection";
import { GroundedAnswersEvidenceSection } from "@/components/marketing/GroundedAnswersEvidenceSection";
import { SolutionsUseCasesSection } from "@/components/marketing/SolutionsUseCasesSection";

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
    <div className={cn("mb-12", center && "mx-auto max-w-2xl text-center")}>
      <h2 className="text-headline-md text-primary sm:text-headline-lg">{title}</h2>
      <p className="mt-4 text-body-lg text-on-surface-variant">{subtitle}</p>
    </div>
  );
}

/** Section vertical rhythm — one shared value so the page keeps a steady beat. */
const SECTION_Y = "py-20 sm:py-24";
/** Offset for `id` sections so the fixed h-16 navbar stops clipping their tops. */
const ANCHOR_OFFSET = "scroll-mt-16";
/**
 * Content card on a light section. Padding is left to the caller.
 *
 * These cards used to carry no resting shadow and hover to `shadow-card` —
 * the softest token in the system — which made the hover invisible. Now they
 * rest at `shadow-card` and lift to `shadow-popover`.
 */
const CARD_CLASS =
  "rounded-xl border border-outline-variant bg-surface shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-popover";

/**
 * Hero product preview.
 *
 * The marketing hero now lives in `@/components/marketing/HeroSection` —
 * a dark field with a two-line promise, a permission-aware knowledge
 * system visual, and the dark→light hand-off. It was moved out of this
 * page module when it gained the product visual and transition.
 */

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
    <section id="features" className={cn("bg-surface-container-lowest", SECTION_Y, ANCHOR_OFFSET)} dir={dir}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.featuresTitle")} subtitle={t("landing.featuresSubtitle")} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className={cn(CARD_CLASS, "p-6")}>
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

/**
 * Security — the page's one dark band between the hero and the closing CTA.
 *
 * Seven consecutive light sections alternating only between #ffffff and
 * #f7f9fc read as one flat scroll. Putting the navy here breaks that run and
 * lands it where DESIGN.md wants it: on the institutional-trust message.
 */
function SecuritySection() {
  const { t, dir } = useI18n();
  const items = [
    { icon: "lock", title: t("landing.securityEncryption"), desc: t("landing.securityEncryptionDesc") },
    { icon: "business", title: t("landing.securityIsolation"), desc: t("landing.securityIsolationDesc") },
    { icon: "verified", title: t("landing.securityCompliance"), desc: t("landing.securityComplianceDesc") },
    { icon: "summarize", title: t("landing.securityAudit"), desc: t("landing.securityAuditDesc") },
  ];
  return (
    <section id="security" className={cn("relative overflow-hidden bg-primary", SECTION_Y, ANCHOR_OFFSET)} dir={dir}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-headline-md text-on-primary sm:text-headline-lg">{t("landing.securityTitle")}</h2>
          <p className="mt-4 text-body-lg text-on-primary/70">{t("landing.securitySubtitle")}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-on-primary/10 bg-primary-container/60 p-6 text-center transition-colors hover:border-on-primary/20 hover:bg-primary-container"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-fixed/15">
                <span className="material-symbols-outlined text-tertiary-fixed" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {item.icon}
                </span>
              </div>
              <h3 className="mt-4 text-title-lg text-on-primary">{item.title}</h3>
              <p className="mt-2 text-body-sm text-on-primary/70">{item.desc}</p>
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
      const gbVal = Math.round(mbToGb(value));
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
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1 text-label-xs text-on-primary shadow-sm">
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
            "text-title-lg",
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
              "text-display-sm",
              isRecommended ? "text-primary" : "text-on-surface",
            )}
          >
            {formatCurrency(isFree ? 0 : effectivePrice, pkg.currency)}
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
    <section id="pricing" className={cn("bg-surface", SECTION_Y, ANCHOR_OFFSET)} dir={dir}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.pricingTitle")} subtitle={t("landing.pricingSubtitle")} />

        <div className="mb-12 flex justify-center">
          {/* Raised off the section surface — this used to be bg-surface on a
              bg-surface section, so only its border separated the two. */}
          <div className="inline-flex items-center rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-1 shadow-card">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={cn(
                "rounded-lg px-5 py-2 text-label-md transition-all",
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
                "inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-label-md transition-all",
                annual
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-primary",
              )}
            >
              {t("billing.annual")}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-label-xs transition-colors",
                  annual
                    ? "bg-on-primary/20 text-on-primary"
                    : "bg-primary/10 text-primary",
                )}
              >
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
    <section id="faq" className={cn("bg-surface-container-lowest", SECTION_Y, ANCHOR_OFFSET)} dir={dir}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.faqTitle")} subtitle={t("landing.faqSubtitle")} />
        <div className="space-y-4">
          {faqs.map((faq, i) => {
            const open = openIndex === i;
            return (
              <div key={i} className="overflow-hidden rounded-xl border border-outline-variant">
                <button
                  id={`faq-question-${i}`}
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 bg-surface px-6 py-5 text-start transition-colors hover:bg-surface-container-high"
                  aria-expanded={open}
                  aria-controls={`faq-answer-${i}`}
                >
                  <span className="text-title-md text-primary">{faq.q}</span>
                  <span
                    aria-hidden="true"
                    className={cn("material-symbols-outlined shrink-0 text-on-surface-variant transition-transform", open && "rotate-180")}
                  >
                    expand_more
                  </span>
                </button>
                {open && (
                  <div
                    id={`faq-answer-${i}`}
                    role="region"
                    aria-labelledby={`faq-question-${i}`}
                    className="border-t border-outline-variant bg-surface px-6 py-5"
                  >
                    <p className="text-body-md text-on-surface-variant">{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  const { t, dir } = useI18n();
  return (
    <section className={cn("bg-primary", SECTION_Y)} dir={dir}>
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-headline-md text-on-primary sm:text-headline-lg">{t("landing.ctaTitle")}</h2>
        <p className="mx-auto mt-4 max-w-xl text-body-lg text-on-primary/70">{t("landing.ctaSubtitle")}</p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-on-primary px-8 py-3.5 text-title-lg text-primary shadow-lg shadow-primary/30 transition-all hover:opacity-90 active:scale-[0.98]"
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
      <BuriedKnowledgeSection />
      <HowDocuMindWorksSection />
      <PermissionAwareIntelligenceSection />
      <GroundedAnswersEvidenceSection />
      <SolutionsUseCasesSection />
      <FeaturesSection />
      <SecuritySection />
      <PricingSection />
      <FaqSection />
      <CtaSection />
    </div>
  );
}
