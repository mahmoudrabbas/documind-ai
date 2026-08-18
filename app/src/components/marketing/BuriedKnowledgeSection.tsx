"use client";

/**
 * First light section — "the buried-knowledge problem".
 *
 * Opens on the statement the hero's dark field hands off to, then walks the
 * reasons knowledge gets buried: fragmented sources, no single source of
 * truth, permission gaps, and answers without evidence. The four problems
 * read as an editorial numbered list — hairline dividers and index numbers
 * rather than boxed cards — so the page stays composed and product-strategic
 * instead of template-like.
 */

import { useI18n } from "@/providers/i18n-provider";

const PROBLEMS = [
  { title: "landing.buriedProb1Title", desc: "landing.buriedProb1Desc" },
  { title: "landing.buriedProb2Title", desc: "landing.buriedProb2Desc" },
  { title: "landing.buriedProb3Title", desc: "landing.buriedProb3Desc" },
  { title: "landing.buriedProb4Title", desc: "landing.buriedProb4Desc" },
];

export function BuriedKnowledgeSection() {
  const { t, dir } = useI18n();
  return (
    <section
      className="relative overflow-hidden bg-surface-container-lowest"
      dir={dir}
      aria-labelledby="buried-heading"
    >
      {/* very faint brand wash so the opening lifts off the flat surface */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(760px_340px_at_20%_6%,rgba(22,136,245,0.05),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-20 pt-10 sm:pb-28 sm:pt-14">
        {/* opening statement — handed off from the dark field */}
        <div className="max-w-[820px]">
          <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgba(11,34,56,0.55)]">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
            {t("landing.buriedEyebrow")}
          </p>
          <h2
            id="buried-heading"
            className="mt-4 text-balance text-[clamp(26px,3.2vw,40px)] font-bold leading-[1.18] tracking-[-0.02em] text-primary"
          >
            {t("landing.buriedTitle1")}
            <br className="hidden min-[560px]:inline" />
            {" "}
            {t("landing.buriedTitle2")}
            <em className="not-italic text-[#0e5aa8]">{t("landing.buriedTitle3")}</em>
          </h2>
          <p className="mt-5 max-w-[660px] text-body-lg leading-[1.7] text-on-surface-variant">
            {t("landing.buriedLead")}
          </p>
        </div>

        {/* the four problems — editorial numbered rows */}
        <div className="mt-14 sm:mt-20">
          <div className="grid gap-x-14 border-t border-outline-variant/70 lg:grid-cols-2">
            {PROBLEMS.map((problem, i) => (
              <div
                key={problem.title}
                className="flex gap-6 border-b border-outline-variant/70 py-8 sm:py-9"
              >
                <span
                  aria-hidden="true"
                  className="shrink-0 pt-1 text-[13px] font-bold tabular-nums tracking-[0.06em] text-[#1688f5]/55"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <h3 className="text-title-lg font-semibold text-primary sm:text-[22px] sm:leading-7">
                    {t(problem.title)}
                  </h3>
                  <p className="mt-2 max-w-md text-body-md leading-[1.65] text-on-surface-variant">
                    {t(problem.desc)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* pivot — the product answers the problem */}
          <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-14">
            <p className="max-w-[640px] text-title-md leading-[1.6] text-primary/85">
              {t("landing.buriedClosing")}
            </p>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 border-b border-primary/25 pb-1 text-title-md font-semibold text-[#0e5aa8] transition-colors duration-200 hover:border-[#0e5aa8]"
            >
              {t("landing.buriedClosingLink")}
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-lg rtl:rotate-180"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                arrow_forward
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}