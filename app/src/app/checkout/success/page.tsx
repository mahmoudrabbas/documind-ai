"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getSubscriptionStatus } from "@/services/billing.service";

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<{
    phase: "pending" | "active" | "error";
    message: string;
  }>({ phase: "pending", message: "Verifying payment…" });

  useEffect(() => {
    if (!sessionId) {
      setStatus({
        phase: "error",
        message: "No session ID provided. Please contact support.",
      });
      return;
    }

    let attempts = 0;
    const maxAttempts = 15;

    const poll = () => {
      getSubscriptionStatus()
        .then((res) => {
          const sub = res.data;
          if (sub.status === "ACTIVE" || sub.status === "INCOMPLETE") {
            setStatus({
              phase: "active",
              message: "Your subscription is active!",
            });
          } else if (attempts < maxAttempts) {
            attempts++;
            setStatus({
              phase: "pending",
              message: `Payment confirmed. Activating subscription… (${attempts}/${maxAttempts})`,
            });
            setTimeout(poll, 2000);
          } else {
            setStatus({
              phase: "error",
              message:
                "Your payment was received but the subscription is still pending. This may take a few minutes.",
            });
          }
        })
        .catch(() => {
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(poll, 2000);
          } else {
            setStatus({
              phase: "error",
              message:
                "Unable to verify subscription status. Please contact support.",
            });
          }
        });
    };

    const timer = setTimeout(poll, 1000);
    return () => clearTimeout(timer);
  }, [sessionId]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md rounded-2xl bg-surface p-8 text-center shadow-lg">
        {status.phase === "pending" ? (
          <>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <h1 className="mt-6 text-title-lg font-bold text-on-surface">
              Processing payment
            </h1>
            <p className="mt-2 text-on-surface-variant" aria-live="polite">
              {status.message}
            </p>
          </>
        ) : status.phase === "active" ? (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-container text-2xl text-on-tertiary-container">
              ✓
            </div>
            <h1 className="mt-6 text-title-lg font-bold text-on-surface">
              {status.message}
            </h1>
            <p className="mt-2 text-on-surface-variant">
              You can now use all the features of your plan.
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="mt-6 min-h-11 rounded-xl bg-primary px-6 font-bold text-on-primary"
            >
              Go to dashboard
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error-container text-2xl text-on-error-container">
              !
            </div>
            <h1 className="mt-6 text-title-lg font-bold text-on-surface">
              Something went wrong
            </h1>
            <p className="mt-2 text-on-surface-variant">{status.message}</p>
            <button
              type="button"
              onClick={() => router.push("/checkout")}
              className="mt-6 min-h-11 rounded-xl bg-primary px-6 font-bold text-on-primary"
            >
              Back to checkout
            </button>
          </>
        )}
      </div>
    </div>
  );
}
