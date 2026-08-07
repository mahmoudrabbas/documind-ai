import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export type UpgradePromptVariant = "quota" | "subscription-inactive";

export interface UpgradePromptProps {
  /** Human-readable label for the quota dimension (e.g. "documents", "storageMb"). */
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a camelCase or snake_case dimension key into a human-readable label.
 *
 * Examples:
 *   "documents"      → "Documents"
 *   "storageMb"      → "Storage MB"
 *   "active_users"   → "Active Users"
 *   "apiCallsPerDay" → "Api Calls Per Day"
 */
function humanizeDimension(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → spaces
    .replace(/_/g, " ")                     // snake_case → spaces
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
            {title ?? "Subscription Inactive"}
          </p>
          <p className="mt-1 text-body-sm text-on-error-container/80">
            {description ??
              "Your subscription is inactive. Reactivate your plan to continue using DocuMind AI."}
          </p>
        </div>
        <div className="shrink-0 self-center">
          {hasBillingPermission ? (
            <Button variant="danger" size="sm" onClick={onUpgradeClick}>
              {ctaLabel ?? "Reactivate plan"}
            </Button>
          ) : (
            <span className="block max-w-40 text-right text-label-sm text-on-surface-variant/70">
              {hintLabel ?? "Contact your admin to reactivate"}
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
  const label = humanizeDimension(dimension);
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
              ? `${label} limit reached`
              : `${label} nearly full`)}
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
              ? `You have used ${percent}% of your ${label.toLowerCase()} quota. Some actions may be blocked.`
              : `You have used ${percent}% of your ${label.toLowerCase()} capacity.`)}
        </p>

        {/* Usage bar */}
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10"
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label={`${label} usage: ${percent}%`}
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
            {ctaLabel ?? "Upgrade"}
          </Button>
        ) : (
          <span className="block max-w-40 text-right text-label-sm text-on-surface-variant/70">
            {hintLabel ?? "Contact your admin to upgrade"}
          </span>
        )}
      </div>
    </div>
  );
}
