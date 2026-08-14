"use client";

import { useI18n } from "@/providers/i18n-provider";
import { useToasts, type Toast, type ToastVariant } from "@/providers/toast-provider";

interface VariantMeta {
  icon: string;
  iconClass: string;
}

const VARIANT_META: Record<ToastVariant, VariantMeta> = {
  info: { icon: "info", iconClass: "text-info" },
  success: { icon: "check_circle", iconClass: "text-success" },
  warning: { icon: "warning", iconClass: "text-warning" },
  error: { icon: "error", iconClass: "text-error" },
};

function ToastCard({
  toast,
  onDismiss,
  dismissLabel,
}: {
  toast: Toast;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  const meta = VARIANT_META[toast.variant];
  const isAlert = toast.variant === "error" || toast.variant === "warning";

  return (
    <div
      role={isAlert ? "alert" : "status"}
      data-testid={`toast-${toast.variant}`}
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-bright p-4 shadow-card ${
        toast.exiting ? "animate-toast-out" : "animate-toast-in"
      }`}
    >
      <span
        aria-hidden="true"
        className={`material-symbols-outlined mt-0.5 shrink-0 text-[20px] ${meta.iconClass}`}
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-label-md font-bold text-on-surface">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            {toast.description}
          </p>
        ) : null}
        {toast.actionLabel && toast.onAction ? (
          <button
            type="button"
            onClick={toast.onAction}
            className="mt-2 text-label-sm font-semibold text-primary hover:underline"
          >
            {toast.actionLabel}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="shrink-0 rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
          close
        </span>
      </button>
    </div>
  );
}

/**
 * Toaster — fixed bottom-end viewport that renders the toast stack from the
 * ToastProvider. Mounted once (root layout); add toasts via `useToasts().toast()`.
 */
export function Toaster() {
  const { toasts, dismiss } = useToasts();
  const { t } = useI18n();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={() => dismiss(toast.id)}
          dismissLabel={t("toasts.dismiss")}
        />
      ))}
    </div>
  );
}
