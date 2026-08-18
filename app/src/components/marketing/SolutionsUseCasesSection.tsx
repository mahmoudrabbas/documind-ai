"use client";

/**
 * "Solutions & use cases" — who uses DocuMind and what for.
 *
 * Section 6 of the public landing page. Where Sections 3–5 explain HOW the
 * system works (pipeline, permission boundary, evidence trace), this section
 * answers WHO uses it and WHAT they use it for. One governed knowledge layer,
 * different teams, the right answer for each role.
 *
 * The composition is a single editorial rail, not four cards:
 *
 *   COMPANY KNOWLEDGE (one thin brand line, shared by all four rows)
 *   ──────────────────────────────────────────────
 *   01 CUSTOMER SUPPORT   → question   → source   → outcome
 *   02 HUMAN RESOURCES    → question   → source   → outcome
 *   03 PROCUREMENT        → question   → source   → outcome
 *   04 OPERATIONS         → question   → source   → outcome
 *
 * Each row is a horizontal editorial band: index + department on the start
 * side, the real question as the dominant h3, the company source file, and
 * a distinct grounded outcome. Permissions are felt through the examples,
 * not re-explained — Section 4 owns that story.
 *
 * The shared knowledge motif is one thin brand-blue vertical rail that runs
 * through a small repeating node at each row, tying every team back to the
 * same governed layer. It stays subtle and never becomes a workflow diagram.
 *
 * Motion is a one-time staged entrance (row by row) driven by
 * IntersectionObserver with short 300ms transitions. prefers-reduced-motion
 * shows the full resolved section immediately, and no meaning depends on
 * animation.
 *
 * Source filenames are Latin in both locales, so they are kept `dir="ltr"`
 * inside the RTL document to avoid reordering the glyphs.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { DocGlyph } from "./glyphs";

/** One scenario: which team, which question, which source, which outcome. */
const SCENARIOS: Array<{
  id: string;
  source: string;
  teamKey: string;
  qKey: string;
  outcomeKey: string;
  bodyKey: string;
}> = [
  {
    id: "support",
    source: "Customer_Support_SLA.pdf",
    teamKey: "landing.solTeamSupport",
    qKey: "landing.solQSupport",
    outcomeKey: "landing.solOutcomeSupport",
    bodyKey: "landing.solBodySupport",
  },
  {
    id: "hr",
    source: "Remote_Work_Policy.pdf",
    teamKey: "landing.solTeamHr",
    qKey: "landing.solQHr",
    outcomeKey: "landing.solOutcomeHr",
    bodyKey: "landing.solBodyHr",
  },
  {
    id: "procurement",
    source: "Procurement_Policy.pdf",
    teamKey: "landing.solTeamProcurement",
    qKey: "landing.solQProcurement",
    outcomeKey: "landing.solOutcomeProcurement",
    bodyKey: "landing.solBodyProcurement",
  },
  {
    id: "operations",
    source: "Travel_Expense_Policy.pdf",
    teamKey: "landing.solTeamOperations",
    qKey: "landing.solQOperations",
    outcomeKey: "landing.solOutcomeOperations",
    bodyKey: "landing.solBodyOperations",
  },
];

/** Document names are product identifiers — identical in both locales. */
function DocName({ name, className }: { name: string; className?: string }) {
  return (
    <span dir="ltr" className={cn("min-w-0 truncate", className)}>
      {name}
    </span>
  );
}

/** One staged entrance — opacity + small rise, flattened by reduced-motion. */
function Reveal({
  shown,
  delay,
  className,
  children,
}: {
  shown: boolean;
  delay?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "transition-all duration-300 ease-out",
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        className,
      )}
      style={{ transitionDelay: delay }}
    >
      {children}
    </div>
  );
}

