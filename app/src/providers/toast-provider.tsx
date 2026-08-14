"use client";

/**
 * ToastProvider — lightweight toast state for the app.
 *
 * Holds a bounded stack of toasts (oldest are dropped when the cap is hit),
 * auto-dismisses each toast after its duration, and exposes `toast()` /
 * `dismiss()` / `dismissAll()` via `useToasts()`. Rendering is delegated to
 * the <Toaster /> viewport (components/ui/Toaster.tsx), so the provider is
 * purely state — no DOM.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  variant?: ToastVariant;
  title: string;
  description?: string;
  /** Auto-dismiss delay in ms. 0 (or negative) keeps the toast until dismissed. */
  durationMs?: number;
  /** Optional action label; renders as a button next to the toast body. */
  actionLabel?: string;
  /** Invoked when the action button is clicked. */
  onAction?: () => void;
}

export interface Toast extends Omit<ToastOptions, "durationMs"> {
  id: string;
  variant: ToastVariant;
  createdAt: number;
  durationMs: number;
  /** True once dismiss was requested — the card plays its exit animation before removal. */
  exiting: boolean;
}

export interface ToastContextValue {
  toasts: Toast[];
  /** Push a toast and return its id (for programmatic dismissal). */
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 8_000;
const MAX_VISIBLE_TOASTS = 4;
/** Must match the `toast-out` animation duration in globals.css. */
export const EXIT_ANIMATION_MS = 220;

function createToastId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const exitingRef = useRef(new Set<string>());
  const toastsRef = useRef<Toast[]>([]);

  // Mirror the rendered list so dismissAll() can iterate ids without stale closures.
  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const dismiss = useCallback((id: string) => {
    if (exitingRef.current.has(id)) return;
    exitingRef.current.add(id);
    setToasts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, exiting: true } : item)),
    );
    // Cancel the pending auto-dismiss; it will be re-armed as a removal timer.
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    timersRef.current.set(
      id,
      setTimeout(() => {
        exitingRef.current.delete(id);
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, EXIT_ANIMATION_MS),
    );
  }, []);

  const toast = useCallback(
    (options: ToastOptions): string => {
      const id = createToastId();
      const item: Toast = {
        id,
        variant: options.variant ?? "info",
        title: options.title,
        description: options.description,
        durationMs: options.durationMs ?? DEFAULT_DURATION_MS,
        actionLabel: options.actionLabel,
        onAction: options.onAction,
        createdAt: Date.now(),
        exiting: false,
      };
      setToasts((prev) => [...prev, item].slice(-MAX_VISIBLE_TOASTS));
      if (item.durationMs > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), item.durationMs),
        );
      }
      return id;
    },
    [dismiss],
  );

  const dismissAll = useCallback(() => {
    for (const item of toastsRef.current) {
      dismiss(item.id);
    }
  }, [dismiss]);

  // Clear every pending timer when the provider unmounts (no leaked timers).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, toast, dismiss, dismissAll }),
    [toasts, toast, dismiss, dismissAll],
  );

  return <ToastContext value={value}>{children}</ToastContext>;
}

export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToasts must be used within a <ToastProvider>.");
  }
  return ctx;
}
