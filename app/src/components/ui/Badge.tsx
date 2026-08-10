import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getBadgeClasses, resolveBadgeStatus, type BadgeStatus } from "./variants";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * Either an explicit semantic status ("success" | "warning" | "error" |
   * "info" | "neutral"), or a free-text label as it comes back from the
   * API/documents (e.g. "Ready", "Processing", "Failed"). Free text is
   * matched case-insensitively against known status words; anything
   * unrecognized renders as a neutral pill instead of throwing.
   *
   * This value drives the pill *colour*. It is matched against machine
   * status words, so it must stay untranslated — pass the visible text
   * via `label` instead.
   */
  status?: BadgeStatus | string;
  /** Optional leading icon (Material Symbol name). */
  icon?: string;
  /**
   * Visible text, kept separate from `status` so a translated label can
   * never change which colour the pill resolves to. When omitted the
   * pill falls back to `children`, then to `status` itself — so any
   * localized badge should always pass this.
   */
  label?: ReactNode;
}

/** Status pill — see DESIGN.md > Components > "Tables & Data > Status Badges". */
export function Badge({ status = "neutral", icon, label, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(getBadgeClasses(status), className)} {...props}>
      {icon ? (
        <span className="material-symbols-outlined me-0.5 align-middle text-[14px]" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {label ?? children ?? status}
    </span>
  );
}

/** Re-exported so consumers can pre-compute a status without another import. */
export { resolveBadgeStatus };
