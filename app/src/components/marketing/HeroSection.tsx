"use client";

/**
 * Public marketing hero — dark field, product promise on the left,
 * knowledge system on the right.
 *
 * The composition follows the approved mockup: a two-line headline, a
 * single primary action, a quiet trust line, and the product visual that
 * carries the story. Below the fold the HeroTransition hands off to the
 * first light section.
 *
 * Two columns only at ≥1280px. The system UI typeface is wider than the
 * mockup's Inter, so below that width the column can't hold the two-line
 * composition at the approved scale — the hero stacks, the copy goes full
 * width, and the product centres underneath.
 */

import Link from "next/link";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { KnowledgeSystem } from "./KnowledgeSystem";
import { HeroTransition } from "./HeroTransition";

const RISE = "animate-hero-rise";

const TRUST_ITEMS = [
  "landing.heroTrust1",
  "landing.heroTrust2",
  "landing.heroTrust3",
  "landing.heroTrust4",
];

export function HeroSection() {
  const { t, dir } = useI18n();
  return (
    <section
      className="relative overflow-hidden bg-primary"
      dir={dir}
      aria-labelledby="hero-heading"
    >
      {/* restrained background washes — depth, not decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.08),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_420px_at_78%_38%,rgba(22,136,245,0.08),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_320px_at_20%_70%,rgba(99,216,218,0.05),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-10 pt-28 sm:pt-32 min-[1280px]:pb-0 min-[1280px]:pt-[calc(4rem+48px)]">
        <div className="flex flex-col items-start gap-10 min-[1280px]:min-h-[calc(100svh-12rem)] min-[1280px]:flex-row min-[1280px]:items-center min-[1280px]:gap-[clamp(40px,3.4vw,56px)] min-[1280px]:py-16 min-[1280px]:pt-8">
          {/* copy — flexible column */}
          <div className={cn("w-full min-w-0", RISE, "min-[1280px]:flex-1")}>
            <p className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.09em] text-on-primary/45">
              <span
                aria-hidden="true"
                className="h-0.5 w-[22px] rounded-full bg-gradient-to-r from-[#1688f5] to-tertiary-fixed-dim"
              />
              {t("landing.heroEyebrow")}
            </p>

            <h1
              id="hero-heading"
              className="mt-4 text-balance text-[clamp(29px,8.3vw,32px)] font-bold leading-[1.16] tracking-[-0.02em] text-white min-[560px]:mt-5 min-[560px]:text-[clamp(36px,4vw,52px)] min-[560px]:leading-[1.08] min-[560px]:tracking-[-0.025em] min-[1280px]:text-[clamp(44px,3.8vw,56px)]"
            >
              {t("landing.heroTitleLine1")}
              <br className="hidden min-[560px]:inline" />
              {t("landing.heroTitleLine2")}
            </h1>

            <p className="mt-4 max-w-[560px] text-[17px] leading-[1.62] text-on-primary/70 min-[560px]:mt-5">
              {t("landing.heroSupport")}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-4 min-[560px]:mt-8">
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 rounded-xl bg-on-primary px-8 py-3.5 text-title-lg font-semibold text-primary shadow-lg shadow-primary/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e5f2ff] hover:shadow-[0_10px_30px_rgba(22,136,245,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5] active:scale-[0.98] motion-reduce:transform-none"
              >
                {t("landing.heroCtaPrimary")}
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-xl transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  arrow_forward
                </span>
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 border-b border-on-primary/25 pb-1 text-title-md font-medium text-on-primary/70 transition-colors duration-200 hover:border-on-primary/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5]"
              >
                {t("landing.heroCtaSecondary")}
                {/* Points down the page, so it is not mirrored in RTL. */}
                <span aria-hidden="true" className="material-symbols-outlined text-lg">
                  arrow_downward
                </span>
              </a>
            </div>

            <ul className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] font-medium text-on-primary/40 min-[560px]:mt-7">
              {TRUST_ITEMS.map((key, i) => (
                <li key={key} className="flex items-center gap-x-2.5">
                  {i > 0 && (
                    <span aria-hidden="true" className="text-on-primary/30">
                      ·
                    </span>
                  )}
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>

          {/* product — fixed-width column on desktop, centred when stacked */}
          <div
            className={cn(
              "w-full max-w-[600px] min-w-0 self-center",
              RISE,
              "min-[1280px]:w-[clamp(480px,36.5vw,526px)] min-[1280px]:max-w-none",
            )}
            style={{ animationDelay: "120ms" }}
          >
            <KnowledgeSystem />
          </div>
        </div>
      </div>

      <HeroTransition />
    </section>
  );
}
