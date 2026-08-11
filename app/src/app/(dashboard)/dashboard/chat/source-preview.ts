export type SourcePreviewKind = "pdf" | "text" | "unsupported";

const TEXT_MIME_TYPES = new Set(["text/plain"]);
const WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function extensionOf(fileName?: string | null): string {
  const value = fileName?.trim().toLowerCase() ?? "";
  const dot = value.lastIndexOf(".");
  return dot > -1 ? value.slice(dot + 1) : "";
}

/** Classifies only document types that have a safe client-side preview. */
export function classifySourceFile(
  mimeType?: string | null,
  fileName?: string | null,
): SourcePreviewKind {
  const mime = mimeType?.trim().toLowerCase() ?? "";
  const extension = extensionOf(fileName);

  if (mime === "application/pdf") return "pdf";
  if (TEXT_MIME_TYPES.has(mime)) return "text";
  if (WORD_MIME_TYPES.has(mime)) return "unsupported";

  // Unknown or absent MIME values occur in legacy metadata, so use the
  // validated document extension only as a compatibility fallback.
  if (extension === "pdf") return "pdf";
  if (extension === "txt") return "text";
  if (extension === "doc" || extension === "docx") return "unsupported";
  return "unsupported";
}
