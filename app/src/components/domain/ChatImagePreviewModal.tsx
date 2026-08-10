"use client";

import { useEffect } from "react";
import { useI18n } from "@/providers/i18n-provider";

interface ChatImagePreviewModalProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

/**
 * Frontend-only image preview lightbox. Opens for both local optimistic
 * previews and persisted chat attachments using the already-available URL.
 * The image is constrained to the viewport, centered, and never overflows.
 */
export function ChatImagePreviewModal({
  src,
  alt,
  onClose,
}: ChatImagePreviewModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!src) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [src, onClose]);

  useEffect(() => {
    if (!src) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.getElementById("chat-image-preview-close")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [src]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("chat.imagePreview")}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-full max-w-full items-center justify-center">
        <button
          id="chat-image-preview-close"
          type="button"
          onClick={onClose}
          aria-label={t("chat.closeImagePreview")}
          title={t("chat.closeImagePreview")}
          className="absolute -top-3 -end-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-on-surface shadow-modal transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span
            className="material-symbols-outlined text-[20px]"
            aria-hidden="true"
          >
            close
          </span>
        </button>
        <img
          src={src}
          alt={alt ?? t("chat.imagePreview")}
          className="max-h-[calc(100dvh-4rem)] max-w-[calc(100vw-2rem)] rounded-xl object-contain shadow-modal"
        />
      </div>
    </div>
  );
}
