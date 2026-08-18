"use client";

/**
 * "FAQ / buyer questions" — the question-and-answer section.
 *
 * Section 9 of the public landing page, placed immediately after pricing.
 * By now the visitor knows what DocuMind does, how permissions work, how
 * answers stay grounded, and what the plans cost. This section answers the
 * one question that remains: "Will this actually work for my organization?"
 *
 * The composition is editorial, not a FAQ widget: a light surface, a
 * sticky/anchored intro on the left, and a large ruled accordion on the
 * right where every item is separated by a horizontal rule — never a card.
 * Each question carries a small two-digit editorial index; the expand
 * control is a restrained plus→minus mark, not a circled icon.
 *
 * Every answer is product-verified against the current implementation:
 * tenant isolation, permission-scoped retrieval, grounded answers and the
 * insufficient-evidence refusal, the real upload formats (PDF / DOCX / TXT,
 * 50 MB, OCR for scans), Arabic+English support, document replacement
 * re-indexing, entitlement-enforced plan limits, and the Billing plan-change
 * preview. Nothing here promises behavior the product does not have.
 *
 * Motion is limited to a 200ms opacity + grid-rows expansion, disabled by
 * `prefers-reduced-motion`. The accordion is accessible: h3 → button
 * triggers with aria-expanded / aria-controls, an associated `role="region"`
 * answer, keyboard operation, focus-visible styling, and `inert` content
 * while closed so hidden answers are never announced or focusable.
 */

import { useState } from "react";
import { useI18n } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";

interface FaqItem {
  id: string;
  q: string;
  a: string;
}

/** The verified question set — English + Arabic copy lives in the i18n dictionaries. */
const FAQ_ITEMS: FaqItem[] = [
  { id: "isolation", q: "landing.faqQ1", a: "landing.faqA1" },
  { id: "access", q: "landing.faqQ2", a: "landing.faqA2" },
  { id: "verify", q: "landing.faqQ3", a: "landing.faqA3" },
  { id: "insufficient", q: "landing.faqQ4", a: "landing.faqA4" },
  { id: "formats", q: "landing.faqQ5", a: "landing.faqA5" },
  { id: "languages", q: "landing.faqQ6", a: "landing.faqA6" },
  { id: "changes", q: "landing.faqQ7", a: "landing.faqA7" },
  { id: "limits", q: "landing.faqQ8", a: "landing.faqA8" },
  { id: "plan-change", q: "landing.faqQ9", a: "landing.faqA9" },
];

/** Restrained expand control — a plus that becomes a minus, never a circle. */
function ExpandMark({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative h-4 w-4 shrink-0 text-on-surface-variant"
    >
      <svg
        viewBox="0 0 16 16"
        className={cn(
          "absolute inset-0 h-full w-full transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-0" : "opacity-100",
        )}
      >
        <path
          d="M8 2v12M2 8h12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <svg
        viewBox="0 0 16 16"
        className={cn(
          "absolute inset-0 h-full w-full text-[#1688f5] transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        <path
          d="M2 8h12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** One ruled accordion row. The answer region stays in the DOM (for
 *  `aria-controls`) but is inert + aria-hidden while closed. */
function FaqRow({
  item,
  index,
  open,
  onToggle,
}: {
  item: FaqItem;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const questionId = `faq-question-${item.id}`;
  const answerId = `faq-answer-${item.id}`;

  return (
    <li className="border-b border-outline-variant" data-faq={item.id} data-open={open}>
      <h3 className="m-0">
        <button
          id={questionId}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={answerId}
          className="group flex min-h-[44px] w-full items-center gap-5 py-5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1688f5] sm:gap-6"
        >
          <span
            aria-hidden="true"
            className={cn(
              "shrink-0 text-[13px] font-bold tabular-nums tracking-[0.06em] transition-colors duration-200 motion-reduce:transition-none",
              open ? "text-[#1688f5]" : "text-on-surface-variant/55 group-hover:text-[#1688f5]",
            )}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "flex-1 text-title-md font-semibold leading-[1.45] transition-colors duration-200 motion-reduce:transition-none sm:text-title-lg",
              open ? "text-primary" : "text-on-surface group-hover:text-primary",
            )}
          >
            {t(item.q)}
          </span>
          <ExpandMark open={open} />
        </button>
      </h3>

      <div
        id={answerId}
        role="region"
        aria-labelledby={questionId}
        inert={!open}
        aria-hidden={!open}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="max-w-[640px] pb-6 text-body-md leading-[1.75] text-on-surface-variant sm:pb-7">
            {t(item.a)}
          </p>
        </div>
      </div>
    </li>
  );
}

export function FaqSection() {
  const { t, dir } = useI18n();
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0].id);

  const toggle = (id: string) =>
    setOpenId((current) => (current === id ? null : id));

  return (
    <section
      id="faq"
      dir={dir}
      aria-labelledby="faq-heading"
      className="relative scroll-mt-16 bg-surface"
    >
      {/* faint brand wash at the very top — depth, not decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(760px_340px_at_50%_0%,rgba(22,136,245,0.05),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-[1400px] px-[clamp(24px,3.6vw,80px)] pb-20 pt-14 sm:pb-28 sm:pt-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16 xl:gap-24">
          {/* editorial intro — anchored beside the accordion on desktop */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-[#1688f5]" />
              {t("landing.faqEyebrow")}
            </p>
            <h2
              id="faq-heading"
              className="mt-4 text-balance text-[clamp(28px,3.4vw,42px)] font-bold leading-[1.15] tracking-[-0.02em] text-primary"
            >
              {t("landing.faqHeadline1")}
              <br className="hidden min-[560px]:inline" /> {t("landing.faqHeadline2")}
            </h2>
            <p className="mt-5 max-w-xl text-body-lg leading-[1.7] text-on-surface-variant">
              {t("landing.faqSupport")}
            </p>

            {/* quiet bridge — hands off to the final CTA that follows */}
            <div className="mt-10 hidden border-t border-outline-variant pt-6 lg:block">
              <p className="text-body-md font-medium leading-[1.6] text-on-surface-variant/80">
                {t("landing.faqBridge1")}
                <br />
                {t("landing.faqBridge2")}
              </p>
            </div>
          </div>

          {/* the ruled accordion */}
          <ul className="border-t border-outline-variant">
            {FAQ_ITEMS.map((item, i) => (
              <FaqRow
                key={item.id}
                item={item}
                index={i}
                open={openId === item.id}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}