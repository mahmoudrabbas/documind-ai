"use client";

/**
 * "Final CTA / closing chapter" — the last primary section before the footer.
 *
 * Section 10 of the public landing page. By now the visitor has followed the
 * whole story — the knowledge problem, how DocuMind works, permission-aware
 * retrieval, evidence and traceability, cross-team use cases, trust, real
 * pricing, and the buyer questions. This section must not explain the product
 * again; it answers one question: "Am I ready to start?"
 *
 * The composition is a calm, deep-navy closing band — visually distinct from
 * the Hero (flat `#001524` product field) and the Security section (its large
 * trust-architecture frame). Editorial copy on the start side, a quiet
 * abstract signature on the end side: three restrained source lines converge
 * into one evidence line, which resolves into a verified mark and a single
 * answer value. Knowledge becomes a trusted answer — nothing more.
 *
 * Copy is deliberately free of unverified trial claims. Registration is free
 * and provisions a trial with no payment method at signup, so the primary
 * action is the verified "Start Free"; no duration, card, or commitment
 * claims are repeated here.
 *
 * Motion is limited to a restrained entrance reveal and a tiny CTA arrow
 * nudge, both disabled under `prefers-reduced-motion`.
 */

import { useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { useRevealOnView } from "./motion";

/** Latin source identifiers shown in the closing signature. Always LTR. */
const SOURCE_FILES = ["Procurement_Policy.pdf", "Customer_Support_SLA.pdf", "Security_Policy.pdf"];

/**
 * The knowledge → trust signature: three source lines that converge into one
 * evidence line, ending in a verified mark and the resolved answer value.
 * Geometry is mirrored for RTL while every label stays readable LTR.
 */
function SourceSignature({
  dir,
  shown,
  evidenceLabel,
  minutesLabel,
}: {
  dir: "ltr" | "rtl";
  shown: boolean;
  evidenceLabel: string;
  minutesLabel: string;
}) {
  const mirror = dir === "rtl";
  const W = 340;
  const sx = (x: number) => (mirror ? W - x : x);
  const anchor = () => (mirror ? "end" : "start");

  // One emphasized line and two quiet ones. Line starts are staggered so the
  // sources "enter" from different points, like a small architectural plan.
  const lines = [
    { y: 48, start: 16, end: 150, emphasis: false },
    { y: 92, start: 52, end: 178, emphasis: true },
    { y: 136, start: 88, end: 204, emphasis: false },
  ];

  const resolveX = 272;
  const resolveY = 210;

  return (
    <svg
      viewBox={`0 0 ${W} 308`}
      role="presentation"
      aria-hidden="true"
      className="h-auto w-full"
    >
      {/* converging diagonals */}
      {lines.map((l) => (
        <line
          key={`diag-${l.y}`}
          x1={sx(l.end)}
          y1={l.y}
          x2={sx(resolveX)}
          y2={resolveY}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={1}
        />
      ))}
      {/* spine into the verified mark */}
      <line
        x1={sx(resolveX)}
        y1={resolveY}
        x2={sx(resolveX)}
        y2={231}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1}
      />

      {/* the three source lines */}
      {lines.map((l, i) => (
        <g
          key={`line-${l.y}`}
          className={cn("transition-opacity duration-500 ease-out", shown ? "opacity-100" : "opacity-0")}
          style={{ transitionDelay: `${i * 120}ms` }}
        >
          <line
            x1={sx(l.start)}
            y1={l.y}
            x2={sx(l.end)}
            y2={l.y}
            stroke={l.emphasis ? "#1688f5" : "rgba(255,255,255,0.16)"}
            strokeWidth={l.emphasis ? 1.8 : 1}
            strokeLinecap="round"
          />
          <text
            x={sx(l.start)}
            y={l.y - 16}
            textAnchor={anchor()}
            fontSize={12.5}
            fontWeight={l.emphasis ? 600 : 400}
            fill={l.emphasis ? "#9bcfff" : "rgba(255,255,255,0.55)"}
            style={{ direction: "ltr", unicodeBidi: "embed" }}
          >
            {SOURCE_FILES[i]}
          </text>
        </g>
      ))}

      {/* verified mark */}
      <circle
        cx={sx(resolveX)}
        cy={240}
        r={9}
        fill="#03070d"
        stroke="#1688f5"
        strokeWidth={1.6}
      />
      <path
        d="M -3.8 0 l 2.6 2.6 l 5 -5.4"
        transform={`translate(${sx(resolveX)}, 240) scale(${mirror ? -1 : 1}, 1)`}
        fill="none"
        stroke="#9bcfff"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* the resolution: verified evidence → answer value */}
      <text
        x={sx(resolveX)}
        y={268}
        textAnchor="middle"
        fontSize={13}
        fontWeight={600}
        letterSpacing="0.08em"
        fill="rgba(255,255,255,0.78)"
        style={{ textTransform: "uppercase" }}
      >
        {evidenceLabel}
      </text>
      <text
        x={sx(resolveX)}
        y={294}
        textAnchor="middle"
        fontSize={17}
        fontWeight={700}
        fill="#ffffff"
        style={{ direction: "ltr", unicodeBidi: "embed" }}
      >
        {minutesLabel}
      </text>
    </svg>
  );
}

