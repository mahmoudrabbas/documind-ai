"use client";

/**
 * "How DocuMind works" — the product operating model.
 *
 * One continuous knowledge path, not five feature cards. The left column
 * carries the editorial narrative for the five stages; the right column is a
 * single sticky navy system canvas that shows the whole pipeline at once and
 * progressively emphasises the stage the reader is on.
 *
 * Order is the story: documents enter → they become structured → permissions
 * are checked BEFORE retrieval → only the authorized source moves on → the
 * answer arrives with its evidence attached, and a restricted document
 * visibly stops at the gate.
 *
 * Desktop uses a lightweight scroll-spy (nearest narrative stage to the
 * viewport centre) to drive the active stage — no animation dependency.
 * `prefers-reduced-motion` turns the emphasis off and shows the full static
 * pipeline so every concept stays readable without motion.
 *
 * Filenames and source names are Latin in both locales, so they are kept
 * `dir="ltr"` inside the RTL document to avoid reordering the glyphs.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import type { Direction } from "@/lib/i18n/i18n.types";
import { CheckGlyph, DocGlyph, LockGlyph } from "./glyphs";

/** Document names are product identifiers — identical in both locales. */
const CONNECT_DOCS = [
  "Procurement_Policy.pdf",
  "Customer_Support_SLA.pdf",
  "Security_Policy.pdf",
  "Employee_Handbook.pdf",
];

const UNDERSTAND_DOCS: Array<{ name: string; tags: string[] }> = [
  { name: "Procurement_Policy.pdf", tags: ["landing.howUnderstandTagPolicy", "landing.howUnderstandTagIndexed"] },
  { name: "Customer_Support_SLA.pdf", tags: ["landing.howUnderstandTagSupport", "landing.howUnderstandTagPages", "landing.howUnderstandTagIndexed"] },
  { name: "Security_Policy.pdf", tags: ["landing.howUnderstandTagPolicy", "landing.howUnderstandTagIndexed"] },
  { name: "Employee_Handbook.pdf", tags: ["landing.howUnderstandTagSupport", "landing.howUnderstandTagIndexed"] },
];

function DocName({ name, className }: { name: string; className?: string }) {
  return (
    <span dir="ltr" className={cn("min-w-0 truncate", className)}>
      {name}
    </span>
  );
}

/* ── system canvas zones ───────────────────────────────────────────── */

