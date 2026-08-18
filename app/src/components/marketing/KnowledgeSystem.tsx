"use client";

/**
 * Hero product visual — one integrated knowledge surface.
 *
 * Shows the whole promise in a single frame: the company's documents, the
 * permissions that govern access, a question, and a grounded answer with
 * its verified source. The "15 minutes" answer is the dominant anchor and
 * everything else stays quieter so it never competes.
 *
 * Filenames and source names are Latin in both locales, so they are kept
 * `dir="ltr"` inside the RTL document to avoid reordering the glyphs.
 */

import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { CheckGlyph, DocGlyph, LockGlyph } from "./glyphs";

/** Staged entrance: opacity + small rise, flattened by reduced-motion. */
const RISE = "animate-hero-rise";

type DocState = "quiet" | "active" | "restricted";

type DocRowProps = {
  name: string;
  meta: string;
  state: DocState;
  className?: string;
  delay: string;
};

function DocRow({ name, meta, state, className, delay }: DocRowProps) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-2 py-2",
        state === "active" &&
          "border-[rgba(22,136,245,0.38)] bg-[rgba(22,136,245,0.10)] border-s-2 border-s-[#1688f5]",
        state === "restricted" && "opacity-60",
        state === "quiet" && "opacity-55",
        className,
      )}
      style={{ animationDelay: delay }}
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-[22px] shrink-0 items-center justify-center rounded-[4px] border border-[rgba(22,136,245,0.26)] bg-[rgba(22,136,245,0.14)]"
      >
        <DocGlyph className="h-3 w-3 text-[#1688f5]" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          dir="ltr"
          className="block truncate text-[12.5px] font-semibold tracking-[-0.005em] text-on-primary/90"
        >
          {name}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-on-primary/35">
          {meta}
        </span>
      </span>
      {state === "active" && (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tracking-[0.02em] text-[#9bcfff]">
          <span
            aria-hidden="true"
            className="h-[5px] w-[5px] rounded-full bg-[#1688f5] shadow-[0_0_0_3px_rgba(22,136,245,0.14)]"
          />
          {t("landing.ksDocSelected")}
        </span>
      )}
      {state === "restricted" && (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tracking-[0.02em] text-on-primary/45">
          <LockGlyph className="h-2.5 w-2.5" />
          {t("landing.ksDocRestricted")}
        </span>
      )}
    </div>
  );
}

function PermissionStrip({ delay }: { delay: string }) {
  const { t } = useI18n();
  const checks = [
    "landing.ksPermCheck1",
    "landing.ksPermCheck2",
    "landing.ksPermCheck3",
  ];
  return (
    <div
      className={cn("mt-2.5 border-t border-white/5 pt-2.5", RISE)}
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border border-[rgba(22,136,245,0.3)] bg-[rgba(22,136,245,0.18)] text-[9px] font-bold text-[#a9d4ff]"
        >
          {t("landing.ksPermInitials")}
        </span>
        <span className="text-[11.5px] font-semibold text-on-primary/90">
          {t("landing.ksPermWho")}
        </span>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-on-primary/45">
        {checks.map((key) => (
          <li key={key} className="inline-flex items-center gap-1">
            {t(key)}
            <span
              aria-hidden="true"
              className="text-[11px] font-semibold text-tertiary-fixed-dim"
            >
              ✓
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Evidence({ delay }: { delay: string }) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "mt-4 flex items-center gap-3 rounded-e-lg border-s-2 border-s-tertiary-fixed-dim bg-white/[0.03] p-3",
        RISE,
      )}
      style={{ animationDelay: delay }}
    >
      <span
        aria-hidden="true"
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-tertiary-fixed-dim/30 bg-tertiary-fixed-dim/10"
      >
        <DocGlyph className="h-3.5 w-3.5 text-tertiary-fixed-dim" />
      </span>
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.03em] text-tertiary-fixed">
          <CheckGlyph className="h-[11px] w-[11px]" />
          {t("landing.ksVerified")}
        </span>
        <p dir="ltr" className="mt-0.5 truncate text-[13px] font-semibold text-on-primary/95">
          {t("landing.ksSourceName")}
        </p>
        <p dir="ltr" className="mt-0.5 truncate text-[11px] text-on-primary/45">
          {t("landing.ksSourceSub")}
        </p>
      </div>
    </div>
  );
}

function MetaLine({ delay }: { delay: string }) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "mt-3.5 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-white/5 pt-3 text-[10px] text-on-primary/35",
        RISE,
      )}
      style={{ animationDelay: delay }}
    >
      <span className="inline-flex items-center gap-1.5">
        {t("landing.ksMetaEvidence")}
        <b className="font-medium text-on-primary/55">3</b>
      </span>
      <span className="inline-flex items-center gap-1.5">
        {t("landing.ksMetaSources")}
        <b className="font-medium text-on-primary/55">1</b>
      </span>
      <span className="inline-flex items-center gap-1.5">
        {t("landing.ksMetaGrounded")}
        <span aria-hidden="true" className="text-[11px] font-semibold text-tertiary-fixed-dim">
          ✓
        </span>
      </span>
    </div>
  );
}

