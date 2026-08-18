"use client";

/**
 * "Permission-aware intelligence" — the governed-knowledge section.
 *
 * Section 4 of the public landing page. Where Section 3 shows the full
 * pipeline (Connect → Understand → Govern → Retrieve → Answer), this
 * section deepens one idea: access is part of the knowledge system.
 *
 * The composition is a single authorization-boundary visual, not a grid of
 * cards, and it runs top-to-bottom so it reads like a story:
 *
 *   COMPANY KNOWLEDGE        → the whole landscape, larger than any scope
 *   USER ACCESS CONTEXT      → one identity (Support Manager) and its rules
 *   AUTHORIZATION BOUNDARY   → the core motif, drawn before any search
 *   AUTHORIZED KNOWLEDGE     → only the documents that crossed the boundary
 *   RETRIEVAL ELIGIBILITY    → a question reaches only the authorized source
 *
 * There is deliberately no scope switcher, no RBAC matrix and no dashboard
 * chrome. One identity, one resolved scope — the product statement is that
 * access is resolved by the system, not configured by the user on this page.
 *
 * Motion is a one-time staged entrance driven by IntersectionObserver.
 * prefers-reduced-motion shows the full resolved state with no motion, and
 * every concept stays readable without animation.
 *
 * Filenames are Latin in both locales, so they are kept `dir="ltr"` inside
 * the RTL document to avoid reordering the glyphs.
 */

import { useRef, type ReactNode } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { CheckGlyph, DocGlyph, LockGlyph } from "./glyphs";
import { useRevealOnView } from "./motion";

const ACCESS_CHECKS = [
  "landing.permCheck1",
  "landing.permCheck2",
  "landing.permCheck3",
];

const CLUSTERS: Array<{
  id: "support" | "hr" | "security" | "procurement";
  domainKey: string;
  docs: string[];
}> = [
  {
    id: "support",
    domainKey: "landing.permDomainSupport",
    docs: ["Customer_Support_SLA.pdf", "Support_Runbook.pdf"],
  },
  {
    id: "hr",
    domainKey: "landing.permDomainHr",
    docs: ["Employee_Handbook.pdf", "HR_Policy.pdf"],
  },
  {
    id: "security",
    domainKey: "landing.permDomainSecurity",
    docs: ["Security_Policy.pdf"],
  },
  {
    id: "procurement",
    domainKey: "landing.permDomainProcurement",
    docs: ["Procurement_Policy.pdf"],
  },
];

/** The resolved scope for the Support Manager identity. */
const AUTHORIZED_DOCS = ["Customer_Support_SLA.pdf", "Support_Runbook.pdf"];
const OUTSIDE_DOCS = ["Security_Policy.pdf", "Employee_Handbook.pdf"];
const ELIGIBLE_DOC = "Customer_Support_SLA.pdf";

