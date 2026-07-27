import type { OcrPageResultView } from "@/types/api/processing.types";

const RETRYABLE_OCR_PAGE_STATUSES = new Set(["failed", "retry"]);

export function getRetryableOcrPageNumbers(
  pages: readonly Pick<OcrPageResultView, "pageNumber" | "status">[],
): number[] {
  return pages
    .filter((page) => RETRYABLE_OCR_PAGE_STATUSES.has(page.status))
    .map((page) => page.pageNumber);
}

