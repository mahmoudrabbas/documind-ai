import { useState } from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps {
  src?: string | null;
  /** Full display name, used both for alt text and the initials fallback. */
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-8 w-8 text-label-sm",
  md: "h-10 w-10 text-label-md",
  lg: "h-14 w-14 text-title-lg",
};

/** Derives up to two initials from a name. Falls back to "?" for empty/invalid input. */
export function getInitials(name: string | undefined | null): string {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return "?";
  }

  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");

  return initials.join("") || "?";
}

/**
 * User avatar with an automatic initials fallback — never renders a
 * broken image icon for a missing or failed `src`.
 */
export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(src) && !imageFailed;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary-container font-medium text-on-secondary-container",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are user-configured and retain an error fallback
        <img
          src={src ?? undefined}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </span>
  );
}
