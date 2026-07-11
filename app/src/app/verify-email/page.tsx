import { Suspense } from "react";

import VerifyEmailClient from "./verify-email-client";
import { AuthBrand, AuthPageShell } from "@/components/auth/auth-page-shell";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailShell message="Verifying your email..." />}>
      <VerifyEmailClient />
    </Suspense>
  );
}

function VerifyEmailShell({ message }: { message: string }) {
  return (
    <AuthPageShell labelledBy="verification-loading-title">
      <AuthBrand />
      <div
        className="mx-auto mt-7 h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"
        role="status"
        aria-label={message}
      />
      <h1
        id="verification-loading-title"
        className="mt-6 text-center text-2xl font-bold text-slate-950"
      >
        Verifying your email
      </h1>
      <p className="mt-3 text-center text-sm leading-6 text-slate-600">
        {message}
      </p>
    </AuthPageShell>
  );
}
