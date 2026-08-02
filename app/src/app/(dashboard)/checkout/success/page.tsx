"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createBillingPortalSession,
  getSubscriptionStatus,
  synchronizeCheckoutSession,
} from "@/services/billing.service";
import { ApiError } from "@/lib/api-client";
import {
  CHECKOUT_SYNC_BACKOFF_MS,
  CHECKOUT_SYNC_WINDOW_MS,
  checkoutSyncPhase,
  checkoutSyncErrorPhase,
  isValidCheckoutSessionId,
  type CheckoutSyncPhase,
} from "./checkout-sync";

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");
  const [phase, setPhase] = useState<CheckoutSyncPhase>("synchronizing");
  const [retryKey, setRetryKey] = useState(0);
  const [portalPending, setPortalPending] = useState(false);
  const [packageName, setPackageName] = useState<string | null>(null);
  const [manageBillingAvailable, setManageBillingAvailable] = useState(false);

  useEffect(() => {
    if (!isValidCheckoutSessionId(sessionId)) {
      setPhase("invalid-session");
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let attempt = 0;
    setPhase("synchronizing");
    let terminalSyncFailure: CheckoutSyncPhase | null = null;

    const poll = async () => {
      try {
        const response = await getSubscriptionStatus(controller.signal);
        const subscription = response.data;
        setManageBillingAvailable(subscription.canOpenPortal);
        setPackageName(subscription.packageId?.name ?? null);
        const nextPhase = checkoutSyncPhase(subscription, Date.now() - startedAt);
        if (nextPhase !== "synchronizing") { setPhase(nextPhase); return; }
      } catch {
        // A transient API failure uses the same bounded synchronization window.
      }

      if (controller.signal.aborted) return;
      if (Date.now() - startedAt >= CHECKOUT_SYNC_WINDOW_MS) {
        setPhase(terminalSyncFailure ?? "pending");
        return;
      }
      const delay = CHECKOUT_SYNC_BACKOFF_MS[Math.min(attempt, CHECKOUT_SYNC_BACKOFF_MS.length - 1)];
      attempt += 1;
      timer = setTimeout(() => void poll(), delay);
    };

    const synchronizeThenPoll = async () => {
      try {
        await synchronizeCheckoutSession(sessionId, controller.signal);
      } catch (error) {
        const mapped = checkoutSyncErrorPhase(error instanceof ApiError ? error.code : null);
        if (mapped === "session-not-found" || mapped === "payment-incomplete") {
          setPhase(mapped);
          return;
        }
        terminalSyncFailure = mapped;
      }
      await poll();
    };

    void synchronizeThenPoll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [retryKey, sessionId]);

  const manageBilling = useCallback(async () => {
    setPortalPending(true);
    try {
      const response = await createBillingPortalSession();
      if (response.data.url) window.location.href = response.data.url;
    } finally {
      setPortalPending(false);
    }
  }, []);

  const synchronizing = phase === "synchronizing";
  const retryable = ["pending", "provider-unavailable", "payment-incomplete"].includes(phase);
  const title = synchronizing
    ? "Payment completed"
    : phase === "active"
      ? "Your subscription is active!"
      : phase === "pending"
        ? "Synchronization pending"
        : phase === "provider-unavailable"
          ? "Provider temporarily unavailable"
          : phase === "payment-incomplete"
            ? "Payment incomplete"
            : "Checkout session unavailable";
  const message = synchronizing
    ? "Payment completed. Synchronizing your subscription."
    : phase === "active"
      ? `${packageName ? `${packageName} is synchronized. ` : ""}You can now use all the features of your plan.`
      : phase === "pending"
        ? "Payment was received, but subscription synchronization is still pending."
        : phase === "provider-unavailable"
          ? "Stripe is temporarily unavailable. Your completed payment has not been marked as failed; retry synchronization shortly."
          : phase === "payment-incomplete"
            ? "Stripe has not confirmed a completed payment for this Checkout Session."
            : phase === "session-not-found"
              ? "This Checkout Session is not available for your company."
              : "The Checkout Session ID is missing or invalid.";

  return (
    <div className="max-w-md rounded-2xl bg-surface p-8 text-center shadow-lg">
      {synchronizing ? (
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      ) : (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-2xl">
          {phase === "active" ? "✓" : "!"}
        </div>
      )}
      <h1 className="mt-6 text-title-lg font-bold text-on-surface">{title}</h1>
      <p className="mt-2 text-on-surface-variant" aria-live="polite">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {phase === "active" ? (
          <button type="button" onClick={() => router.push("/checkout")} className="min-h-11 rounded-xl bg-primary px-6 font-bold text-on-primary">
            View Billing
          </button>
        ) : retryable ? (
          <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="min-h-11 rounded-xl bg-primary px-6 font-bold text-on-primary">
            Retry
          </button>
        ) : null}
        {manageBillingAvailable ? (
          <button type="button" disabled={portalPending} onClick={() => void manageBilling()} className="min-h-11 rounded-xl border border-outline px-6 font-bold disabled:opacity-50">
            {portalPending ? "Opening…" : "Manage Billing"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={<div className="max-w-md rounded-2xl bg-surface p-8 text-center shadow-lg">Loading payment details…</div>}>
        <CheckoutSuccessContent />
      </Suspense>
    </div>
  );
}
