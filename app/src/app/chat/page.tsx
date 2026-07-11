import { ProtectedRoute } from "@/components/auth/auth-guard";
import { Suspense } from "react";

export default function ChatPage() {
  return (
    <Suspense fallback={<main className="p-lg max-w-[1600px] mx-auto w-full flex-1" aria-busy="true"><div className="flex items-center gap-2 text-sm text-on-surface-variant p-12 justify-center"><span className="material-symbols-outlined animate-spin">progress_activity</span>Restoring your session...</div></main>}>
      <ProtectedRoute>
        <main className="p-lg max-w-[1600px] mx-auto w-full flex-1">
          <div className="mb-xl mt-6">
            <h1 className="text-headline-lg font-bold text-primary">Chat</h1>
            <p className="mt-2 text-body-md text-on-surface-variant">Ask DocuMind AI anything about your knowledge base.</p>
          </div>
          
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-xl flex flex-col items-center justify-center min-h-[400px] shadow-sm">
            <div className="w-20 h-20 bg-primary-container rounded-full flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-[40px] text-on-primary-container">forum</span>
            </div>
            <h2 className="text-title-lg font-bold text-primary mb-2">AI Chat Coming Soon</h2>
            <p className="text-body-md text-on-surface-variant max-w-md text-center">
              The unified conversational interface for interacting with your enterprise document knowledge base is currently under construction.
            </p>
          </div>
        </main>
      </ProtectedRoute>
    </Suspense>
  );
}
