"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SELECT_CLASSES } from "./variants";

type PaginationItem = number | "ellipsis";

function getVisiblePages(page: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, "ellipsis", totalPages];
  }

  if (page >= totalPages - 3) {
    return [
      1,
      "ellipsis",
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, "ellipsis", page - 1, page, page + 1, "ellipsis", totalPages];
}

export interface CompactPaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  summary: ReactNode;
  previousLabel: string;
  nextLabel: string;
  rowsPerPageLabel: string;
  dir?: "ltr" | "rtl";
}

export function CompactPagination({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  summary,
  previousLabel,
  nextLabel,
  rowsPerPageLabel,
  dir,
}: CompactPaginationProps) {
  const pages = getVisiblePages(page, totalPages);

  return (
    <div
      dir={dir}
      className="flex flex-col gap-3 border-t border-outline-variant/30 bg-surface-container-lowest px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-body-sm text-on-surface-variant">{summary}</p>
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <span className="whitespace-nowrap">{rowsPerPageLabel}</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className={cn(SELECT_CLASSES, "h-9 w-24 py-0 text-sm")}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest px-3.5 py-2 text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previousLabel}
        </button>

        <div className="hidden items-center gap-2 md:flex">
          {pages.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="px-1 text-body-sm text-on-surface-variant"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={cn(
                  "inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-3 py-2 text-body-sm font-medium transition-colors",
                  item === page
                    ? "border-primary bg-primary text-on-primary shadow-sm"
                    : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                )}
              >
                {item}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest px-3.5 py-2 text-body-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