export function SolutionsUseCasesSection() {
  const { t, dir } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setRevealed(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const el = canvasRef.current;
    if (!el) {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      id="solutions"
      dir={dir}
      aria-labelledby="solutions-heading"
      className="relative scroll-mt-20 bg-surface-container-lowest"
    >
      {/* very faint brand wash so the opening lifts off the flat surface */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(720px_320px_at_18%_5%,rgba(22,136,245,0.045),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-20 pt-14 sm:pb-28 sm:pt-16">
        {/* opening statement */}
        <div className="max-w-[820px]">
          <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgba(11,34,56,0.55)]">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
            {t("landing.solEyebrow")}
          </p>
          <h2
            id="solutions-heading"
            className="mt-4 text-balance text-[clamp(26px,3.2vw,40px)] font-bold leading-[1.18] tracking-[-0.02em] text-primary"
          >
            {t("landing.solTitle1")}
            <br className="hidden min-[560px]:inline" />
            {" "}
            <em className="not-italic text-[#0e5aa8]">{t("landing.solTitle2")}</em>
          </h2>
          <p className="mt-5 max-w-[680px] text-body-lg leading-[1.7] text-on-surface-variant">
            {t("landing.solSupport")}
          </p>
        </div>

        {/* the shared knowledge rail + the four scenario bands */}
        <div ref={canvasRef} className="mt-12 sm:mt-16">
          <div className="relative lg:ps-16">
            {/* one thin brand-blue path connecting all four scenarios to the same knowledge layer */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute start-16 bottom-0 top-0 hidden w-px bg-gradient-to-b from-[#1688f5]/60 via-[#1688f5]/25 to-[#1688f5]/45 lg:block"
            />

            {/* the governed-knowledge label the spine drops from */}
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-2 w-2 -ms-1 shrink-0 rounded-full bg-[#1688f5] shadow-[0_0_0_4px_rgba(22,136,245,0.15)]"
              />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0e5aa8]">
                {t("landing.solKnowledgeLabel")}
              </span>
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-r from-[#1688f5]/35 via-[#1688f5]/12 to-transparent"
              />
            </div>

            {/* the four scenario bands */}
            <div className="relative flex flex-col">
              {SCENARIOS.map((scenario, i) => {
                const rowDelay = `${i * 90}ms`;
                return (
                  <div
                    key={scenario.id}
                    data-scenario={scenario.id}
                    className={cn(
                      "relative grid gap-4 py-7 sm:gap-5 sm:py-8 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,1.55fr)_minmax(0,1.25fr)] lg:gap-x-7 lg:py-9",
                      i > 0 && "border-t border-outline-variant/55",
                    )}
                  >
                    {/* the repeating DocuMind node, sat on the shared spine */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -start-[5px] top-[2.5rem] hidden h-[10px] w-[10px] rounded-full bg-[#1688f5] ring-4 ring-[#1688f5]/15 lg:block"
                    />

                    {/* index + department */}
                    <Reveal shown={revealed} delay={rowDelay}>
                      <div className="flex min-w-0 flex-col gap-2">
                        <span className="text-[13px] font-bold tabular-nums tracking-[0.06em] text-[#1688f5]/65">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-on-surface-variant">
                          {t(scenario.teamKey)}
                        </p>
                      </div>
                    </Reveal>

                    {/* the real question — the dominant content in each band */}
                    <Reveal shown={revealed} delay={`${40 + i * 90}ms`}>
                      <div className="min-w-0">
                        <h3 className="text-balance text-[clamp(20px,2.15vw,28px)] font-bold leading-[1.28] tracking-[-0.01em] text-primary lg:max-w-[540px]">
                          {t(scenario.qKey)}
                        </h3>
                        <p className="mt-3 max-w-[540px] text-[14.5px] leading-[1.6] text-on-surface-variant">
                          {t(scenario.bodyKey)}
                        </p>
                      </div>
                    </Reveal>

                    {/* the company source → the grounded outcome */}
                    <Reveal shown={revealed} delay={`${80 + i * 90}ms`}>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant/65">
                          {t("landing.solSourceLabel")}
                        </p>
                        <div className="mt-2.5 flex min-w-0 items-center gap-2">
                          <DocGlyph className="h-4.5 w-4.5 shrink-0 text-[#1688f5]" />
                          <DocName
                            name={scenario.source}
                            className="flex-1 text-[15px] font-bold text-on-surface"
                          />
                        </div>
                        <div className="mt-5 flex items-start gap-2.5 border-t border-outline-variant/60 pt-4">
                          <span
                            aria-hidden="true"
                            className="mt-[0.45rem] h-[7px] w-[7px] shrink-0 rounded-[2px] bg-[#1688f5] shadow-[0_0_0_4px_rgba(22,136,245,0.12)]"
                          />
                          <span className="text-[clamp(19px,1.95vw,25px)] font-bold leading-[1.2] text-[#0e5aa8]">
                            {t(scenario.outcomeKey)}
                          </span>
                        </div>
                        </div>
                      </Reveal>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        {/* closing bridge — hands off to security & trust */}
        <div className="mt-16 flex flex-col items-center text-center sm:mt-24">
          <span aria-hidden="true" className="h-0.5 w-10 rounded-full bg-[#1688f5]" />
          <p className="mt-5 max-w-xl text-balance text-title-lg font-semibold leading-[1.6] text-primary sm:text-[22px]">
            {t("landing.solClosing1")}
            <br />
            {t("landing.solClosing2")}
          </p>
        </div>
      </div>
    </section>
  );
}