const PRINCIPLES = [
  { title: "landing.permPrinciple1Title", body: "landing.permPrinciple1Body" },
  { title: "landing.permPrinciple2Title", body: "landing.permPrinciple2Body" },
  { title: "landing.permPrinciple3Title", body: "landing.permPrinciple3Body" },
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

/** Company knowledge — the whole landscape, larger than any single scope. */
function CompanyKnowledge({ shown }: { shown: boolean }) {
  const { t } = useI18n();
  return (
    <div className="border-b border-outline-variant/60 bg-[linear-gradient(180deg,#ffffff,#f3f8fd)] px-6 py-6 sm:px-8 sm:py-7">
      <Reveal shown={shown}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant/70">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
            {t("landing.permKnowledgeLabel")}
          </p>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-on-surface-variant">
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              apartment
            </span>
            <span dir="ltr">{t("landing.permOrg")}</span>
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {CLUSTERS.map((cluster, i) => (
            <Reveal key={cluster.id} shown={shown} delay={`${i * 60}ms`}>
              <div>
                <p className="flex items-center gap-2 text-[15px] font-bold text-primary">
                  <DocGlyph className="h-4 w-4 shrink-0 text-[#1688f5]" />
                  {t(cluster.domainKey)}
                </p>
                <ul className="mt-2 space-y-1">
                  {cluster.docs.map((doc) => (
                    <li key={doc} className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1 w-1 shrink-0 rounded-full bg-on-surface-variant/40"
                      />
                      <DocName
                        name={doc}
                        className="flex-1 text-[13px] font-medium text-on-surface-variant/85"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-4 text-[12px] font-medium leading-relaxed text-on-surface-variant/70">
          {t("landing.permKnowledgeCount")}
          <span aria-hidden="true" className="mx-1.5 text-on-surface-variant/40">
            ·
          </span>
          {t("landing.permKnowledgeNote")}
        </p>
      </Reveal>
    </div>
  );
}

/** User access context — one identity and the rules that shape its scope. */
function AccessContext({ shown }: { shown: boolean }) {
  const { t } = useI18n();
  return (
    <div className="border-b border-outline-variant/60 bg-surface-container-low px-6 py-5 sm:px-8">
      <Reveal shown={shown} delay="120ms">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant/70">
          {t("landing.permAccessLabel")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#1688f5]/30 bg-[#1688f5]/10"
            >
              <span className="material-symbols-outlined text-[22px] text-[#0e5aa8]">person</span>
            </span>
            <div className="min-w-0">
              <p className="text-[17px] font-bold leading-tight text-primary">
                {t("landing.permRoleSupport")}
              </p>
              <p className="mt-0.5 text-[12.5px] font-medium text-on-surface-variant">
                <span dir="ltr" className="font-semibold">
                  {t("landing.permOrg")}
                </span>
                <span aria-hidden="true" className="mx-1.5 text-on-surface-variant/50">
                  ·
                </span>
                {t("landing.permScopeSupport")}
              </p>
            </div>
          </div>

          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:ms-auto">
            {ACCESS_CHECKS.map((key) => (
              <li
                key={key}
                className="flex items-center gap-2 text-[13px] font-medium text-on-surface-variant"
              >
                <CheckGlyph className="h-4 w-4 shrink-0 text-[#047857]" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </div>
  );
}

/** The authorization boundary — the section's core motif, drawn before any search. */
function AuthorizationBoundary({ shown }: { shown: boolean }) {
  const { t } = useI18n();
  return (
    <div className="border-b border-outline-variant/60 bg-white px-6 py-5 sm:px-8">
      <Reveal shown={shown} delay="200ms">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-px flex-1 bg-gradient-to-r from-transparent via-[#1688f5]/40 to-[#1688f5]"
          />
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1688f5]/40 bg-[#eef5ff] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#0e5aa8]">
            <LockGlyph className="h-3.5 w-3.5" />
            {t("landing.permBoundaryLabel")}
          </span>
          <span
            aria-hidden="true"
            className="h-px flex-1 bg-gradient-to-l from-transparent via-[#1688f5]/40 to-[#1688f5]"
          />
        </div>
        <p className="mt-2.5 text-center text-[12px] leading-relaxed text-on-surface-variant">
          {t("landing.permBoundaryNote")}
        </p>
      </Reveal>
    </div>
  );
}

/** The resolved space — only documents that crossed the boundary. */
function AuthorizedKnowledge({ shown }: { shown: boolean }) {
  const { t } = useI18n();
  return (
    <div className="border-b border-outline-variant/60 bg-[#fbfdfe] px-6 py-5 sm:px-8">
      <Reveal shown={shown} delay="260ms">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#047857]">
              <CheckGlyph className="h-3 w-3" />
              {t("landing.permScopeTitle")}
            </p>
            <ul className="mt-2.5 space-y-2">
              {AUTHORIZED_DOCS.map((doc) => (
                <li key={doc} className="flex min-w-0 items-center gap-2.5">
                  <CheckGlyph className="h-4 w-4 shrink-0 text-[#047857]" />
                  <DocName name={doc} className="flex-1 text-[13.5px] font-bold text-on-surface" />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-on-surface-variant/80">
              <LockGlyph className="h-3 w-3" />
              {t("landing.permOutsideLabel")}
            </p>
            <p className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium leading-relaxed text-on-surface-variant/85">
              <DocName name={OUTSIDE_DOCS[0]} />
              <span aria-hidden="true" className="text-on-surface-variant/40">
                ·
              </span>
              <DocName name={OUTSIDE_DOCS[1]} />
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/** The critical moment — a question touches only the knowledge that crossed the boundary. */
function RetrievalEligibility({ shown }: { shown: boolean }) {
  const { t, dir } = useI18n();
  return (
    <div className="bg-[linear-gradient(180deg,#fbfdff,#f4f8fd)] px-6 py-6 sm:px-8">
      <Reveal shown={shown} delay="320ms">
        <p className="flex items-baseline gap-2 text-[15px] font-medium leading-snug text-primary sm:text-[16px]">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 translate-y-0.5 items-center justify-center rounded-md bg-[#1688f5]/10 text-[13px] font-bold text-[#1688f5]"
          >
            Q
          </span>
          <span dir={dir}>{t("landing.permQuestionSupport")}</span>
        </p>

        <div className="mt-3.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <DocGlyph className="h-5 w-5 shrink-0 text-[#047857]" />
          <DocName name={ELIGIBLE_DOC} className="text-[14.5px] font-bold text-on-surface" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#047857]/10 px-3 py-1 text-[12px] font-bold text-[#047857]">
            <CheckGlyph className="h-3.5 w-3.5" />
            {t("landing.permEligible")}
            <span className="material-symbols-outlined text-[15px] rtl:rotate-180" aria-hidden="true">
              arrow_forward
            </span>
          </span>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-on-surface-variant/70">
          {t("landing.permQuestionCaption")}
        </p>
      </Reveal>
    </div>
  );
}

export function PermissionAwareIntelligenceSection() {
  const { t, dir } = useI18n();
  const visualRef = useRef<HTMLDivElement | null>(null);
  const { revealed } = useRevealOnView(visualRef);

  return (
    <section
      id="permission-aware"
      dir={dir}
      aria-labelledby="permission-aware-heading"
      className="relative scroll-mt-20 bg-surface"
    >
      {/* very faint brand wash so the opening lifts off the flat surface */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(760px_340px_at_78%_6%,rgba(22,136,245,0.05),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-20 pt-14 sm:pb-28 sm:pt-16">
        {/* opening statement */}
        <div className="max-w-[820px]">
          <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgba(11,34,56,0.55)]">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
            {t("landing.permEyebrow")}
          </p>
          <h2
            id="permission-aware-heading"
            className="mt-4 text-balance text-[clamp(26px,3.2vw,40px)] font-bold leading-[1.18] tracking-[-0.02em] text-primary"
          >
            {t("landing.permTitle1")}
            <br className="hidden min-[560px]:inline" />
            {" "}
            <em className="not-italic text-[#0e5aa8]">{t("landing.permTitle2")}</em>
          </h2>
          <p className="mt-5 max-w-[680px] text-body-lg leading-[1.7] text-on-surface-variant">
            {t("landing.permSupport")}
          </p>
        </div>

        {/* one authorization-boundary visual — five stacked zones */}
        <div
          ref={visualRef}
          className="mt-12 overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest shadow-card"
        >
          <CompanyKnowledge shown={revealed} />
          <AccessContext shown={revealed} />
          <AuthorizationBoundary shown={revealed} />
          <AuthorizedKnowledge shown={revealed} />
          <RetrievalEligibility shown={revealed} />
        </div>

        {/* why it matters — editorial statement, not feature cards */}
        <div className="mt-14 grid gap-8 sm:mt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <h3 className="max-w-[380px] text-balance text-title-lg font-semibold leading-snug text-primary sm:text-[26px] sm:leading-9">
            {t("landing.permWhyTitle")}
          </h3>
          <p className="max-w-[560px] text-body-lg leading-[1.7] text-on-surface-variant">
            {t("landing.permWhyBody")}
          </p>
        </div>

        {/* three product principles — ruled rows, not cards */}
        <div className="mt-12 border-t border-outline-variant/70 sm:mt-16">
          {PRINCIPLES.map((principle, i) => (
            <div
              key={principle.title}
              className="grid gap-1.5 border-b border-outline-variant/70 py-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6 sm:py-6"
            >
              <span
                aria-hidden="true"
                className="text-[13px] font-bold tabular-nums tracking-[0.06em] text-[#1688f5]/55"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="text-title-md font-semibold text-primary">{t(principle.title)}</h3>
                <p className="mt-1 max-w-xl text-body-md leading-[1.6] text-on-surface-variant">
                  {t(principle.body)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* closing statement — hands off to grounded answers */}
        <div className="mt-16 flex flex-col items-center text-center sm:mt-24">
          <span aria-hidden="true" className="h-0.5 w-10 rounded-full bg-[#1688f5]" />
          <p className="mt-5 max-w-xl text-balance text-title-lg font-semibold leading-[1.6] text-primary sm:text-[22px]">
            {t("landing.permClosing")}
          </p>
        </div>
      </div>
    </section>
  );
}
