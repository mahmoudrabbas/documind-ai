import { Suspense } from "react";

import SetPasswordFromInviteClient from "./set-password-from-invite-client";
import { AuthBrand, AuthPageShell } from "@/components/auth/auth-page-shell";

export default function SetPasswordFromInvitePage() {
  return (
    <Suspense
      fallback={<SetPasswordFromInviteShell message="Loading your invite..." />}
    >
      <SetPasswordFromInviteClient />
    </Suspense>
  );
}

function SetPasswordFromInviteShell({ message }: { message: string }) {
  return (
    <AuthPageShell labelledBy="invite-loading-title">
      <AuthBrand />
      <h1
        id="invite-loading-title"
        className="mt-6 text-center text-2xl font-bold text-slate-950"
      >
        Set up your account
      </h1>
      <p className="mt-3 text-center text-sm leading-6 text-slate-600">
        {message}
      </p>
      <div
        className="mx-auto mt-7 h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"
        role="status"
        aria-label={message}
      />
    </AuthPageShell>
  );
}
