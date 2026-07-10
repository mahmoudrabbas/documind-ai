import { Suspense, type ReactNode } from 'react';
import { ProtectedRoute } from '@/components/auth/auth-guard';
import { AppNavigation } from '@/components/auth/app-navigation';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-50" aria-busy="true">Restoring your session…</main>}><ProtectedRoute><div className="min-h-screen bg-white"><AppNavigation />{children}</div></ProtectedRoute></Suspense>;
}
