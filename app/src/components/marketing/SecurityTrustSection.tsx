"use client";

/**
 * "Security & trust" — the institutional-trust section.
 *
 * Section 7 of the public landing page. Where Section 4 explained the
 * permission boundary before retrieval, this section answers the buyer's
 * different question: can the organization trust the platform itself?
 *
 * The composition is ONE trust-architecture visual — not cards — built as a
 * single DocuMind platform frame that contains two isolated organizational
 * knowledge spaces (ACME Corp / Northstar Ltd) separated by a precise gap
 * with no connector crossing it. Inside the same frame, a quiet
 * controlled-access band and a restrained activity trace keep the trust
 * story subordinate to tenant isolation and never repeat Section 4's
 * role→department→document→retrieval flow.
 *
 * Every audit row maps to a real backend audit event the platform already
 * writes (RETRIEVAL_SEARCH, DOCUMENT_UPLOADED / INDEX_GENERATION_ACTIVATED),
 * so the section claims no audit coverage the product does not have.
 * Traceable knowledge is a small nod to Section 5's evidence story, not a
 * second retelling of it.
 *
 * Motion is a one-time staged entrance (platform frame → organization
 * boundaries → audit trace) driven by IntersectionObserver with short CSS
 * transitions. prefers-reduced-motion shows the full resolved section
 * immediately, and no meaning depends on animation.
 *
 * Company names, filenames, and timestamps are Latin in both locales, so
 * they are kept `dir="ltr"` inside the RTL document to avoid reordering the
 * glyphs.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { CheckGlyph, DocGlyph } from "./glyphs";

/** Two illustrative organizations inside the same platform. */
const ORGS: Array<{
  id: "acme" | "northstar";
  name: string;
  docs: string[];
  roleKeys: string[];
}> = [
  {
    id: "acme",
    name: "ACME Corp",
    docs: ["Customer_Support_SLA.pdf", "Security_Policy.pdf", "Employee_Handbook.pdf"],
    roleKeys: [
      "landing.secRoleCompanyAdmin",
      "landing.permRoleSupport",
      "landing.secRoleEmployee",
    ],
  },
  {
    id: "northstar",
    name: "Northstar Ltd",
    docs: ["Operations_Manual.pdf", "HR_Guide.pdf", "Supplier_Policy.pdf"],
    roleKeys: [
      "landing.secRoleCompanyAdmin",
      "landing.secRoleOperationsManager",
      "landing.secRoleEmployee",
    ],
  },
];

/**
 * Restrained activity trace. Each entry maps to a real platform audit event
 * (retrieval search / document indexing) so no audit capability is implied
 * that the product does not write.
 */
const TRACE_ROWS: Array<{
  id: string;
  time: string;
  eventKey: string;
  value: string;
  latin: boolean;
}> = [
  {
    id: "queried",
    time: "09:42",
    eventKey: "landing.secAuditEvent1",
    value: "landing.permRoleSupport",
    latin: false,
  },
  {
    id: "retrieved",
    time: "09:42",
    eventKey: "landing.secAuditEvent2",
    value: "Customer_Support_SLA.pdf",
    latin: true,
  },
  {
    id: "indexed",
    time: "10:05",
    eventKey: "landing.secAuditEvent3",
    value: "Procurement_Policy.pdf",
    latin: true,
  },
];

const PRINCIPLES = [
  { title: "landing.secPrinciple1Title", body: "landing.secPrinciple1Body" },
  { title: "landing.secPrinciple2Title", body: "landing.secPrinciple2Body" },
  { title: "landing.secPrinciple3Title", body: "landing.secPrinciple3Body" },
];

/** Latin product identifiers — identical in both locales. */
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
  animate = true,
}: {
  shown: boolean;
  delay?: string;
  className?: string;
  children: ReactNode;
  /** When false (prefers-reduced-motion), render the final state instantly. */
  animate?: boolean;
}) {
  if (!animate) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out",
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        className,
      )}
      style={{ transitionDelay: delay }}
    >
      {children}
    </div>
  );
}

