import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind CSS classes, resolving conflicts predictably. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a date for display in the UI.
 *
 * `locale` is a BCP-47 tag; components should pass `useIntlLocale()` so
 * dates follow the selected language. It defaults to `"en-US"` to keep
 * existing non-localized callers rendering exactly as before.
 */
export function formatDate(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
  locale: string = "en-US",
): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

/** Format a date with only month and year (no day). */
export function formatMonthYear(
  date: Date | string | number,
  locale: string = "en-US",
): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/**
 * Break a timestamp into a translation key plus its interpolation
 * params, e.g. `{ key: "common.relativeMinutes", params: { count: "5" } }`.
 *
 * The thresholds are identical to {@link formatRelativeTime}; only the
 * rendering moves to the caller, which resolves the key with `t()`. A
 * date older than a week returns no key and should be shown with
 * {@link formatDate} instead.
 */
export function getRelativeTimeParts(date: Date | string | number): {
  key: string | null;
  params?: Record<string, string>;
} {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffSec < 60) return { key: "common.relativeJustNow" };
  if (diffSec < 3600) {
    return {
      key: "common.relativeMinutes",
      params: { count: String(Math.floor(diffSec / 60)) },
    };
  }
  if (diffSec < 86400) {
    return {
      key: "common.relativeHours",
      params: { count: String(Math.floor(diffSec / 3600)) },
    };
  }
  if (diffSec < 604800) {
    return {
      key: "common.relativeDays",
      params: { count: String(Math.floor(diffSec / 86400)) },
    };
  }

  return { key: null };
}

/** Format a relative time string (e.g. "2 hours ago"). */
export function formatRelativeTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

  return formatDate(d);
}

/** Delays execution for the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Truncate a string to the given length, appending an ellipsis. */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength).replace(/\s+\S*$/, "") + "…";
}

/** Format MIME type or file extension into a clean, concise badge label (e.g. DOCX, PDF, TXT). */
export function formatFileType(mimeType?: string | null, fileName?: string | null): string {
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "docx" || ext === "doc") return "DOCX";
    if (ext === "pdf") return "PDF";
    if (ext === "txt") return "TXT";
    if (ext === "md") return "MD";
    if (ext === "xlsx" || ext === "xls" || ext === "csv") return "XLSX";
  }

  if (!mimeType) return "-";
  const lower = mimeType.toLowerCase();
  if (
    lower.includes("wordprocessingml") ||
    lower.includes("msword") ||
    lower.includes("officedocument") ||
    lower.includes("docx") ||
    lower.includes("doc")
  ) {
    return "DOCX";
  }
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("plain")) return "TXT";
  if (lower.includes("markdown")) return "MD";
  if (lower.includes("spreadsheetml") || lower.includes("excel") || lower.includes("csv")) {
    return "XLSX";
  }

  const rawSub = mimeType.split("/").pop() || "";
  const cleanSub = rawSub.replace(/^vnd\./i, "").split(".").pop() || rawSub;
  return cleanSub.toUpperCase().slice(0, 8) || "FILE";
}

