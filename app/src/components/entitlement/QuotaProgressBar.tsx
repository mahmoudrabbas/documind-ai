"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { Card } from "../ui/Card";

export interface QuotaProgressBarProps {
  label: string;
  current: number;
  limit: number;
  /**
   * Machine dimension code (e.g. "storageMb"). Kept for callers and
   * analytics; it is deliberately NOT rendered — `label` carries the
   * translated text, and printing the raw code beside it leaked English
   * like "2 / 5 employees" into the Arabic UI.
   */
  dimension: string;
  periodReset?: string;
  /** @default 0.8 — reserved for customising the warning threshold. */
  warningThreshold?: number;
  className?: string;
  /** Explicit direction override; falls back to `document.dir` when omitted. */
  dir?: "ltr" | "rtl";
}

/* ---- colour bands ------------------------------------------------------ */

function getBarColor(percent: number, isUnlimited: boolean): string {
  if (isUnlimited) return "bg-success";
  if (percent >= 95) return "bg-error";
  if (percent >= 60) return "bg-warning";
  return "bg-success";
}

/* ---- helpers ----------------------------------------------------------- */

function formatNumber(n: number, locale: string): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString(locale);
}

/**
 * Fractional storage formatting for the `storageMb` dimension.
 *
 * The backend reports storage usage in fractional megabytes (e.g. 0.21).
 * Formatting must keep that precision instead of rounding to a whole number,
 * trim unnecessary trailing zeros (1.00 -> "1"), and group thousands so the
 * quota limit reads naturally ("1,000"). Display-only — the raw value is
 * never mutated.
 */
export function formatStorageMb(n: number, locale: string): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(locale, { maximumFractionDigits: 2 });
}

function formatUsageValue(n: number, isStorage: boolean, locale: string): string {
  return isStorage ? formatStorageMb(n, locale) : formatNumber(n, locale);
}

/* ---- component --------------------------------------------------------- */

export function QuotaProgressBar({
  label,
  current,
  limit,
  dimension,
  periodReset,
  className,
  dir: dirProp,
}: QuotaProgressBarProps) {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const [isRtl, setIsRtl] = useState(dirProp === "rtl");

  useEffect(() => {
    if (dirProp) {
      setIsRtl(dirProp === "rtl");
    } else {
      setIsRtl(document.dir === "rtl");
    }
  }, [dirProp]);

  const isStorage = dimension === "storageMb";

  /* sanitise numeric inputs — keep the RAW value for progress math so a
     display rounding step can never flatten used / limit * 100 (0.21 MB
     of 1,000 MB must read 0.021%, not 0%). */
  const rawCurrent = Math.max(0, current);
  const rawLimit = Math.max(0, limit);

  const isUnlimited = rawLimit === 0;
  const percent = isUnlimited
    ? 100
    : Math.min((rawCurrent / rawLimit) * 100, 100);
  const isFull = !isUnlimited && rawCurrent >= rawLimit;
  const almostFull = !isUnlimited && !isFull && rawLimit - rawCurrent <= 5;

  /* display-only rounding: whole-number dimensions keep the historical
     rounded rendering; fractional storage keeps its actual value. */
  const displayCurrent = isStorage ? rawCurrent : Math.round(rawCurrent);
  const displayLimit = isStorage ? rawLimit : Math.round(rawLimit);

  /* badge logic */
  let badge: string | null = null;
  let badgeVariant: "warning" | "error" = "warning";
  if (isFull) {
    badge = t("quota.full");
    badgeVariant = "error";
  } else if (almostFull) {
    badge = t("quota.almostFull");
    badgeVariant = "warning";
  }

  const barColor = getBarColor(percent, isUnlimited);

  return (
    <Card className={cn("flex flex-col gap-3 p-4 lg:p-5", className)}>
      {/* ---- header row: label + optional semantic badge ---------------- */}
      <div className="flex items-center justify-between">
        <span className="text-body-sm text-on-surface-variant">{label}</span>
        {badge && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-label-sm",
              badgeVariant === "error"
                ? "bg-error-container text-on-error-container"
                : "bg-warning-container text-on-warning-container",
            )}
          >
            {badge}
          </span>
        )}
      </div>

      {/* ---- progress bar track ---------------------------------------- */}
      <div
        role="progressbar"
        aria-valuenow={rawCurrent}
        aria-valuemin={0}
        aria-valuemax={isUnlimited ? rawCurrent : rawLimit}
        aria-label={label}
        dir={isRtl ? "rtl" : undefined}
        className="relative h-2.5 overflow-hidden rounded-full bg-surface-container-high"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            barColor,
          )}
          style={{ width: `${percent}%` }}
        />

        {/* overlay badge at the end of the bar */}
        {badge && (
          <span
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
              isRtl ? "left-1" : "right-1",
              badgeVariant === "error"
                ? "bg-error text-on-error"
                : "bg-warning text-on-warning",
            )}
          >
            {badge}
          </span>
        )}
      </div>

      {/* ---- usage details: "X / Y dimension" + optional reset date ---- */}
      <div className="flex items-center justify-between">
        <span className="text-label-sm text-on-surface-variant">
          {isUnlimited ? (
            <>
              <span className="font-medium text-on-surface">
                {formatUsageValue(displayCurrent, isStorage, intlLocale)}
              </span>
              {" / "}
              {t("quota.noLimit")}
            </>
          ) : (
            <>
              <span className="font-medium text-on-surface">
                {formatUsageValue(displayCurrent, isStorage, intlLocale)}
              </span>
              {" / "}
              {formatUsageValue(displayLimit, isStorage, intlLocale)}
              {isStorage ? ` ${t("common.unitMB")}` : ""}
            </>
          )}
        </span>
        {periodReset && (
          <span className="text-label-sm text-on-surface-variant">
            {t("quota.resets", {
              date: new Date(periodReset).toLocaleDateString(intlLocale, {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
            })}
          </span>
        )}
      </div>
    </Card>
  );
}
