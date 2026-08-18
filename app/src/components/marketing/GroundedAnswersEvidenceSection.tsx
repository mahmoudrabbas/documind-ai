"use client";

/**
 * "Grounded answers & evidence" — the answer-trace section.
 *
 * Section 5 of the public landing page. Where Section 3 shows the process
 * (Connect → Understand → Govern → Retrieve → Answer) and Section 4 shows
 * the authorization boundary, this section deepens one promise: an answer
 * is only trustworthy when the user can follow it back to the evidence.
 *
 * The composition is ONE evidence trace inside a deep-navy canvas:
 *
 *   QUESTION → ANSWER → CITATION [1] → VERIFIED SOURCE → EVIDENCE EXCERPT
 *
 * The answer ("15 minutes") is the visual payoff; a citation marker [1]
 * connects it to the evidence panel, which repeats the marker, names the
 * authorized source, shows the exact supporting sentence with only the
 * relevant fragment highlighted, and carries quiet provenance metadata.
 *
 * A restrained two-state control switches between the grounded answer and
 * an insufficient-evidence refusal — calm and neutral, never an error. When
 * evidence is insufficient no fabricated answer is shown.
 *
 * Motion is a one-time staged entrance (question → answer → citation →
 * evidence → excerpt highlight) driven by IntersectionObserver with CSS
 * transitions. prefers-reduced-motion shows the full resolved trace at
 * once, and the state switch never depends on animation.
 *
 * Filenames and source identifiers are Latin in both locales, so they are
 * kept `dir="ltr"` inside the RTL document to avoid reordering the glyphs.
 */

import { useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { CheckGlyph, DocGlyph } from "./glyphs";
import { useRevealOnView } from "./motion";

/** Latin product identifier — identical in both locales. */
const SOURCE_FILE = "Customer_Support_SLA.pdf";

type StateId = "supported" | "insufficient";

const PRINCIPLES = [
  "landing.groundPrinciple1Title",
  "landing.groundPrinciple2Title",
  "landing.groundPrinciple3Title",
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
        "transition-all duration-500 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        className,
      )}
      style={{ transitionDelay: delay }}
    >
      {children}
    </div>
  );
}

/** The shared citation marker — its repetition ties answer to evidence. */
function SourceNode({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[rgba(22,136,245,0.4)] bg-[rgba(22,136,245,0.18)] text-[11px] font-bold text-[#9bcfff]"
    >
      {children}
    </span>
  );
}

/** Quiet "Q" marker used at the start of each question row. */
function QuestionMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[rgba(22,136,245,0.18)] text-[12px] font-bold text-[#9bcfff]"
    >
      Q
    </span>
  );
}

/** Two-state switch — plain buttons, keyboard-safe, RTL-safe, no animation. */
function StateToggle({
  state,
  onChange,
}: {
  state: StateId;
  onChange: (next: StateId) => void;
}) {
  const { t } = useI18n();
  const options: Array<{ id: StateId; key: string }> = [
    { id: "supported", key: "landing.groundToggleSupported" },
    { id: "insufficient", key: "landing.groundToggleInsufficient" },
  ];
  return (
    <div
      role="group"
      aria-label={t("landing.groundToggleLabel")}
      className="inline-flex items-center rounded-lg border border-white/[0.12] bg-white/[0.04] p-1"
    >
      {options.map((opt) => {
        const active = state === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[11.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-fixed",
              active
                ? "bg-[#1688f5] text-white shadow-sm"
                : "text-on-primary/70 hover:text-white",
            )}
          >
            {t(opt.key)}
          </button>
        );
      })}
    </div>
  );
}

