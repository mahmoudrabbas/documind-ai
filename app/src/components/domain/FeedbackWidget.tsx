"use client";

import { useState } from "react";
import { submitFeedback } from "@/services/feedback.service";
import { useI18n } from "@/providers/i18n-provider";
import type { FeedbackCategory, FeedbackRating } from "@/types/api/feedback.types";

interface FeedbackWidgetProps {
  messageId: string;
  conversationId: string;
  initialRating?: FeedbackRating | null;
  onFeedbackSubmitted?: () => void;
}

export function FeedbackWidget({
  messageId,
  conversationId,
  initialRating = null,
  onFeedbackSubmitted,
}: FeedbackWidgetProps) {
  const { t } = useI18n();
  const [rating, setRating] = useState<FeedbackRating | null>(initialRating);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(initialRating));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRate = async (newRating: FeedbackRating) => {
    setErrorMessage(null);
    setRating(newRating);
    if (newRating === "thumbs_down") {
      setShowCategoryMenu(true);
    } else {
      setShowCategoryMenu(false);
      await sendFeedback(newRating, undefined, undefined);
    }
  };

  const sendFeedback = async (
    r: FeedbackRating,
    cat?: FeedbackCategory,
    c?: string,
  ) => {
    try {
      setSubmitting(true);
      setErrorMessage(null);

      // If messageId is dummy (e.g. temporary ID without server sync), log warning
      if (!messageId || messageId.startsWith("a-") || messageId.startsWith("u-")) {
        setSubmitted(true);
        if (onFeedbackSubmitted) onFeedbackSubmitted();
        return;
      }

      await submitFeedback({
        messageId,
        conversationId,
        rating: r,
        category: cat || undefined,
        comment: c || undefined,
      });
      setSubmitted(true);
      if (onFeedbackSubmitted) onFeedbackSubmitted();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : t("chat.feedback.error"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    await sendFeedback(rating, (category as FeedbackCategory) || undefined, comment);
    setShowCategoryMenu(false);
  };

  return (
    <div className="mt-3 flex flex-col gap-1.5 text-xs" id={`feedback-widget-${messageId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-on-surface-variant">
            {t("chat.feedback.prompt")}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id={`thumbs-up-${messageId}`}
              disabled={submitting}
              onClick={() => handleRate("thumbs_up")}
              aria-label={t("chat.feedback.thumbsUpAria")}
              aria-pressed={rating === "thumbs_up"}
              title={t("chat.feedback.helpfulTitle")}
              className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                rating === "thumbs_up"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-outline-variant/25 text-on-surface-variant/80 hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={rating === "thumbs_up" ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                thumb_up
              </span>
              <span>{t("chat.feedback.yes")}</span>
            </button>

            <button
              type="button"
              id={`thumbs-down-${messageId}`}
              disabled={submitting}
              onClick={() => handleRate("thumbs_down")}
              aria-label={t("chat.feedback.thumbsDownAria")}
              aria-pressed={rating === "thumbs_down"}
              title={t("chat.feedback.notHelpfulTitle")}
              className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                rating === "thumbs_down"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "border-outline-variant/25 text-on-surface-variant/80 hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={rating === "thumbs_down" ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                thumb_down
              </span>
              <span>{t("chat.feedback.no")}</span>
            </button>
          </div>
        </div>

        {submitted && !showCategoryMenu && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="material-symbols-outlined text-[13px]">check_circle</span>
            <span>{t("chat.feedback.thanks")}</span>
          </div>
        )}
      </div>

      {errorMessage && (
        <p className="text-[11px] font-medium text-error">{errorMessage}</p>
      )}

      {showCategoryMenu && (
        <form
          onSubmit={handleSubmitDetails}
          className="flex flex-col gap-2.5 rounded-xl border border-outline-variant/25 bg-surface-container-lowest/70 p-3"
          id={`feedback-form-${messageId}`}
        >
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-on-surface-variant" htmlFor={`category-select-${messageId}`}>
              {t("chat.feedback.issuePrompt")}
            </label>
            <select
              id={`category-select-${messageId}`}
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              className="w-full rounded-lg border border-outline-variant/40 bg-surface px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">{t("chat.feedback.selectCategory")}</option>
              <option value="inaccurate">{t("chat.feedback.category.inaccurate")}</option>
              <option value="incomplete">{t("chat.feedback.category.incomplete")}</option>
              <option value="irrelevant">{t("chat.feedback.category.irrelevant")}</option>
              <option value="harmful">{t("chat.feedback.category.harmful")}</option>
              <option value="other">{t("chat.feedback.category.other")}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-on-surface-variant" htmlFor={`comment-input-${messageId}`}>
              {t("chat.feedback.detailsPrompt")}
            </label>
            <textarea
              id={`comment-input-${messageId}`}
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("chat.feedback.detailsPlaceholder")}
              className="w-full rounded-lg border border-outline-variant/40 bg-surface p-2 text-xs text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                setShowCategoryMenu(false);
                sendFeedback("thumbs_down", undefined, undefined);
              }}
              className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-[11px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              {t("chat.feedback.skip")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-[11px] font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? t("chat.feedback.submitting") : t("chat.feedback.submit")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
