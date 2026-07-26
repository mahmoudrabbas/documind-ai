import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { CHECKBOX_CLASSES } from "./variants";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: string;
}

/**
 * Styled checkbox with a visible label. The entire label area is clickable.
 * Focus-visible ring and proper sizing for WCAG AA click targets.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, id, disabled, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id ?? generatedId;

    return (
      <label
        htmlFor={checkboxId}
        className={cn(
          "inline-flex items-start gap-2.5 cursor-pointer select-none rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-surface-container-low",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          id={checkboxId}
          disabled={disabled}
          className={cn(CHECKBOX_CLASSES, "mt-0.5 shrink-0", className)}
          {...props}
        />
        {label ? (
          <span className="text-body-sm text-on-surface leading-snug">{label}</span>
        ) : null}
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
