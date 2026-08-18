"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { HeroSection } from "@/components/marketing/HeroSection";
import { BuriedKnowledgeSection } from "@/components/marketing/BuriedKnowledgeSection";
import { HowDocuMindWorksSection } from "@/components/marketing/HowDocuMindWorksSection";
import { PermissionAwareIntelligenceSection } from "@/components/marketing/PermissionAwareIntelligenceSection";
import { GroundedAnswersEvidenceSection } from "@/components/marketing/GroundedAnswersEvidenceSection";
import { SolutionsUseCasesSection } from "@/components/marketing/SolutionsUseCasesSection";
import { SecurityTrustSection } from "@/components/marketing/SecurityTrustSection";
import { PricingSection } from "@/components/marketing/PricingSection";

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
 * Now owned by `@/components/marketing/SecurityTrustSection` — one
 * trust-architecture visual (two isolated organizations inside a single
 * DocuMind platform frame), a restrained activity trace, and three editorial
 * trust principles. It was moved out of this page module when the section
 * stopped being a grid of security cards.
 */

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
      <SecurityTrustSection />
      <PricingSection />
      <FeaturesSection />
      <FaqSection />
      <CtaSection />
    </div>
  );
}
