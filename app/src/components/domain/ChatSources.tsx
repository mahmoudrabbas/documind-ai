"use client";

import type { ChatSource } from "@/types/api/chat.types";
import { useI18n } from "@/providers/i18n-provider";
import { getContentDirection } from "@/lib/i18n/content-direction";

interface SourceListProps {
  sources: ChatSource[];
  onOpen: (source: ChatSource) => void;
}

function buildSourceAriaLabel(
  source: ChatSource,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  const parts: string[] = [];
  parts.push(t("chat.openSource"));
  parts.push(source.documentTitle ?? t("chat.document"));
  if (source.pageNumber != null) {
    parts.push(t("chat.page", { page: String(source.pageNumber) }));
  }
  if (source.sectionTitle) {
    parts.push(`${t("chat.section")}: ${source.sectionTitle}`);
  }
  return parts.join(", ");
}

export function SourceList({ sources, onOpen }: SourceListProps) {
  const { t } = useI18n();
  const listLabel =
    sources.length === 1 ? t("chat.source") : t("chat.sources");

  return (
    <div className="mt-4 w-full">
      <p className="mb-2 text-[13px] font-semibold text-on-surface-variant">
        {t("chat.sourceCount", { count: String(sources.length) })}
      </p>
      <ul aria-label={listLabel} className="flex list-none flex-col gap-1.5">
        {sources.map((source) => (
          <li key={source.chunkId} className="list-none">
            <SourceCard source={source} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SourceCardProps {
  source: ChatSource;
  onOpen: (source: ChatSource) => void;
}

function SourceCard({ source, onOpen }: SourceCardProps) {
  const { t } = useI18n();
  const title = source.documentTitle ?? t("chat.document");
  const titleDir = getContentDirection(title);
  const sectionDir = getContentDirection(source.sectionTitle ?? "");
  const hasMeta = source.pageNumber != null || Boolean(source.sectionTitle);

  return (
    <button
      type="button"
      onClick={() => onOpen(source)}
      title={t("chat.openSource")}
      aria-label={buildSourceAriaLabel(source, t)}
      className="group flex w-full items-center gap-2.5 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 px-3 py-2 text-start transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-[18px]">
          description
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          dir={titleDir.dir}
          lang={titleDir.lang}
          className="truncate text-[13px] font-medium text-on-surface"
        >
          {title}
        </span>
        {hasMeta && (
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-on-surface-variant">
            {source.pageNumber != null && (
              <span className="shrink-0">
                {t("chat.page", { page: String(source.pageNumber) })}
              </span>
            )}
            {source.pageNumber != null && source.sectionTitle && (
              <span className="shrink-0 text-outline" aria-hidden="true">
                ·
              </span>
            )}
            {source.sectionTitle && (
              <span
                dir={sectionDir.dir}
                lang={sectionDir.lang}
                className="truncate"
              >
                {source.sectionTitle}
              </span>
            )}
          </span>
        )}
      </span>
      <span
        className="material-symbols-outlined shrink-0 text-[16px] text-on-surface-variant/50 transition-colors group-hover:text-primary"
        aria-hidden="true"
      >
        open_in_new
      </span>
    </button>
  );
}
