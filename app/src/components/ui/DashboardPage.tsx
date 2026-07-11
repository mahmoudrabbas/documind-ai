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
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
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
