"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createBillingPortalSession,
  getSubscriptionStatus,
} from "@/services/billing.service";
import {
  CHECKOUT_SYNC_BACKOFF_MS,
  CHECKOUT_SYNC_WINDOW_MS,
  checkoutSyncPhase,
  type CheckoutSyncPhase,
} from "./checkout-sync";

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");
  const [phase, setPhase] = useState<CheckoutSyncPhase>("synchronizing");
  const [retryKey, setRetryKey] = useState(0);
  const [portalPending, setPortalPending] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setPhase("failed");
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let attempt = 0;
    setPhase("synchronizing");

    const poll = async () => {
      try {
        const response = await getSubscriptionStatus(controller.signal);
        const subscription = response.data;
        const nextPhase = checkoutSyncPhase(subscription, Date.now() - startedAt);
        if (nextPhase !== "synchronizing") { setPhase(nextPhase); return; }
      } catch {
        // A transient API failure uses the same bounded synchronization window.
      }

      if (controller.signal.aborted) return;
      if (Date.now() - startedAt >= CHECKOUT_SYNC_WINDOW_MS) {
        setPhase("pending");
        return;
      }
      const delay = CHECKOUT_SYNC_BACKOFF_MS[Math.min(attempt, CHECKOUT_SYNC_BACKOFF_MS.length - 1)];
      attempt += 1;
      timer = setTimeout(() => void poll(), delay);
    };

    void poll();
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
  const title = synchronizing
    ? "Payment completed"
    : phase === "active"
      ? "Your subscription is active!"
      : phase === "pending"
        ? "Synchronization pending"
        : "Unable to activate subscription";
  const message = synchronizing
    ? "Payment completed. Synchronizing your subscription."
    : phase === "active"
      ? "You can now use all the features of your plan."
      : phase === "pending"
        ? "Payment was received, but subscription synchronization is still pending."
        : sessionId
          ? "Stripe reported a subscription payment problem. You can retry synchronization or manage billing."
          : "No Stripe Checkout session was provided.";

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
          <button type="button" onClick={() => router.push("/dashboard")} className="min-h-11 rounded-xl bg-primary px-6 font-bold text-on-primary">
            Go to dashboard
          </button>
        ) : !synchronizing ? (
          <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="min-h-11 rounded-xl bg-primary px-6 font-bold text-on-primary">
            Retry
          </button>
        ) : null}
        {sessionId ? (
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
