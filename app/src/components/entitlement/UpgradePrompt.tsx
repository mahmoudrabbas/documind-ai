"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

export type UpgradePromptVariant = "quota" | "subscription-inactive";

export interface UpgradePromptProps {
  /**
   * Machine dimension code (e.g. `"documents"`, `"storageMb"`). Stays the
   * untranslated identifier — the visible label is resolved from it through
   * `codeLabel(t, "usage.dimension", …)`.
   */
  dimension: string;
  /** Current usage count (unused by the `subscription-inactive` variant). */
  current?: number;
  /** Usage limit (unused by the `subscription-inactive` variant). */
  limit?: number;
  /** Called when the user clicks the upgrade/reactivation CTA. */
  onUpgradeClick?: () => void;
  /** Whether the current user has billing permission. */
  hasBillingPermission: boolean;
  /** Usage ratio at which the warning prompt appears (default 0.8 = 80%). */
  warningThreshold?: number;
  /**
   * Presentation variant:
   * - `"quota"` (default) — usage-threshold prompt with progress bar.
   * - `"subscription-inactive"` — reactivation banner for a non-serviceable
   *   subscription (no usage numbers required).
   */
  variant?: UpgradePromptVariant;
  /** Overrides the default title copy (used to pass i18n strings). */
  title?: string;
  /** Overrides the default description copy. */
  description?: string;
  /** Overrides the default CTA label. */
  ctaLabel?: string;
  /** Overrides the default no-permission hint. */
  hintLabel?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Contextual upgrade suggestion component.
 *
 * Renders a prompt when `current / limit` exceeds `warningThreshold` (default 80%).
 * Shows a CTA button only when `hasBillingPermission` is `true`; without permission
 * it displays a muted hint to contact an admin. At ≥ 95% usage the prompt uses
 * error-styled colours.
 *
 * Renders nothing when usage is below the threshold.
 */
export function UpgradePrompt({
  dimension,
  current = 0,
  limit = 0,
  onUpgradeClick,
  hasBillingPermission,
  warningThreshold = 0.8,
  variant = "quota",
  title,
  description,
  ctaLabel,
  hintLabel,
  className,
}: UpgradePromptProps) {
  const { t } = useI18n();
  const ratio = limit > 0 ? current / limit : (current > 0 ? Infinity : 0);

  // ── Subscription-inactive variant: no usage numbers to render ────────
  if (variant === "subscription-inactive") {
    const containerClasses = cn(
      "flex items-start justify-between gap-4 rounded-xl border p-4",
      "border-error/20 bg-error-container text-on-error-container",
      className,
    );

    return (
      <div className={containerClasses} role="alert">
        <div className="flex-1">
          <p className="text-label-md font-semibold text-on-error-container">
            {title ?? t("entitlement.denial.subscriptionInactiveTitle")}
          </p>
          <p className="mt-1 text-body-sm text-on-error-container/80">
            {description ??
              t("entitlement.denial.subscriptionInactiveDescription")}
          </p>
        </div>
        <div className="shrink-0 self-center">
          {hasBillingPermission ? (
            <Button variant="danger" size="sm" onClick={onUpgradeClick}>
              {ctaLabel ?? t("entitlement.denial.reactivateCta")}
            </Button>
          ) : (
            <span className="block max-w-40 text-end text-label-sm text-on-surface-variant/70">
              {hintLabel ?? t("entitlement.denial.reactivateHint")}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Don't render anything below the warning threshold ──
  if (ratio < warningThreshold) {
    return null;
  }

  const isCritical = ratio >= 0.95;
  const isExceeded = ratio >= 1;
  const label = codeLabel(t, "usage.dimension", dimension);
  const percent = Math.min(Math.round(ratio * 100), 100);

  // ── Container classes ───────────────────────────────────────────────
  const containerClasses = cn(
    "flex items-start justify-between gap-4 rounded-xl border p-4",
    isCritical
      ? "border-error/20 bg-error-container text-on-error-container"
      : "border-warning/20 bg-warning-container text-on-warning-container",
    className,
  );

  return (
    <div className={containerClasses} role="alert">
      <div className="flex-1">
        {/* Title */}
        <p
          className={cn(
            "text-label-md font-semibold",
            isCritical ? "text-on-error-container" : "text-on-warning-container",
          )}
        >
          {title ??
            (isExceeded
              ? t("entitlement.upgrade.limitReachedTitle", { dimension: label })
              : t("entitlement.upgrade.nearlyFullTitle", { dimension: label }))}
        </p>

        {/* Description */}
        <p
          className={cn(
            "mt-1 text-body-sm",
            isCritical
              ? "text-on-error-container/80"
              : "text-on-warning-container/80",
          )}
        >
          {description ??
            (isExceeded
              ? t("entitlement.upgrade.limitReachedDescription", {
                  percent: String(percent),
                  /* Casing only — the label is already translated, and
                     `toLowerCase` is a no-op for Arabic script. Keeps the
                     English sentence reading "your documents quota". */
                  dimension: label.toLowerCase(),
                })
              : t("entitlement.upgrade.nearlyFullDescription", {
                  percent: String(percent),
                  dimension: label.toLowerCase(),
                }))}
        </p>

        {/* Usage bar */}
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10"
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label={t("entitlement.upgrade.usageAria", {
            dimension: label,
            percent: String(percent),
          })}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              isCritical ? "bg-error" : "bg-warning",
            )}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>

      {/* CTA or permission hint */}
      <div className="shrink-0 self-center">
        {hasBillingPermission ? (
          <Button
            variant={isCritical ? "danger" : "warning"}
            size="sm"
            onClick={onUpgradeClick}
          >
            {ctaLabel ?? t("entitlement.upgrade.cta")}
          </Button>
        ) : (
          <span className="block max-w-40 text-end text-label-sm text-on-surface-variant/70">
            {hintLabel ?? t("entitlement.upgrade.hint")}
          </span>
        )}
      </div>
    </div>
  );
}
