import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Loading placeholder — used for processing/pending states (documents, chat, uploads). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-container-high", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
