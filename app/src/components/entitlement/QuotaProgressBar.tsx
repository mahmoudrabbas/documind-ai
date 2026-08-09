"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { Card } from "../ui/Card";

export interface QuotaProgressBarProps {
  label: string;
  current: number;
  limit: number;
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

  /* sanitise numeric inputs */
  const safeCurrent = Math.max(0, Math.round(current));
  const safeLimit = Math.max(0, Math.round(limit));

  const isUnlimited = safeLimit === 0;
  const percent = isUnlimited
    ? 100
    : Math.min(Math.round((safeCurrent / safeLimit) * 100), 100);
  const isFull = !isUnlimited && safeCurrent >= safeLimit;
  const almostFull = !isUnlimited && !isFull && safeLimit - safeCurrent <= 5;

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
        aria-valuenow={safeCurrent}
        aria-valuemin={0}
        aria-valuemax={isUnlimited ? safeCurrent : safeLimit}
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
                {formatNumber(safeCurrent, intlLocale)}
              </span>
              {" / "}
              {t("quota.noLimit")}
            </>
          ) : (
            <>
              <span className="font-medium text-on-surface">
                {formatNumber(safeCurrent, intlLocale)}
              </span>
              {" / "}
              {formatNumber(safeLimit, intlLocale)}
            </>
          )}{" "}
          {dimension}
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
