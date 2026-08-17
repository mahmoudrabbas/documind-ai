"use client";

import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Current page size — enables the page-size dropdown. */
  pageSize?: number;
  /** Callback when the user picks a different page size. */
  onPageSizeChange?: (size: number) => void;
  /** Available page-size options for the dropdown. */
  pageSizeOptions?: number[];
  /** Show the page-size dropdown (only when onPageSizeChange is provided). */
  showPageSize?: boolean;
  /** Text-direction — mirrors the container for RTL layouts. */
  dir?: "ltr" | "rtl";
  /** Override every label the component renders. */
  labels?: {
    previous: string;
    next: string;
    /** Already-interpolated page indicator, e.g. "Page 1 of 5". */
    pageOf: string;
    /** Label rendered next to the page-size dropdown. */
    itemsPerPage?: string;
  };
}

const PAGE_SIZE_DEFAULTS = [10, 20, 50, 100];

/**
 * Shared pagination control for super-admin table views.
 *
 * Renders a "Previous" / "Page X of Y" / "Next" row with optional
 * page-size dropdown. Disabled states, hover, and active press feedback
 * follow the DocuMind blue brand palette.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_DEFAULTS,
  showPageSize = false,
  dir,
  labels,
}: PaginationProps) {
  const prevLabel = labels?.previous ?? "Previous";
  const nextLabel = labels?.next ?? "Next";
  const pageOfLabel =
    labels?.pageOf ?? `Page ${page} of ${totalPages}`;
  const itemsPerPageLabel = labels?.itemsPerPage ?? "Items per page";

  const isRTL = dir === "rtl";

  return (
    <div
      dir={dir}
      className={cn(
        "mt-4 flex flex-wrap items-center gap-3",
        isRTL ? "flex-row-reverse" : "justify-end",
      )}
    >
      {showPageSize && onPageSizeChange ? (
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="whitespace-nowrap">{itemsPerPageLabel}</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="pagination-select h-9 rounded-lg border border-[#BAE6FD] bg-[#E0F2FE] px-2 py-1 text-xs font-semibold text-[#0369A1] outline-none focus:ring-2 focus:ring-[#38BDF8]"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className="pagination-btn min-h-9 rounded-lg border border-[#BAE6FD] bg-[#E0F2FE] px-3 py-1.5 text-xs font-semibold text-[#0369A1] disabled:bg-[#E2E8F0] disabled:text-[#94A3B8] disabled:cursor-not-allowed disabled:border-[#E2E8F0]"
      >
        {prevLabel}
      </button>

      <span
        aria-live="polite"
        className="text-sm text-on-surface-variant"
      >
        {pageOfLabel}
      </span>

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        className="pagination-btn min-h-9 rounded-lg border border-[#BAE6FD] bg-[#E0F2FE] px-3 py-1.5 text-xs font-semibold text-[#0369A1] disabled:bg-[#E2E8F0] disabled:text-[#94A3B8] disabled:cursor-not-allowed disabled:border-[#E2E8F0]"
      >
        {nextLabel}
      </button>
    </div>
  );
}
