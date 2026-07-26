import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { SELECT_CLASSES } from "./variants";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  /** Shown below the field in the error color; also sets aria-invalid. */
  errorMessage?: string;
  /** Shown below the field when there is no error. */
  helperText?: string;
  /** Options to render. Each item must have value and label. */
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  /** Placeholder shown when value is empty. */
  placeholder?: string;
}

/**
 * Styled <select> that matches the DocuMind enterprise design system.
 * Includes a custom chevron, consistent height, and proper error/helper text.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, errorMessage, helperText, options, placeholder, className, id, value, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const hasError = Boolean(errorMessage);

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label htmlFor={selectId} className="text-label-md text-on-surface-variant">
            {label}
          </label>
        ) : null}
        <select
          ref={ref}
          id={selectId}
          value={value}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError || helperText ? `${selectId}-description` : undefined}
          className={cn(
            SELECT_CLASSES,
            hasError && "border-error focus:ring-error/30 focus:border-error",
            className,
          )}
          {...props}
        >
          {placeholder ? (
            <option value="">{placeholder}</option>
          ) : null}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {hasError ? (
          <p id={`${selectId}-description`} className="text-body-sm text-error">
            {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${selectId}-description`} className="text-body-sm text-on-surface-variant">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

Select.displayName = "Select";
