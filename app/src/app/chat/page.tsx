import { ProtectedRoute } from "@/components/auth/auth-guard";
import { Suspense } from "react";

export default function ChatPage() {
  return (
    <Suspense fallback={<main className="p-6" aria-busy="true">Restoring your session…</main>}><ProtectedRoute>
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Chat</h1>
      <p className="mt-2 text-sm text-slate-600">Chat experience coming soon.</p>
    </main>
    </ProtectedRoute></Suspense>
  );
}