/** One organizational knowledge space — a scoped region, never a card. */
function OrgRegion({
  org,
  shown,
  delay,
  animate = true,
}: {
  org: (typeof ORGS)[number];
  shown: boolean;
  delay: string;
  animate?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Reveal shown={shown} delay={delay} animate={animate} className="min-w-0">
      <div
        data-org={org.id}
        className="relative h-full overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.04] px-5 py-4 sm:px-6 sm:py-6"
      >
        {/* restrained top accent — the region's own scoped edge */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#1688f5]/70 via-[#1688f5]/20 to-transparent"
        />

        <header className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full bg-[#1688f5] shadow-[0_0_0_4px_rgba(22,136,245,0.16)]"
            />
            <span
              dir="ltr"
              className="truncate text-[15px] font-bold tracking-[0.02em] text-white"
            >
              {org.name}
            </span>
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-on-primary/60">
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#1688f5]" />
            {t("landing.secIsolatedScope")}
          </span>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-on-primary/45">
              {t("landing.secKnowledgeLabel")}
            </p>
            <ul className="mt-2.5 space-y-1">
              {org.docs.map((doc) => (
                <li key={doc} className="flex min-w-0 items-center gap-2">
                  <DocGlyph className="h-3.5 w-3.5 shrink-0 text-[#1688f5]/70" />
                  <DocName
                    name={doc}
                    className="flex-1 text-[12.5px] font-medium text-on-primary/75"
                  />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-on-primary/45">
              {t("landing.secUsersLabel")}
            </p>
            <ul className="mt-2.5 space-y-1">
              {org.roleKeys.map((key) => (
                <li key={key} className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-on-primary/35" />
                  <span className="min-w-0 truncate text-[12.5px] font-medium text-on-primary/75">
                    {t(key)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/**
 * The boundary between two organizational knowledge spaces. A precise gap —
 * deliberately empty, with no connector crossing it. The absence of a
 * connection is the point.
 */
function OrgBoundary({ shown, animate = true }: { shown: boolean; animate?: boolean }) {
  const { t } = useI18n();
  return (
    <Reveal shown={shown} delay="220ms" animate={animate} className="h-full">
      <div
        aria-hidden="true"
        className="relative flex h-full items-center justify-center gap-3 py-1 lg:flex-col lg:py-0 lg:px-6"
      >
        {/* mobile: horizontal hairlines either side of the label */}
        <span className="h-px flex-1 bg-white/[0.12] lg:hidden" />
        <span className="rounded-full bg-[#081a2c] px-3 py-1 text-center text-[9.5px] font-bold uppercase tracking-[0.14em] text-on-primary/45 lg:relative lg:z-10 lg:bg-[#0c2438]">
          {t("landing.secOrgBoundary")}
        </span>
        <span className="h-px flex-1 bg-white/[0.12] lg:hidden" />
        {/* desktop: one quiet vertical hairline through the gap */}
        <span className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-white/[0.12] lg:block" />
      </div>
    </Reveal>
  );
}

/** The restrained activity trace — a timeline, not a dashboard or a table. */
function AuditTrace({
  shown,
  delay,
  animate = true,
}: {
  shown: boolean;
  delay: string;
  animate?: boolean;
}) {
  const { t, dir } = useI18n();
  return (
    <Reveal shown={shown} delay={delay} animate={animate} className="min-w-0">
      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-on-primary/60">
        <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
        {t("landing.secAuditLabel")}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-on-primary/45">
        {t("landing.secAuditCaption")}
      </p>

      <div className="mt-3.5 space-y-0">
        {TRACE_ROWS.map((row) => (
          <div
            key={row.id}
            data-trace-row={row.id}
            className="grid grid-cols-[auto_1.25rem_minmax(0,1fr)] items-center gap-x-3 lg:grid-cols-[auto_1.25rem_minmax(0,1fr)_auto]"
          >
            <span
              dir="ltr"
              className="text-end text-[12px] font-semibold tabular-nums text-on-primary/70"
            >
              {row.time}
            </span>
            <span className="relative flex h-full items-center justify-center">
              <span aria-hidden="true" className="absolute inset-y-0 w-px bg-white/[0.1]" />
              <span
                aria-hidden="true"
                className="h-[5px] w-[5px] rounded-full bg-[#1688f5]"
              />
            </span>
            <span className="min-w-0 text-[13px] font-semibold text-white">
              {t(row.eventKey)}
            </span>
            <span
              dir={row.latin ? "ltr" : dir}
              className="col-start-2 col-span-2 mt-0.5 min-w-0 truncate text-[12px] font-medium text-on-primary/55 lg:col-start-4 lg:col-span-1 lg:mt-0"
            >
              {row.latin ? row.value : t(row.value)}
            </span>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/** Traceable knowledge — a small nod to Section 5's evidence story. */
function TraceableKnowledge({
  shown,
  delay,
  animate = true,
}: {
  shown: boolean;
  delay: string;
  animate?: boolean;
}) {
  const { t, dir } = useI18n();
  return (
    <Reveal shown={shown} delay={delay} animate={animate} className="min-w-0">
      <div className="relative h-full overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 sm:p-5">
        <span aria-hidden="true" className="absolute inset-y-0 start-0 w-[3px] bg-[#1688f5]" />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1688f5]">
          {t("landing.secTraceableLabel")}
        </p>
        <p className="mt-2 max-w-[340px] text-[12.5px] leading-[1.6] text-on-primary/65">
          {t("landing.secTraceableLead")}
        </p>

        <div className="mt-3 border-t border-white/[0.08] pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-primary/45">
            {t("landing.secAnswerLabel")}
          </p>
          <p className="mt-1 flex items-baseline gap-2 text-[clamp(24px,2.4vw,30px)] font-bold leading-none text-white">
            <span
              aria-hidden="true"
              className="inline-block h-[6px] w-[6px] shrink-0 translate-y-[-1px] rounded-[1.5px] bg-[#1688f5]"
            />
            <span dir={dir}>{t("landing.secAnswer")}</span>
          </p>

          <div className="mt-3.5 flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="material-symbols-outlined shrink-0 text-[15px] text-[#1688f5] rtl:-scale-x-100"
            >
              south_east
            </span>
            <DocName name="Customer_Support_SLA.pdf" className="flex-1 text-[12.5px] font-bold text-white" />
          </div>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-tertiary-fixed-dim">
            <CheckGlyph className="h-3.5 w-3.5" />
            {t("landing.groundVerifiedLabel")}
          </p>
        </div>
      </div>
    </Reveal>
  );
}

export function SecurityTrustSection() {
  const { t, dir } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    setReducedMotion(Boolean(reduce));
    if (reduce) {
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

  const animate = !reducedMotion;

  return (
    <section
      id="security"
      dir={dir}
      aria-labelledby="security-heading"
      className="relative scroll-mt-20 bg-[#051728]"
    >
      {/* muted navy layers — depth, not decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(860px_360px_at_20%_0%,rgba(22,136,245,0.07),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(22,136,245,0.035),transparent_60%)]"
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-16 pt-12 sm:pb-28 sm:pt-16">
        {/* opening statement */}
        <div className="max-w-[820px]">
          <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-primary/50">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
            {t("landing.secEyebrow")}
          </p>
          <h2
            id="security-heading"
            className="mt-4 text-balance text-[clamp(26px,3.2vw,40px)] font-bold leading-[1.18] tracking-[-0.02em] text-white"
          >
            {t("landing.secTitle1")}
            <br className="hidden min-[560px]:inline" />
            {" "}
            {t("landing.secTitle2a")}
            <em className="not-italic text-[#9bcfff]">{t("landing.secTitle2b")}</em>
          </h2>
          <p className="mt-5 max-w-[680px] text-body-lg leading-[1.7] text-on-primary/65">
            {t("landing.secSupport")}
          </p>
        </div>

        {/* one trust-architecture visual — the whole trust model in a frame */}
        <div ref={canvasRef} className="mt-10 sm:mt-16">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.14] bg-[linear-gradient(180deg,#0c2a44,#092037)] shadow-modal">
            {/* hairline accent across the top edge */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(22,136,245,0.4)] to-transparent"
            />

            {/* platform header — one DocuMind platform */}
            <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/[0.09] px-5 py-3.5 sm:px-7 sm:py-4">
              <p className="flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-on-primary/70">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-[#1688f5] shadow-[0_0_0_4px_rgba(22,136,245,0.15)]"
                />
                <span dir={dir}>{t("landing.appName")}</span>
              </p>
              <p className="text-[11px] font-medium text-on-primary/50">
                {t("landing.secPlatformLabel")}
              </p>
            </div>

            {/* the two isolated knowledge spaces + the gap between them */}
            <div className="relative px-5 py-5 sm:px-7 sm:py-7">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(170px,210px)_minmax(0,1fr)] lg:items-stretch lg:gap-0">
                <OrgRegion org={ORGS[0]} shown={revealed} delay="120ms" animate={animate} />
                <OrgBoundary shown={revealed} animate={animate} />
                <OrgRegion org={ORGS[1]} shown={revealed} delay="300ms" animate={animate} />
              </div>
            </div>

            {/* controlled access — subordinate to tenant isolation */}
            <div className="relative flex flex-col items-center gap-1.5 border-t border-white/[0.09] px-5 py-3.5 text-center sm:px-7">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1688f5]">
                {t("landing.secAccessLabel")}
              </span>
              <p className="max-w-md text-[13px] leading-relaxed text-on-primary/70">
                {t("landing.secAccessStatement")}
              </p>
            </div>

            {/* audit / trace layer */}
            <div className="grid gap-6 border-t border-white/[0.09] px-5 py-5 sm:px-7 sm:py-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10">
              <AuditTrace shown={revealed} delay="420ms" animate={animate} />
              <TraceableKnowledge shown={revealed} delay="480ms" animate={animate} />
            </div>
          </div>
        </div>

        {/* three trust principles — editorial ruled rows, not cards */}
        <div className="mt-10 border-t border-white/[0.14] sm:mt-16">
          {PRINCIPLES.map((principle, i) => (
            <div
              key={principle.title}
              data-principle={i + 1}
              className="grid gap-2 border-b border-white/[0.14] py-5 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-8 sm:py-7"
            >
              <span
                aria-hidden="true"
                className="text-[13px] font-bold tabular-nums tracking-[0.06em] text-[#1688f5]/70"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="text-title-md font-semibold text-white">{t(principle.title)}</h3>
                <p className="mt-1.5 max-w-xl text-body-md leading-[1.6] text-on-primary/60">
                  {t(principle.body)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* closing statement — hands off to pricing */}
        <div className="mt-12 flex flex-col items-center text-center sm:mt-24">
          <span aria-hidden="true" className="h-0.5 w-10 rounded-full bg-[#1688f5]" />
          <p className="mt-5 max-w-xl text-balance text-title-lg font-semibold leading-[1.6] text-white sm:text-[22px]">
            {t("landing.secClosing")}
            <br />
            <em className="not-italic text-[#9bcfff]">{t("landing.secClosing2")}</em>
          </p>
        </div>
      </div>
    </section>
  );
}