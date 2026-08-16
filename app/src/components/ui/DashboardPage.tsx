import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DashboardPage({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col px-4 py-6 sm:px-5 lg:px-8 lg:py-8 2xl:px-10",
        className,
      )}
      {...props}
    />
  );
}

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  guideId,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Optional `data-guide-id` anchor for the copilot guide overlay. */
  guideId?: string;
}) {
  return (
    <header
      data-guide-id={guideId}
      className={cn(
        "mb-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow}
        <h1
          className={cn(
            "text-headline-lg-mobile font-bold text-primary sm:text-headline-lg",
            eyebrow && "mt-3",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-body-md leading-relaxed text-on-surface-variant sm:mt-2">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="w-full shrink-0 lg:w-auto">{actions}</div>
      ) : null}
    </header>
  );
}

type DashboardPanelProps = HTMLAttributes<HTMLElement> & {
  padding?: "none" | "compact" | "default";
  tone?: "default" | "muted";
};

export function DashboardPanel({
  padding = "default",
  tone = "default",
  className,
  ...props
}: DashboardPanelProps) {
  return (
    <section
      className={cn(
        "min-h-0 min-w-0 rounded-3xl border border-outline-variant/30 shadow-sm",
        tone === "default"
          ? "bg-surface-container-lowest"
          : "bg-surface-container",
        padding === "compact" && "p-4 lg:p-5",
        padding === "default" && "p-4 sm:p-5",
        padding === "none" && "overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Heading row for the top of a `DashboardPanel`.
 *
 * Panels used to each hand-roll this row, which is how the overview ended up
 * with three headings at three different sizes. Everything nested in a panel
 * shares one treatment here; page-level titles stay with
 * `DashboardPageHeader`.
 */
export function DashboardPanelHeader({
  icon,
  title,
  action,
  className,
  as: Heading = "h2",
}: {
  /** Material Symbols glyph name, rendered decoratively before the title. */
  icon?: string;
  title: ReactNode;
  /** Trailing slot — a "view all" link, a filter, a count. */
  action?: ReactNode;
  className?: string;
  /** Heading level. Panels sit directly under the page `h1`, hence the `h2`
      default; override where a panel nests inside another section. */
  as?: "h2" | "h3" | "h4";
}) {
  return (
    <div
      className={cn(
        "mb-4 flex min-w-0 items-center justify-between gap-3",
        className,
      )}
    >
      <Heading className="flex min-w-0 items-center gap-2 text-title-md text-primary">
        {icon ? (
          <span
            aria-hidden="true"
            className="material-symbols-outlined shrink-0 text-[20px]"
          >
            {icon}
          </span>
        ) : null}
        <span className="truncate">{title}</span>
      </Heading>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
