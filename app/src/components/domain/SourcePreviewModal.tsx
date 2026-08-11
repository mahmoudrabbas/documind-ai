"use client";

import { useI18n } from "@/providers/i18n-provider";

interface SourcePreviewModalProps {
  title: string;
  text?: string;
  documentId?: string;
  loading?: boolean;
  onDownload?: () => void;
  onClose: () => void;
}

export function SourcePreviewModal({
  title,
  text,
  documentId,
  loading = false,
  onDownload,
  onClose,
}: SourcePreviewModalProps) {
  const { t } = useI18n();
  const isTextPreview = text !== undefined;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low px-4 py-2">
        <h2 className="min-w-0 truncate text-title-md font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"
          aria-label={t("common.close")}
        >
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        {loading ? (
          <p className="text-body-md text-on-surface-variant">{t("chat.sourcePreviewLoading")}</p>
        ) : isTextPreview ? (
          <pre className="w-full max-w-5xl whitespace-pre-wrap break-words rounded-lg bg-surface-container-low p-4 text-body-md text-on-surface">
            {text}
          </pre>
        ) : (
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <p className="text-body-md text-on-surface-variant">{t("chat.sourcePreviewUnavailable")}</p>
            {documentId && onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="rounded-md bg-primary px-4 py-2 text-label-md font-semibold text-on-primary hover:bg-primary/90"
              >
                {t("documents.download")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
