"use client";

import { useRouter } from "next/navigation";

export default function CheckoutCancelPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md rounded-2xl bg-surface p-8 text-center shadow-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-2xl text-on-surface-variant">
          ←
        </div>
        <h1 className="mt-6 text-title-lg font-bold text-on-surface">
          Checkout canceled
        </h1>
        <p className="mt-2 text-on-surface-variant">
          You have canceled the checkout process. No charges were made.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => router.push("/checkout")}
            className="min-h-11 rounded-xl bg-primary px-6 font-bold text-on-primary"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="min-h-11 rounded-xl border border-outline-variant bg-surface px-6 font-bold text-on-surface"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
