import { Suspense } from "react";

import VerifyEmailClient from "./verify-email-client";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailShell message="Verifying your email..." />}>
      <VerifyEmailClient />
    </Suspense>
  );
}

function VerifyEmailShell({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-8 text-slate-950">
      <div className="w-full min-w-0 max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/70 sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20">
          DM
        </div>
        <p className="mt-4 whitespace-normal text-lg font-bold tracking-tight text-slate-950">
          DocuMind AI
        </p>
        <p className="mt-2 inline-flex max-w-full items-center justify-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-center text-xs font-semibold text-blue-700">
          Email verification
        </p>
        <div
          className="mx-auto mt-8 h-14 w-14 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"
          role="status"
          aria-label={message}
        />
        <h1 className="mt-6 whitespace-normal text-2xl font-bold leading-7 tracking-tight text-slate-950">
          Verifying your email...
        </h1>
        <p className="mt-3 whitespace-normal break-words text-sm leading-6 text-slate-600">
          {message}
        </p>
      </div>
    </main>
  );
}
