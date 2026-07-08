/**
 * Pure class-resolution logic for the shared UI kit.
 *
 * Deliberately framework-free (no JSX, no React import) so it can be unit
 * tested without a DOM, and so invalid/unexpected input has one obvious,
 * tested fallback instead of silently rendering broken markup.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "outline",
  "danger",
];

export const BUTTON_SIZES: readonly ButtonSize[] = ["sm", "md", "lg"];

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Navy background, white text — DESIGN.md "Primary" button.
  primary:
    "bg-primary text-on-primary hover:bg-primary-container disabled:bg-outline-variant disabled:text-outline",
  // Accent teal — DESIGN.md "Secondary", reserved for AI-specific actions.
  secondary:
    "bg-on-tertiary-container text-on-tertiary hover:opacity-90 disabled:bg-outline-variant disabled:text-outline",
  // Transparent, navy text — DESIGN.md "Ghost".
  ghost:
    "bg-transparent text-primary hover:bg-surface-container disabled:text-outline",
  outline:
    "bg-transparent text-primary border border-outline hover:bg-surface-container disabled:text-outline disabled:border-outline-variant",
  danger:
    "bg-error text-on-error hover:opacity-90 disabled:bg-outline-variant disabled:text-outline",
};

const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-label-sm rounded-sm gap-1.5",
  md: "h-10 px-4 text-label-md rounded-md gap-2",
  lg: "h-12 px-6 text-body-md rounded-md gap-2",
};

const BUTTON_BASE_CLASSES =
  "inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

function isButtonVariant(value: unknown): value is ButtonVariant {
  return (
    typeof value === "string" &&
    (BUTTON_VARIANTS as readonly string[]).includes(value)
  );
}

function isButtonSize(value: unknown): value is ButtonSize {
  return (
    typeof value === "string" && (BUTTON_SIZES as readonly string[]).includes(value)
  );
}

/**
 * Resolves a Button's class list. Unrecognized variant/size values
 * (undefined, typos, values from untyped JS callers) fall back to
 * "primary" / "md" rather than throwing or rendering unstyled.
 */
export function getButtonClasses(
  variant: unknown = "primary",
  size: unknown = "md",
): string {
  const resolvedVariant = isButtonVariant(variant) ? variant : "primary";
  const resolvedSize = isButtonSize(size) ? size : "md";

  return [
    BUTTON_BASE_CLASSES,
    BUTTON_VARIANT_CLASSES[resolvedVariant],
    BUTTON_SIZE_CLASSES[resolvedSize],
  ].join(" ");
}

export type BadgeStatus = "success" | "warning" | "error" | "info" | "neutral";

const BADGE_STATUS_CLASSES: Record<BadgeStatus, string> = {
  success: "bg-tertiary-container text-on-tertiary-container",
  warning: "bg-secondary-container text-on-secondary-container",
  error: "bg-error-container text-on-error-container",
  info: "bg-primary-fixed text-on-primary-fixed",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

const BADGE_BASE_CLASSES =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label-sm uppercase tracking-wide";

/** Known status words -> semantic badge status, matched case-insensitively. */
const STATUS_WORD_MAP: Record<string, BadgeStatus> = {
  ready: "success",
  active: "success",
  answered: "success",
  connected: "success",
  online: "success",
  resolved: "success",
  passed: "success",

  processing: "warning",
  pending: "warning",
  degraded: "warning",

  failed: "error",
  refused: "error",
  error: "error",
  disconnected: "error",
  offline: "error",

  reviewed: "info",
  open: "info",
};

/**
 * Maps a free-text status label (as it appears in API/document data, e.g.
 * "Ready", "processing", "FAILED") to a semantic badge status. Falls back
 * to "neutral" for unknown, empty, or non-string input so a badge never
 * throws or renders with no styling for data the design didn't anticipate.
 */
export function resolveBadgeStatus(label: unknown): BadgeStatus {
  if (typeof label !== "string") {
    return "neutral";
  }

  const normalized = label.trim().toLowerCase();

  return STATUS_WORD_MAP[normalized] ?? "neutral";
}

export function getBadgeClasses(status: BadgeStatus | (string & {})): string {
  const resolvedStatus: BadgeStatus =
    typeof status === "string" && status in BADGE_STATUS_CLASSES
      ? (status as BadgeStatus)
      : resolveBadgeStatus(status);

  return [BADGE_BASE_CLASSES, BADGE_STATUS_CLASSES[resolvedStatus]].join(" ");
}
