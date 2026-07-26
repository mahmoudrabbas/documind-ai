/**
 * Pure class-resolution logic for the shared UI kit.
 *
 * Deliberately framework-free (no JSX, no React import) so it can be unit
 * tested without a DOM, and so invalid/unexpected input has one obvious,
 * tested fallback instead of silently rendering broken markup.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "warning";
export type ButtonSize = "sm" | "md" | "lg";

export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "outline",
  "danger",
  "warning",
];

export const BUTTON_SIZES: readonly ButtonSize[] = ["sm", "md", "lg"];

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-container focus-visible:ring-primary/30 disabled:bg-surface-container-high disabled:text-on-surface-variant disabled:hover:bg-surface-container-high",
  secondary:
    "bg-surface-container-lowest text-primary border border-outline-variant hover:bg-surface-container-low hover:border-outline focus-visible:ring-primary/30 disabled:bg-surface-container disabled:text-on-surface-variant disabled:border-outline-variant disabled:hover:bg-surface-container",
  ghost:
    "bg-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface focus-visible:ring-primary/30 disabled:text-on-surface-variant/50 disabled:hover:bg-transparent",
  outline:
    "bg-transparent text-primary border border-outline-variant hover:bg-surface-container-low hover:border-outline focus-visible:ring-primary/30 disabled:text-on-surface-variant disabled:border-outline-variant disabled:hover:bg-transparent",
  danger:
    "bg-error text-on-error hover:bg-error/90 focus-visible:ring-error/30 disabled:bg-error/20 disabled:text-error/40 disabled:hover:bg-error/20",
  warning:
    "bg-warning text-on-warning hover:bg-warning/90 focus-visible:ring-warning/30 disabled:bg-warning/20 disabled:text-warning/40 disabled:hover:bg-warning/20",
};

const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-label-sm rounded gap-1.5",
  md: "h-10 px-4 text-label-md rounded-md gap-2",
  lg: "h-12 px-6 text-body-md rounded-md gap-2.5",
};

const BUTTON_BASE_CLASSES =
  "inline-flex items-center justify-center font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:pointer-events-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

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

const BADGE_BASE_CLASSES =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label-sm font-medium";

const BADGE_STATUS_CLASSES: Record<BadgeStatus, string> = {
  success:
    "bg-success-container text-on-success-container ring-1 ring-success/15",
  warning:
    "bg-warning-container text-on-warning-container ring-1 ring-warning/15",
  error:
    "bg-error-container text-on-error-container ring-1 ring-error/15",
  info:
    "bg-info-container text-on-info-container ring-1 ring-info/15",
  neutral:
    "bg-surface-container-high text-on-surface-variant ring-1 ring-outline-variant/50",
};

/** Known status words -> semantic badge status, matched case-insensitively. */
const STATUS_WORD_MAP: Record<string, BadgeStatus> = {
  ready: "success",
  active: "success",
  current: "success",
  answered: "success",
  connected: "success",
  online: "success",
  resolved: "success",
  passed: "success",
  allowed: "success",
  clean: "success",
  processed: "success",

  processing: "warning",
  pending: "warning",
  degraded: "warning",
  uploaded: "warning",
  reviewing: "warning",

  failed: "error",
  refused: "error",
  error: "error",
  disconnected: "error",
  offline: "error",
  denied: "error",

  reviewed: "info",
  open: "info",
  inherited: "info",

  confidential: "error",
  "highly confidential": "error",
  restricted: "warning",

  read_only: "neutral",
  "read only": "neutral",
  stale: "neutral",
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

/* ---- Select, Checkbox, Modal, Alert class helpers ---- */

export const SELECT_CLASSES =
  "h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2373777d%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:20px] bg-[right_8px_center] bg-no-repeat pe-10";

export const CHECKBOX_CLASSES =
  "h-4 w-4 rounded border-outline-variant text-primary focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50";

export const MODAL_OVERLAY_CLASSES = "fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-2 sm:p-4";
export const MODAL_PANEL_CLASSES = "flex max-h-[calc(100vh-1rem)] w-full max-w-5xl flex-col rounded-2xl bg-surface-container-lowest shadow-modal sm:max-h-[calc(100vh-2rem)]";

export const ALERT_CLASSES: Record<string, string> = {
  error: "rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container",
  warning: "rounded-xl border border-warning/20 bg-warning-container p-4 text-on-warning-container",
  success: "rounded-xl border border-success/20 bg-success-container p-4 text-on-success-container",
  info: "rounded-xl border border-info/20 bg-info-container p-4 text-on-info-container",
};

export const FIELDSET_CLASSES = "rounded-xl border border-outline-variant/40 p-4 sm:p-5";
export const PROTECTED_FIELDSET_CLASSES = "rounded-xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5";