/** State 1 — QUESTION → ANSWER → CITATION → VERIFIED SOURCE → EVIDENCE. */
function SupportedTrace({ shown }: { shown: boolean }) {
  const { t, dir } = useI18n();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-x-14">
      {/* answer surface */}
      <div className="flex min-w-0 flex-col">
        <Reveal shown={shown}>
          <p className="flex items-start gap-2.5 text-[13.5px] font-medium leading-[1.6] text-on-primary/85 sm:text-[15px]">
            <QuestionMark />
            <span dir={dir} className="min-w-0">
              {t("landing.groundQuestionSupported")}
            </span>
          </p>
        </Reveal>

        <Reveal shown={shown} delay="120ms">
          <p className="mt-6 flex items-center gap-3 text-[clamp(44px,5vw,64px)] font-bold leading-none tracking-[-0.02em] text-white">
            <span
              aria-hidden="true"
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-[2px] bg-[#1688f5] shadow-[0_0_0_4px_rgba(22,136,245,0.14)]"
            />
            <span dir={dir}>{t("landing.groundAnswerSupported")}</span>
          </p>
        </Reveal>

        <Reveal shown={shown} delay="180ms">
          <p className="mt-4 max-w-[360px] text-[13.5px] leading-[1.6] text-on-primary/75 sm:text-[14.5px]">
            {t("landing.groundAnswerBody")}
          </p>
        </Reveal>

        {/* the citation — the answer's reference, traced toward the evidence */}
        <Reveal shown={shown} delay="240ms" className="mt-auto pt-8">
          <div className="flex items-center gap-2.5 border-t border-white/10 pt-3.5">
            <SourceNode>1</SourceNode>
            <span dir="ltr" className="min-w-0 truncate text-[13.5px] font-semibold text-white">
              {t("landing.groundCitationSource")}
            </span>
            <span
              aria-hidden="true"
              className="hidden h-px flex-1 bg-gradient-to-r from-[rgba(155,207,255,0.2)] to-[rgba(155,207,255,0.55)] lg:block"
            />
            <span
              aria-hidden="true"
              className="material-symbols-outlined hidden text-[16px] text-[#9bcfff] rtl:rotate-180 lg:block"
            >
              chevron_right
            </span>
          </div>
        </Reveal>

        {/* mobile-only connector down to the evidence panel */}
        <div aria-hidden="true" className="flex flex-col items-center py-1 lg:hidden">
          <span className="h-3.5 w-px bg-[rgba(155,207,255,0.35)]" />
          <span className="material-symbols-outlined text-[14px] leading-none text-[#9bcfff]">
            chevron_down
          </span>
        </div>
      </div>

      {/* evidence panel — the source, inspected */}
      <div className="min-w-0">
        <Reveal shown={shown} delay="300ms">
          <div className="relative rounded-xl border border-white/[0.1] bg-[#0a2033]/60 p-4 shadow-lg shadow-black/10 sm:p-5">
            <span
              aria-hidden="true"
              className="absolute inset-y-0 start-0 w-[3px] rounded-s-xl bg-[#1688f5]"
            />
            <div className="flex items-center gap-2.5">
              <SourceNode>1</SourceNode>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-tertiary-fixed">
                <CheckGlyph className="h-3 w-3" />
                {t("landing.groundVerifiedLabel")}
              </span>
            </div>

            <div className="mt-2.5 flex min-w-0 items-center gap-2">
              <DocGlyph className="h-4 w-4 shrink-0 text-tertiary-fixed-dim" />
              <DocName name={SOURCE_FILE} className="flex-1 text-[14.5px] font-bold text-white" />
            </div>
            <p className="mt-0.5 ps-6 text-[12px] font-medium text-on-primary/62">
              {t("landing.groundEvidenceContext")}
            </p>

            {/* the supporting sentence — only the relevant fragment is highlighted */}
            <blockquote className="mt-3 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5">
              <p className="text-[13px] leading-[1.6] text-on-primary/88">
                {t("landing.groundExcerptBefore")}
                <mark className="rounded-[3px] bg-[rgba(22,136,245,0.22)] px-1 py-px font-semibold text-[#cde7ff]">
                  {t("landing.groundExcerptMark")}
                </mark>
                {t("landing.groundExcerptAfter")}
              </p>
            </blockquote>

            {/* quiet provenance metadata */}
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-on-primary/52">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#1688f5]" />
                {t("landing.groundMetaPolicy")}
              </span>
              <span aria-hidden="true" className="text-on-primary/30">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckGlyph className="h-3 w-3 text-tertiary-fixed-dim" />
                {t("landing.groundMetaAuthorized")}
              </span>
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

/** State 2 — evidence is insufficient: a calm refusal, never a fabricated answer. */
function InsufficientTrace({ shown }: { shown: boolean }) {
  const { t, dir } = useI18n();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-14">
      <div className="min-w-0">
        <Reveal shown={shown}>
          <p className="flex items-start gap-2.5 text-[13.5px] font-medium leading-[1.6] text-on-primary/85 sm:text-[15px]">
            <QuestionMark />
            <span dir={dir} className="min-w-0">
              {t("landing.groundQuestionInsufficient")}
            </span>
          </p>
        </Reveal>

        <Reveal shown={shown} delay="120ms">
          <div className="mt-6 rounded-xl border border-white/[0.09] bg-white/[0.04] p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06]">
              <span className="material-symbols-outlined text-[22px] text-on-primary/70" aria-hidden="true">
                document_search
              </span>
            </span>
            <div className="mt-3 text-[17px] font-semibold text-white">
              {t("landing.groundNoEvidenceTitle")}
            </div>
            <p className="mt-1.5 max-w-[400px] text-[13.5px] leading-[1.6] text-on-primary/75">
              {t("landing.groundNoEvidenceBody")}
            </p>
          </div>
        </Reveal>
      </div>

      <div className="min-w-0">
        <Reveal shown={shown} delay="200ms">
          <div className="relative rounded-xl border border-white/[0.09] bg-[#0a2033]/40 p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-on-primary/55">
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                document_search
              </span>
              {t("landing.groundNoSourceLabel")}
            </p>
            <p className="mt-2 max-w-[360px] text-[13px] leading-[1.6] text-on-primary/62">
              {t("landing.groundNoSourceBody")}
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

export function GroundedAnswersEvidenceSection() {
  const { t, dir } = useI18n();
  const [state, setState] = useState<StateId>("supported");
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const { revealed } = useRevealOnView(canvasRef);

  return (
    <section
      id="grounded-answers"
      dir={dir}
      aria-labelledby="grounded-answers-heading"
      className="relative scroll-mt-20 bg-surface"
    >
      {/* very faint brand wash so the opening lifts off the flat surface */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(760px_340px_at_22%_6%,rgba(22,136,245,0.05),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-20 pt-14 sm:pb-28 sm:pt-16">
        {/* opening statement */}
        <div className="max-w-[820px]">
          <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgba(11,34,56,0.55)]">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
            {t("landing.groundEyebrow")}
          </p>
          <h2
            id="grounded-answers-heading"
            className="mt-4 text-balance text-[clamp(26px,3.2vw,40px)] font-bold leading-[1.18] tracking-[-0.02em] text-primary"
          >
            {t("landing.groundTitle1")}
            <br className="hidden min-[560px]:inline" />
            {" "}
            <em className="not-italic text-[#0e5aa8]">{t("landing.groundTitle2")}</em>
          </h2>
          <p className="mt-5 max-w-[680px] text-body-lg leading-[1.7] text-on-surface-variant">
            {t("landing.groundSupport")}
          </p>
        </div>

        {/* the evidence trace — one deep-navy canvas */}
        <div
          ref={canvasRef}
          className="relative mt-12 overflow-hidden rounded-2xl border border-white/[0.14] bg-gradient-to-b from-primary-container/95 to-[#0b2238]/95 shadow-modal"
        >
          {/* hairline accent across the top edge */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(22,136,245,0.4)] to-transparent"
          />
          {/* soft contained wash so the surface lifts off the light section */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(120%_90%_at_18%_0%,rgba(22,136,245,0.12),transparent_70%)]"
          />

          {/* canvas header — label + evidence-state switch */}
          <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.09] px-5 py-4 sm:px-6">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-primary/65">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
              {t("landing.groundCanvasLabel")}
            </p>
            <StateToggle state={state} onChange={setState} />
          </div>

          {/* canvas body — the active evidence story */}
          <div className="relative min-h-[300px] px-5 py-6 sm:min-h-[280px] sm:px-6 sm:py-7">
            <div className="transition-opacity duration-200 motion-reduce:transition-none">
              {state === "supported" ? (
                <SupportedTrace shown={revealed} />
              ) : (
                <InsufficientTrace shown={revealed} />
              )}
            </div>
          </div>
        </div>

        {/* why it matters — editorial statement, not a card */}
        <div className="mt-14 grid gap-8 sm:mt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <h3 className="max-w-[380px] text-balance text-title-lg font-semibold leading-snug text-primary sm:text-[26px] sm:leading-9">
            {t("landing.groundWhyTitle")}
          </h3>
          <p className="max-w-[560px] text-body-lg leading-[1.7] text-on-surface-variant">
            {t("landing.groundWhyBody")}
          </p>
        </div>

        {/* three trust principles — compact ruled rows, not cards */}
        <div className="mt-12 border-t border-outline-variant/70 sm:mt-16">
          {PRINCIPLES.map((titleKey, i) => (
            <div
              key={titleKey}
              className="grid gap-1.5 border-b border-outline-variant/70 py-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6 sm:py-6"
            >
              <span
                aria-hidden="true"
                className="text-[13px] font-bold tabular-nums tracking-[0.06em] text-[#1688f5]/55"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="text-title-md font-semibold text-primary">{t(titleKey)}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
