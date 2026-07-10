import { Suspense } from "react";

import SetPasswordFromInviteClient from "./set-password-from-invite-client";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          DocuMind AI
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          Set your password
        </h1>
        <p className="mt-4 text-sm text-slate-600">{message}</p>
      </div>
    </main>
  );
}
