import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Shown below the field in the error color; also sets aria-invalid. */
  errorMessage?: string;
  /** Shown below the field when there is no error. */
  helperText?: string;
}

/** Base text Input — see DESIGN.md > Shapes ("Base Radius: 8px for ... input fields"). */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, errorMessage, helperText, className, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hasError = Boolean(errorMessage);

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-label-md text-on-surface-variant">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError || helperText ? `${inputId}-description` : undefined}
          className={cn(
            "h-10 w-full rounded-md border bg-surface-container-lowest px-3 text-body-md text-on-surface",
            "placeholder:text-outline",
            "disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-outline",
            hasError ? "border-error" : "border-outline-variant",
            className,
          )}
          {...props}
        />
        {hasError ? (
          <p id={`${inputId}-description`} className="text-body-sm text-error">
            {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-description`} className="text-body-sm text-on-surface-variant">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";
