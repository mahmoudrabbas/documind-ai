import { ApiError } from "@/lib/api-client";

/**
 * Map an upload API error to a localized translation key, or `null` when the
 * error should be surfaced verbatim (raw server message).
 *
 * `FILE_SIZE_LIMIT_EXCEEDED` is intentionally not mapped: the localized
 * `documents.fileTooLarge` key requires a `{{maxSize}}` parameter, and the
 * tenant-specific limit is only known server-side, so the raw message is kept.
 */
export function getDocumentUploadErrorKey(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;

  switch (error.code) {
    case "UNSUPPORTED_FILE_TYPE":
      return "documents.fileTypeNotSupported";
    case "FILE_ZERO_BYTES":
      return "documents.fileEmpty";
    case "FILE_SIGNATURE_MISMATCH":
      return "documents.fileContentsMismatch";
    default:
      return null;
  }
}
