/**
 * Lightweight presentation-only formatter for the sidebar conversation
 * preview. It strips Markdown tokens (headings, emphasis, code fences, table
 * pipes, links) and any leaked reasoning blocks so the one-line preview reads
 * as clean plain text. The full stored assistant content is never altered.
 */

const REASONING_BLOCK_PATTERN =
  /<\s*(?:think|analysis)\b[^>]*>[\s\S]*?(?:<\s*\/\s*(?:think|analysis)\s*>|$)/gi;

const FENCED_CODE_BLOCK_PATTERN = /```[^\n]*\n([\s\S]*?)(?:\n```|$)/g;

const TABLE_SEPARATOR_ROW_PATTERN =
  /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/gm;

export const PREVIEW_MAX_LENGTH = 100;

function truncateExcerpt(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const end = lastSpace > maxLength * 0.6 ? lastSpace : maxLength;
  const trimmed = cut.slice(0, end).replace(/\s+$/, "");
  if (trimmed.length === 0) return `${cut.slice(0, maxLength)}…`;
  return `${trimmed}…`;
}

export function previewText(
  content: string,
  maxLength: number = PREVIEW_MAX_LENGTH,
): string {
  if (typeof content !== "string" || content.length === 0) return "";

  let text = content
    .replace(REASONING_BLOCK_PATTERN, "")
    .replace(FENCED_CODE_BLOCK_PATTERN, "$1")
    .replace(TABLE_SEPARATOR_ROW_PATTERN, "");

  // Drop any raw HTML tags (the chat body never renders them either).
  text = text.replace(/<[^>]*>/g, " ");

  // Heading markers.
  text = text.replace(/^\s{0,3}#{1,6}(?=\s|\t|$)/gm, "");

  // Images and links keep their readable label/title text.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Bold, italic, strikethrough markers.
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2");
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2");
  text = text.replace(/~~([^~]+)~~/g, "$1");

  // Inline code keeps its inner text.
  text = text.replace(/`([^`\n]+)`/g, "$1");

  // List and blockquote markers at line starts.
  text = text.replace(/^\s*([-*+]\s+|\d+[.)]\s+)/gm, "");
  text = text.replace(/^\s*>\s?/gm, "");

  // Table pipes collapse into a single space.
  text = text.replace(/\|/g, " ");

  // Collapse excessive whitespace into a single space.
  text = text.replace(/\s+/g, " ").trim();

  return truncateExcerpt(text, maxLength);
}
