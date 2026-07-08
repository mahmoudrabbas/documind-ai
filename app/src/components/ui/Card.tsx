import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * DESIGN.md > "Elevation & Depth":
   * - "flat"    Level 0 — lives directly on the page background, no shadow.
   * - "raised"  Level 1 — standard dashboard/card surface.
   * - "popover" Level 2 — dropdowns/popovers, more separation than a card.
   */
  elevation?: "flat" | "raised" | "popover";
}

const ELEVATION_CLASSES: Record<NonNullable<CardProps["elevation"]>, string> = {
  flat: "bg-transparent shadow-none",
  raised: "bg-surface-container-lowest shadow-card",
  popover: "bg-surface-container-lowest shadow-popover",
};

/** Base Card surface — see DESIGN.md > Shapes ("Card Radius: 12px"). */
export function Card({ elevation = "raised", className, children, ...props }: CardProps) {
  return (
    <div
      className={cn("rounded-lg", ELEVATION_CLASSES[elevation], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between p-md", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-title-lg text-on-surface", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-md pt-0", className)} {...props} />;
}