/** Restrained entrance reveal — final state rendered immediately under
 *  `prefers-reduced-motion` or when IntersectionObserver is unavailable. */
function Reveal({
  shown,
  delay = 0,
  className,
  children,
}: {
  shown: boolean;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        className,
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function FinalCtaSection() {
  const { t, dir } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { revealed: shown } = useRevealOnView(ref);

  const trustItems = [
    t("landing.finalCtaTrust1"),
    t("landing.finalCtaTrust2"),
    t("landing.finalCtaTrust3"),
    t("landing.finalCtaTrust4"),
  ];

  return (
    <section
      id="get-started"
      dir={dir}
      ref={ref}
      aria-labelledby="get-started-heading"
      className="relative overflow-hidden border-t border-white/[0.06] bg-[#03070d] text-white"
    >
      {/* faint closing glow — depth, not decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(900px_400px_at_75%_0%,rgba(22,136,245,0.06),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-20 pt-14 sm:pb-28 sm:pt-16">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:gap-16 xl:gap-24">
          {/* editorial closing */}
          <div className="max-w-[620px]">
            <Reveal shown={shown} delay={0}>
              <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-primary/50">
                <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
                {t("landing.finalCtaEyebrow")}
              </p>
            </Reveal>

            <Reveal shown={shown} delay={80}>
              <h2
                id="get-started-heading"
                className="mt-5 text-balance text-[clamp(30px,3.6vw,46px)] font-bold leading-[1.12] tracking-[-0.02em] text-white"
              >
                {t("landing.finalCtaTitle1")}
                <br className="hidden min-[560px]:inline" /> {t("landing.finalCtaTitle2")}
              </h2>
            </Reveal>

            <Reveal shown={shown} delay={160}>
              <p className="mt-6 max-w-[520px] text-body-lg leading-[1.7] text-on-primary/70">
                {t("landing.finalCtaSupport")}
              </p>
            </Reveal>

            <Reveal shown={shown} delay={240}>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                <Link
                  href="/register"
                  className="group inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-white px-8 py-3 text-title-lg font-semibold text-[#001524] shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e5f2ff] hover:shadow-[0_10px_30px_rgba(22,136,245,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5] active:scale-[0.98] motion-reduce:transform-none"
                >
                  {t("landing.finalCtaPrimary")}
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[20px] transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none"
                  >
                    arrow_forward
                  </span>
                </Link>

                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center text-title-md font-medium text-on-primary/60 underline-offset-4 transition-colors duration-200 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5]"
                >
                  {t("landing.finalCtaSecondary")}
                </Link>
              </div>
            </Reveal>

            <Reveal shown={shown} delay={300}>
              <ul className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] font-medium text-white/45">
                {trustItems.map((item, i) => (
                  <li key={item} className="flex items-center gap-2">
                    {i > 0 && (
                      <span aria-hidden="true" className="text-white/25">
                        ·
                      </span>
                    )}
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* closing signature */}
          <div className="mx-auto w-full max-w-[340px] lg:mx-0 lg:max-w-none">
            <Reveal shown={shown} delay={200} className="w-full">
              <SourceSignature
                dir={dir}
                shown={shown}
                evidenceLabel={t("landing.finalCtaEvidence")}
                minutesLabel={t("landing.finalCtaMinutes")}
              />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
