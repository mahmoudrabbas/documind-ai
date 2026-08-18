"use client";

import { useI18n } from "@/providers/i18n-provider";
import { HeroSection } from "@/components/marketing/HeroSection";
import { BuriedKnowledgeSection } from "@/components/marketing/BuriedKnowledgeSection";
import { HowDocuMindWorksSection } from "@/components/marketing/HowDocuMindWorksSection";
import { PermissionAwareIntelligenceSection } from "@/components/marketing/PermissionAwareIntelligenceSection";
import { GroundedAnswersEvidenceSection } from "@/components/marketing/GroundedAnswersEvidenceSection";
import { SolutionsUseCasesSection } from "@/components/marketing/SolutionsUseCasesSection";
import { SecurityTrustSection } from "@/components/marketing/SecurityTrustSection";
import { PricingSection } from "@/components/marketing/PricingSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { FinalCtaSection } from "@/components/marketing/FinalCtaSection";

/**
 * Hero product preview.
 *
 * The marketing hero now lives in `@/components/marketing/HeroSection` —
 * a dark field with a two-line promise, a permission-aware knowledge
 * system visual, and the dark→light hand-off. It was moved out of this
 * page module when it gained the product visual and transition.
 */

/**
 * Security — the page's first dark band between the hero and the closing CTA.
 *
 * Now owned by `@/components/marketing/SecurityTrustSection` — one
 * trust-architecture visual (two isolated organizations inside a single
 * DocuMind platform frame), a restrained activity trace, and three editorial
 * trust principles. It was moved out of this page module when the section
 * stopped being a grid of security cards.
 */

/**
 * FAQ — buyer questions before starting.
 *
 * Now owned by `@/components/marketing/FaqSection` — an editorial ruled
 * accordion (intro + nine verified questions) that replaces the old
 * six-question card FAQ. Every answer is product-verified; the legacy
 * `landing.faq1Q`-style keys were removed along with the inline component.
 */

/**
 * Final CTA — the closing band.
 *
 * Now owned by `@/components/marketing/FinalCtaSection` — a deep-navy
 * closing moment that answers "Am I ready to start?" and hands the visitor
 * to `/register` (with a quiet sign-in for existing users). It replaced the
 * old inline CtaSection and its trial-specific copy.
 */

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
      <FaqSection />
      <FinalCtaSection />
    </div>
  );
}
