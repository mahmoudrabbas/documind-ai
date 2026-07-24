import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ALERT_CLASSES } from "./variants";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "error" | "warning" | "success" | "info";
  title?: string;
  children: ReactNode;
}

/**
 * Inline alert with role="alert" for errors, role="status" for info.
 * Uses semantic color surfaces from the design token system.
 */
export function Alert({ variant = "info", title, children, className, ...props }: AlertProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(ALERT_CLASSES[variant], className)}
      {...props}
    >
      {title ? (
        <p className="mb-1 text-label-md font-semibold">{title}</p>
      ) : null}
      <div className="text-sm">{children}</div>
    </div>
  );
}
