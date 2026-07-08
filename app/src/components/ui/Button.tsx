import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { getButtonClasses, type ButtonSize, type ButtonVariant } from "./variants";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a small spinner and disables the button, without shifting layout. */
  isLoading?: boolean;
}

/**
 * Base Button — see DESIGN.md > Components > "Buttons & Controls".
 *
 * variant="primary"   Navy background, white text (default actions)
 * variant="secondary" Accent teal, white text ("Ask AI" / AI-specific actions)
 * variant="ghost"     Transparent, navy text (secondary header actions)
 * variant="outline"   Transparent with an outline border
 * variant="danger"    Destructive actions (delete, revoke)
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", isLoading = false, disabled, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(getButtonClasses(variant, size), className)}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading ? (
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
