"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { fetchChatAttachmentUrl } from "@/services/chat.service";
import type { ChatAttachment } from "@/types/api/chat.types";
import { useI18n } from "@/providers/i18n-provider";

interface ChatImageThumbnailProps {
  src: string;
  alt: string;
  onOpen: () => void;
  className?: string;
}

/**
 * Polished clickable image thumbnail used inside user messages. Pure
 * presentation: aspect ratio is preserved (no stretch, no crop), the image
 * is capped to sensible desktop bounds and to the bubble width on mobile so
 * it never overflows the transcript.
 */
export function ChatImageThumbnail({
  src,
  alt,
  onOpen,
  className,
}: ChatImageThumbnailProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      title={t("chat.openImagePreview")}
      aria-label={t("chat.openImagePreview")}
      className={cn(
        "group relative block w-fit max-w-full shrink-0 overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-high shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        className="block h-auto max-h-[280px] max-w-[min(320px,100%)] w-auto object-contain transition-opacity duration-150 group-hover:opacity-90"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1.5 end-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white/90 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <span className="material-symbols-outlined text-[14px]">zoom_in</span>
      </span>
    </button>
  );
}

interface PersistedChatImageThumbnailProps {
  attachment: ChatAttachment;
  alt?: string;
  onOpen: (src: string) => void;
}

/**
 * Persisted attachment thumbnail. Keeps the existing async URL fetch and
 * object-URL cleanup behavior intact, and only forwards the resolved src to
 * the shared thumbnail presentation plus the click-to-preview handler.
 */
export function PersistedChatImageThumbnail({
  attachment,
  alt,
  onOpen,
}: PersistedChatImageThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchChatAttachmentUrl(attachment.id)
      .then((url) => {
        if (cancelled) return;
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => {
        // Silently fail; the bubble still shows the message text.
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (!src) {
    return (
      <div
        aria-label={alt ?? attachment.fileName}
        className="h-44 w-72 max-w-full animate-pulse rounded-xl bg-on-surface/10"
      />
    );
  }

  return (
    <ChatImageThumbnail
      src={src}
      alt={alt ?? attachment.fileName}
      onOpen={() => onOpen(src)}
    />
  );
}
