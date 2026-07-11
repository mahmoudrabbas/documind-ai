"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";

type PackageData = {
  _id: string;
  name: string;
  code: string;
  description: string;
  active: boolean;
  version: number;
  monthlyPrice: number;
  currency: string;
  limits: {
    users: number;
    documents: number;
    questionsPerMonth: number;
    storageMb: number;
  };
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
              <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
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

function PricingSection() {
  const { t, dir } = useI18n();
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <section id="pricing" className="bg-surface py-24" dir={dir}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading title={t("landing.pricingTitle")} subtitle={t("landing.pricingSubtitle")} />
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          </div>
        ) : packages.length === 0 ? (
          <div className="grid gap-8 md:grid-cols-3">
            <PricingCardFree t={t} />
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3 items-start">
            <PricingCardFree t={t} />
            {packages.map((pkg) => (
              <PricingCard key={pkg._id} pkg={pkg} t={t} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PricingCardFree({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-card">
      <h3 className="text-title-lg font-bold text-primary">{t("landing.pricingFree")}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-display-lg font-bold text-primary">$0</span>
        <span className="text-body-sm text-on-surface-variant">{t("landing.pricingMonthly")}</span>
      </div>
      <p className="mt-2 text-body-sm text-on-surface-variant">{t("landing.pricingFreeDesc")}</p>
      <ul className="mt-8 flex-1 space-y-3">
        {["3 users", "50 documents", "500 questions/mo", "100 MB storage"].map((item) => (
          <li key={item} className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-sm text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            {item}
          </li>
        ))}
      </ul>
      <Link
        href="/register"
        className="mt-8 block w-full rounded-xl border border-primary py-3 text-center text-label-md font-semibold text-primary transition-all hover:bg-primary hover:text-on-primary"
      >
        {t("landing.pricingFreeCta")}
      </Link>
    </div>
  );
}

function PricingCard({ pkg, t }: { pkg: PackageData; t: (key: string) => string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-card transition-shadow hover:shadow-popover">
      <h3 className="text-title-lg font-bold text-primary">{pkg.name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-display-lg font-bold text-primary">
          {pkg.currency === "USD" ? "$" : pkg.currency}{pkg.monthlyPrice}
        </span>
        <span className="text-body-sm text-on-surface-variant">{t("landing.pricingMonthly")}</span>
      </div>
      <p className="mt-2 text-body-sm text-on-surface-variant">{pkg.description}</p>
      <ul className="mt-8 flex-1 space-y-3">
        <li className="flex items-center gap-2 text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-sm text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          {pkg.limits.users} users
        </li>
        <li className="flex items-center gap-2 text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-sm text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          {pkg.limits.documents} documents
        </li>
        <li className="flex items-center gap-2 text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-sm text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          {pkg.limits.questionsPerMonth.toLocaleString()} questions/mo
        </li>
        <li className="flex items-center gap-2 text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-sm text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          {pkg.limits.storageMb} MB storage
        </li>
      </ul>
      <Link
        href={`/register?package=${pkg.code}`}
        className="mt-8 block w-full rounded-xl bg-primary py-3 text-center text-label-md font-semibold text-on-primary shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
      >
        {t("landing.pricingCta")}
      </Link>
    </div>
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
                className="flex w-full items-center justify-between gap-4 bg-surface px-6 py-5 text-left transition-colors hover:bg-surface-container-high"
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
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
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
