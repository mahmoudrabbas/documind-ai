"use client";

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { getContentDirection } from "@/lib/i18n/content-direction";

/**
 * Client-side defense-in-depth strip for reasoning tags. The authoritative
 * guarantee lives server-side (outputSanitizer.ts); this only ensures that a
 * leaked block is never even visible in the rendered assistant bubble.
 */
const REASONING_BLOCK_PATTERN =
  /<\s*(?:think|analysis)\b[^>]*>[\s\S]*?(?:<\s*\/\s*(?:think|analysis)\s*>|$)/gi;

function stripReasoning(content: string): string {
  return content.replace(REASONING_BLOCK_PATTERN, "").trim();
}

function MarkdownLink(
  props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown },
) {
  const { href, node: _node, children, ...rest } = props;
  const linkClass =
    "break-words text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary";
  const isExternal =
    typeof href === "string" && /^https?:\/\//i.test(href);
  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <a href={href} className={linkClass} {...rest}>
      {children}
    </a>
  );
}

function IgnoredImage(): null {
  // Model-generated remote images are never rendered automatically.
  return null;
}

const components: Components = {
  a: MarkdownLink,
  img: IgnoredImage,
  p: ({ node: _node, ...props }) => (
    <p className="whitespace-pre-line text-start" {...props} />
  ),
  h1: ({ node: _node, ...props }) => (
    <h1 className="mb-1 mt-3 text-start text-base font-bold text-on-surface" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 className="mb-1 mt-3 text-start text-base font-bold text-on-surface" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="mb-1 mt-3 text-start text-sm font-bold text-on-surface" {...props} />
  ),
  h4: ({ node: _node, ...props }) => (
    <h4 className="mb-1 mt-2 text-start text-sm font-semibold text-on-surface" {...props} />
  ),
  h5: ({ node: _node, ...props }) => (
    <h5 className="mb-1 mt-2 text-start text-sm font-semibold text-on-surface" {...props} />
  ),
  h6: ({ node: _node, ...props }) => (
    <h6 className="mb-1 mt-2 text-start text-sm font-semibold text-on-surface" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="list-disc space-y-1 ps-5" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="list-decimal space-y-1 ps-5" {...props} />
  ),
  li: ({ node: _node, ...props }) => (
    <li className="break-words leading-relaxed" {...props} />
  ),
  code: ({ node: _node, ...props }) => (
    <code
      className="break-words rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[0.9em] text-on-surface"
      {...props}
    />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="my-2 max-w-full overflow-x-auto rounded-lg border border-outline-variant/30 bg-surface-container-high p-3 text-[13px] leading-relaxed [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[13px]"
      {...props}
    />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="my-2 max-w-full break-words border-s-2 border-primary/40 ps-3 text-start text-on-surface-variant"
      {...props}
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-2 max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-start text-sm" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th
      className="border border-outline-variant/30 bg-surface-container-high px-3 py-1.5 font-semibold text-on-surface"
      {...props}
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td
      className="border border-outline-variant/30 px-3 py-1.5 text-on-surface"
      {...props}
    />
  ),
};

interface AssistantMarkdownProps {
  content: string;
}

export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  const { dir, lang } = getContentDirection(content);
  return (
    <div dir={dir} lang={lang} className="space-y-1">
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
        {stripReasoning(content)}
      </ReactMarkdown>
    </div>
  );
}
