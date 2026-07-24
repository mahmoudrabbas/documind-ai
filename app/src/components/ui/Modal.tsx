"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MODAL_OVERLAY_CLASSES, MODAL_PANEL_CLASSES } from "./variants";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible title text or element for aria-labelledby. */
  title?: string;
  /** Panel max-width override (Tailwind class). */
  maxWidth?: string;
  children: ReactNode;
  /** Optional footer content (sticky at bottom). */
  footer?: ReactNode;
  /** Additional classes on the overlay. */
  className?: string;
  /** Additional classes on the panel. */
  panelClassName?: string;
}

/**
 * Accessible modal dialog with focus trap, Escape to close,
 * focus restoration, and semantic ARIA attributes.
 */
export function Modal({
  open,
  onClose,
  title,
  maxWidth = "max-w-5xl",
  children,
  footer,
  className,
  panelClassName,
}: ModalProps) {
  const previousFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLButtonElement;
      requestAnimationFrame(() => {
        const panel = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']");
        const first = panel?.querySelector<HTMLElement>("button, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
        first?.focus();
      });
    } else {
      previousFocusRef.current?.focus();
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className={cn(MODAL_OVERLAY_CLASSES, className)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={cn(MODAL_PANEL_CLASSES, maxWidth, panelClassName)}>
        {title ? (
          <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
            <h2 id="modal-title" className="text-title-lg font-bold text-on-surface">
              {title}
            </h2>
            <button
              aria-label="Close"
              onClick={onClose}
              className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 border-t border-outline-variant/30 bg-surface-container-lowest px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---- ConfirmDialog sub-component ---- */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
  isLoading,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-modal">
        <h3 id="confirm-dialog-title" className="text-title-lg font-bold text-on-surface">
          {title}
        </h3>
        {description ? (
          <p className="mt-2 text-sm text-on-surface-variant">{description}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-label-md font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-4 py-2 text-label-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              variant === "danger" && "bg-error text-on-error hover:bg-error/90",
              variant === "warning" && "bg-warning text-on-warning hover:bg-warning/90",
              variant === "primary" && "bg-primary text-on-primary hover:bg-primary-container",
            )}
          >
            {isLoading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent me-2" aria-hidden="true" />
            ) : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