export function KnowledgeSystem() {
  const { t, dir } = useI18n();
  return (
    <div className="relative" dir={dir}>
      {/* structural spine — the engineered retrieval path */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-4 bottom-[-16px] start-[196px] hidden w-px bg-gradient-to-b from-transparent via-[rgba(22,136,245,0.5)] to-transparent min-[560px]:block"
      />
      {/* soft glow so the surface lifts off the dark field */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 rounded-3xl bg-[radial-gradient(closest-side,rgba(22,136,245,0.12),transparent_70%)] blur-xl"
      />
      <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-primary-container/80 to-primary-container/40 p-4 shadow-modal sm:p-5">
        {/* hairline accent across the top edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(22,136,245,0.4)] to-transparent"
        />
        <div className="grid gap-6 min-[560px]:grid-cols-[minmax(0,180px)_minmax(0,1fr)] min-[560px]:gap-5">
          {/* company knowledge + permission */}
          <div className="min-w-0">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-on-primary/35">
              {t("landing.ksLabel")}
            </p>
            <div className="mt-2.5 space-y-1">
              <DocRow
                name={t("landing.ksDoc1Name")}
                meta={t("landing.ksDoc1Meta")}
                state="quiet"
                className={cn(RISE, "hidden min-[560px]:flex")}
                delay="140ms"
              />
              <DocRow
                name={t("landing.ksDoc2Name")}
                meta={t("landing.ksDoc2Meta")}
                state="active"
                className={cn(RISE, "flex")}
                delay="180ms"
              />
              <DocRow
                name={t("landing.ksDoc3Name")}
                meta={t("landing.ksDoc3Meta")}
                state="restricted"
                className={cn(RISE, "flex")}
                delay="220ms"
              />
            </div>
            <PermissionStrip delay="260ms" />
          </div>

          {/* question → answer → evidence */}
          <div className="min-w-0">
            <div className={RISE} style={{ animationDelay: "300ms" }}>
              <p className="flex items-baseline gap-2 text-[13.5px] font-medium text-on-primary/85">
                <span
                  aria-hidden="true"
                  className="text-[12px] font-bold text-[#1688f5]"
                >
                  Q
                </span>
                {t("landing.ksQuestion")}
              </p>
            </div>

            <div className={RISE} style={{ animationDelay: "360ms" }}>
              <p className="mt-2.5 flex items-center text-[clamp(40px,3.5vw,54px)] font-bold leading-[1.06] tracking-[-0.025em] text-white">
                <span
                  aria-hidden="true"
                  className="me-3 inline-block h-[7px] w-[7px] shrink-0 rounded-[2px] bg-[#1688f5] shadow-[0_0_0_4px_rgba(22,136,245,0.12)]"
                />
                <span dir={dir}>{t("landing.ksAnswer")}</span>
              </p>
              <p className="mt-1.5 max-w-[300px] text-[13px] leading-[1.5] text-on-primary/70">
                {t("landing.ksAnswerBody")}
              </p>
            </div>

            <Evidence delay="420ms" />
          </div>
        </div>

        <MetaLine delay="460ms" />
      </div>
    </div>
  );
}