/** 01 · Connect — company documents entering one knowledge layer. */
function ZoneConnect() {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-medium tracking-[0.02em] text-on-primary/70">
        {t("landing.howConnectLabel")}
      </p>
      <div className="mt-1 grid min-w-0 grid-cols-2 gap-1.5">
        {CONNECT_DOCS.map((name) => (
          <div
            key={name}
            className="flex min-w-0 items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.04] px-2 py-1.5"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border border-[rgba(22,136,245,0.28)] bg-[rgba(22,136,245,0.14)]">
              <DocGlyph className="h-3 w-3 text-[#1688f5]" />
            </span>
            <DocName name={name} className="text-[11.5px] font-semibold text-on-primary/90" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 02 · Understand — the same documents become quiet, structured objects. */
function ZoneUnderstand() {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-medium tracking-[0.02em] text-on-primary/70">
        {t("landing.howUnderstandLabel")}
      </p>
      <div className="mt-1 grid min-w-0 grid-cols-2 gap-1.5">
        {UNDERSTAND_DOCS.map((doc) => (
          <div
            key={doc.name}
            className="min-w-0 rounded-md border border-white/[0.09] px-1.5 py-1"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-white/[0.06]">
                <DocGlyph className="h-2 w-2 text-on-primary/40" />
              </span>
              <DocName name={doc.name} className="flex-1 text-[11px] font-medium text-on-primary/80" />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 ps-5.5">
              {doc.tags.map((tagKey) => (
                <span
                  key={tagKey}
                  className="rounded-[3px] border border-white/[0.14] bg-white/[0.06] px-1 py-0.5 text-[9.5px] font-semibold tracking-[0.04em] text-on-primary/62"
                >
                  {t(tagKey)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 03 · Govern — the permission gate. Restricted knowledge stops here. */
function ZoneGovern() {
  const { t } = useI18n();
  const checks = [
    "landing.howGovernCheck1",
    "landing.howGovernCheck2",
    "landing.howGovernCheck3",
  ];
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-[rgba(22,136,245,0.35)] bg-[rgba(22,136,245,0.2)] text-[9.5px] font-bold text-[#b9dcff]">
          {t("landing.howGovernInitials")}
        </span>
        <span className="text-[12px] font-semibold text-on-primary/92">
          {t("landing.howGovernWho")}
        </span>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-on-primary/68">
        {checks.map((key) => (
          <li key={key} className="inline-flex items-center gap-1">
            {t(key)}
            <CheckGlyph className="h-2.5 w-2.5 text-tertiary-fixed-dim" />
          </li>
        ))}
      </ul>

      {/* the gate — everything below is evaluated against it */}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="h-px flex-1 bg-white/[0.14]" />
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-on-primary/58">
          {t("landing.howGovernGate")}
        </span>
        <span className="h-px flex-1 bg-white/[0.14]" />
      </div>

      <div className="mt-1.5 flex min-w-0 items-center gap-2 rounded-md border-s-2 border-s-tertiary-fixed-dim bg-tertiary-fixed-dim/[0.08] px-2 py-1.5">
        <DocGlyph className="h-3.5 w-3.5 shrink-0 text-tertiary-fixed-dim" />
        <DocName name="Customer_Support_SLA.pdf" className="flex-1 text-[11.5px] font-semibold text-on-primary/92" />
        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold tracking-[0.06em] text-tertiary-fixed">
          <CheckGlyph className="h-2.5 w-2.5" />
          {t("landing.howGovernAuthorized")}
        </span>
      </div>

      <div className="mt-1 rounded-md border border-white/[0.10] px-2 py-1.5 opacity-80">
        <div className="flex min-w-0 items-center gap-2">
          <LockGlyph className="h-3.5 w-3.5 shrink-0 text-on-primary/45" />
          <DocName name="Security_Policy.pdf" className="flex-1 text-[11.5px] font-medium text-on-primary/78" />
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold tracking-[0.06em] text-on-primary/62">
            <LockGlyph className="h-2.5 w-2.5" />
            {t("landing.howGovernRestricted")}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 ps-5.5">
          <span className="h-px w-3 bg-white/25" />
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-on-primary/58">
            {t("landing.howGovernStopped")}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 04 · Retrieve — only the authorized source is selected. */
function ZoneRetrieve() {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-2 text-[12.5px] font-medium leading-snug text-on-primary/90">
        <span aria-hidden="true" className="text-[10px] font-bold text-[#4db3ff]">
          Q
        </span>
        {t("landing.howRetrieveQuestion")}
      </p>
      <div className="mt-1.5 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2 rounded-md border-s-2 border-s-[#1688f5] bg-[rgba(22,136,245,0.12)] px-2 py-1.5">
          <DocGlyph className="h-3.5 w-3.5 shrink-0 text-[#9bcfff]" />
          <DocName name="Customer_Support_SLA.pdf" className="flex-1 text-[11.5px] font-semibold text-on-primary/92" />
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold tracking-[0.05em] text-[#9bcfff]">
            <CheckGlyph className="h-2.5 w-2.5" />
            {t("landing.howRetrieveSelected")}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-white/[0.10] px-2 py-1.5 opacity-70">
          <LockGlyph className="h-3.5 w-3.5 shrink-0 text-on-primary/40" />
          <DocName name="Security_Policy.pdf" className="flex-1 text-[11.5px] font-medium text-on-primary/70" />
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium tracking-[0.05em] text-on-primary/58">
            {t("landing.howRetrieveExcluded")}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 05 · Answer — the payoff with its evidence still attached. */
function ZoneAnswer() {
  const { t, dir } = useI18n();
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2.5 text-[clamp(34px,3.2vw,44px)] font-bold leading-none tracking-[-0.02em] text-white">
        <span aria-hidden="true" className="inline-block h-[6px] w-[6px] shrink-0 rounded-[2px] bg-[#1688f5] shadow-[0_0_0_4px_rgba(22,136,245,0.12)]" />
        <span dir={dir}>{t("landing.howAnswer")}</span>
      </p>
      <p className="mt-1 max-w-[340px] text-[12.5px] leading-[1.5] text-on-primary/80">
        {t("landing.howAnswerBody")}
      </p>
      <div className="mt-2 flex min-w-0 items-center gap-2.5 rounded-e-lg border-s-2 border-s-tertiary-fixed-dim bg-white/[0.05] px-2.5 py-1.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-tertiary-fixed-dim/30 bg-tertiary-fixed-dim/[0.1]">
          <DocGlyph className="h-3.5 w-3.5 text-tertiary-fixed-dim" />
        </span>
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-tertiary-fixed">
            <CheckGlyph className="h-2.5 w-2.5" />
            {t("landing.howAnswerVerified")}
          </span>
          <p dir="ltr" className="mt-0.5 truncate text-[12.5px] font-semibold text-on-primary/95">
            {t("landing.howAnswerSourceName")}
          </p>
          <p dir="ltr" className="truncate text-[10.5px] text-on-primary/60">
            {t("landing.howAnswerSourceSub")}
          </p>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-on-primary/58">
        <span className="inline-flex items-center gap-1">
          {t("landing.howAnswerMetaAuth")}
          <CheckGlyph className="h-2.5 w-2.5 text-tertiary-fixed-dim" />
        </span>
        <span className="inline-flex items-center gap-1">
          {t("landing.howAnswerMetaGrounded")}
          <CheckGlyph className="h-2.5 w-2.5 text-tertiary-fixed-dim" />
        </span>
      </div>
    </div>
  );
}

type StageState = "active" | "done" | "future" | "full";

/** One zone on the desktop pipeline, wired to the spine + state emphasis. */
function CanvasZone({
  state,
  index,
  label,
  children,
}: {
  state: StageState;
  index: string;
  label: string;
  children: ReactNode;
}) {
  const marker =
    state === "active"
      ? "bg-[#1688f5] shadow-[0_0_0_3px_rgba(22,136,245,0.15)]"
      : state === "done"
        ? "bg-tertiary-fixed-dim"
        : state === "full"
          ? "bg-[#1688f5]/60"
          : "bg-white/45";
  return (
    <div
      className={cn(
        "relative rounded-lg ps-7 transition-opacity duration-300",
        state === "active" && "bg-white/[0.035] ring-1 ring-inset ring-white/[0.07] opacity-100",
        state === "done" && "opacity-70",
        state === "future" && "opacity-45",
        state === "full" && "opacity-100",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute start-[3px] top-[4px] h-2 w-2 rounded-[2px]", marker)}
      />
      <p
        className={cn(
          "flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em]",
          state === "active" ? "text-[#9bcfff]" : "text-on-primary/65",
        )}
      >
        <span className="tabular-nums">{index}</span>
        <span className="truncate">{label}</span>
        {state === "done" && <CheckGlyph className="h-2.5 w-2.5 shrink-0 text-tertiary-fixed-dim" />}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** The one integrated system surface — all five states on a single path. */
function SystemCanvas({ active, dir }: { active: number | null; dir: Direction }) {
  const { t } = useI18n();
  const zones = [
    { label: t("landing.howCanvasStage1"), node: <ZoneConnect /> },
    { label: t("landing.howCanvasStage2"), node: <ZoneUnderstand /> },
    { label: t("landing.howCanvasStage3"), node: <ZoneGovern /> },
    { label: t("landing.howCanvasStage4"), node: <ZoneRetrieve /> },
    { label: t("landing.howCanvasStage5"), node: <ZoneAnswer /> },
  ];
  return (
    <div className="relative" dir={dir}>
      <div className="relative rounded-2xl border border-white/[0.13] bg-gradient-to-b from-primary-container/95 to-[#0b2238]/95 p-3 shadow-modal sm:p-3.5">
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
        <div className="relative flex items-center justify-between border-b border-white/[0.09] pb-1.5">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-primary/65">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
            {t("landing.howCanvasLabel")}
          </p>
          {active !== null && (
            <p data-active-label className="text-[11px] font-semibold tracking-[0.04em] text-[#9bcfff]">
              {String(active + 1).padStart(2, "0")} · {zones[active].label}
            </p>
          )}
        </div>

        {/* the pipeline — one spine, five states */}
        <div className="relative mt-2.5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 start-[6.5px] top-1 w-px bg-gradient-to-b from-[rgba(22,136,245,0.7)] via-[rgba(22,136,245,0.35)] to-[rgba(22,136,245,0.15)]"
          />
          <div className="space-y-2">
            {zones.map((zone, i) => {
              const state: StageState =
                active === null ? "full" : i === active ? "active" : i < active ? "done" : "future";
              return (
                <CanvasZone
                  key={zone.label}
                  state={state}
                  index={String(i + 1).padStart(2, "0")}
                  label={zone.label}
                >
                  {zone.node}
                </CanvasZone>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── narrative stages ──────────────────────────────────────────────── */

const STAGES = [
  { title: "landing.howStage1Title", desc: "landing.howStage1Desc" },
  { title: "landing.howStage2Title", desc: "landing.howStage2Desc" },
  { title: "landing.howStage3Title", desc: "landing.howStage3Desc" },
  { title: "landing.howStage4Title", desc: "landing.howStage4Desc" },
  { title: "landing.howStage5Title", desc: "landing.howStage5Desc" },
];

function StageBlock({
  index,
  stage,
  active,
  registerRef,
}: {
  index: number;
  stage: { title: string; desc: string };
  active: number | null;
  registerRef: (i: number) => (el: HTMLDivElement | null) => void;
}) {
  const { t } = useI18n();
  const isActive = active === index;
  const isFuture = active !== null && index > active;
  return (
    <div
      ref={registerRef(index)}
      data-stage-index={index}
      className={cn(
        "border-t border-outline-variant/70 py-8 transition-opacity duration-300 sm:py-9",
        isActive ? "opacity-100" : isFuture ? "opacity-70" : "opacity-85",
      )}
    >
      <div className="flex gap-5 sm:gap-6">
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 pt-0.5 text-[13px] font-bold tabular-nums tracking-[0.06em] transition-colors duration-300",
            isActive ? "text-[#1688f5]" : "text-[#1688f5]/55",
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h3
            className={cn(
              "text-title-lg font-semibold transition-colors duration-300 sm:text-[22px] sm:leading-7",
              isActive ? "text-primary" : "text-primary/75",
            )}
          >
            {t(stage.title)}
          </h3>
          <p className="mt-2 max-w-md text-body-md leading-[1.65] text-on-surface-variant">
            {t(stage.desc)}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Mobile: the same stages but as a connected vertical rail, not a stepper. */
function MobileStage({
  index,
  stage,
  zone,
}: {
  index: number;
  stage: { title: string; desc: string };
  zone: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div data-stage-index={index} className="relative ps-7">
      <span
        aria-hidden="true"
        className="absolute start-[3px] top-[8px] h-[7px] w-[7px] rounded-[2px] bg-[#1688f5]/70"
      />
      <div className="flex gap-5">
        <span
          aria-hidden="true"
          className="shrink-0 pt-0.5 text-[13px] font-bold tabular-nums tracking-[0.06em] text-[#1688f5]"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h3 className="text-title-lg font-semibold text-primary sm:text-[22px] sm:leading-7">
            {t(stage.title)}
          </h3>
          <p className="mt-2 text-body-md leading-[1.65] text-on-surface-variant">
            {t(stage.desc)}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-white/10 bg-gradient-to-b from-primary-container/95 to-[#0b2238]/95 p-4 shadow-card">
        {zone}
      </div>
    </div>
  );
}

/* ── section ───────────────────────────────────────────────────────── */

export function HowDocuMindWorksSection() {
  const { t, dir } = useI18n();
  const [active, setActive] = useState<number | null>(0);
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq?.matches) {
      // Static full pipeline — every concept stays visible without motion.
      setActive(null);
      return;
    }

    const measure = () => {
      const nodes = refs.current;
      if (nodes.length === 0) return;
      const vpMid = window.innerHeight / 2;
      let best = 0;
      let bestDist = Infinity;
      nodes.forEach((node, i) => {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - vpMid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActive((current) => {
        if (current === null || current === best) return current;
        const currentNode = nodes[current];
        if (!currentNode) return best;
        const rect = currentNode.getBoundingClientRect();
        const currentDist = Math.abs(rect.top + rect.height / 2 - vpMid);
        return bestDist + 24 < currentDist ? best : current;
      });
    };

    const scheduleMeasure = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        measure();
      });
    };

    measure();
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure, { passive: true });

    const onMediaChange = () => {
      setActive(mq?.matches ? null : 0);
      if (!mq?.matches) scheduleMeasure();
    };
    mq?.addEventListener?.("change", onMediaChange);

    return () => {
      window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      mq?.removeEventListener?.("change", onMediaChange);
    };
  }, []);

  const registerRef = (i: number) => (el: HTMLDivElement | null) => {
    refs.current[i] = el;
  };

  const mobileZones = [
    <ZoneConnect key="connect" />,
    <ZoneUnderstand key="understand" />,
    <ZoneGovern key="govern" />,
    <ZoneRetrieve key="retrieve" />,
    <ZoneAnswer key="answer" />,
  ];

  return (
    <section
      id="how-it-works"
      dir={dir}
      aria-labelledby="how-it-works-heading"
      className="relative scroll-mt-16 bg-surface"
    >
      {/* very faint brand wash so the opening lifts off the flat surface */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(760px_340px_at_80%_6%,rgba(22,136,245,0.05),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-20 pt-14 sm:pb-28 sm:pt-16">
        {/* opening statement */}
        <div className="max-w-[820px]">
          <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgba(11,34,56,0.55)]">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
            {t("landing.howEyebrow")}
          </p>
          <h2
            id="how-it-works-heading"
            className="mt-4 text-balance text-[clamp(26px,3.2vw,40px)] font-bold leading-[1.18] tracking-[-0.02em] text-primary"
          >
            {t("landing.howTitle1")}
            <br className="hidden min-[560px]:inline" />
            {" "}
            <em className="not-italic text-[#0e5aa8]">{t("landing.howTitle2")}</em>
          </h2>
          <p className="mt-5 max-w-[680px] text-body-lg leading-[1.7] text-on-surface-variant">
            {t("landing.howSupport")}
          </p>
        </div>

        {/* desktop — narrative + sticky system canvas */}
        <div className="mt-14 hidden min-w-0 min-[1024px]:grid min-[1024px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[1024px]:gap-x-14 min-[1024px]:gap-y-0 lg:gap-x-16">
          <div className="min-w-0">
            {STAGES.map((stage, i) => (
              <StageBlock
                key={stage.title}
                index={i}
                stage={stage}
                active={active}
                registerRef={registerRef}
              />
            ))}
          </div>
          <div className="min-w-0">
            <div className="sticky top-20">
              <SystemCanvas active={active} dir={dir} />
            </div>
          </div>
        </div>

        {/* mobile — connected vertical rail */}
        <div className="mt-10 min-[1024px]:hidden">
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-2 start-[7px] top-2 w-px bg-[#1688f5]/40"
            />
            <div className="space-y-10">
              {STAGES.map((stage, i) => (
                <MobileStage key={stage.title} index={i} stage={stage} zone={mobileZones[i]} />
              ))}
            </div>
          </div>
        </div>

        {/* closing statement — hands off to what comes next */}
        <div className="mt-16 flex flex-col items-center text-center sm:mt-24">
          <span aria-hidden="true" className="h-0.5 w-10 rounded-full bg-[#1688f5]" />
          <p className="mt-5 max-w-xl text-balance text-title-lg font-semibold leading-[1.6] text-primary sm:text-[22px]">
            {t("landing.howClosing")}
            <br />
            {t("landing.howClosing2")}
          </p>
        </div>
      </div>
    </section>
  );
}
