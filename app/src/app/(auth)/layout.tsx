import type { ReactNode } from 'react';
import { GuestOnly } from '@/components/auth/auth-guard';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <GuestOnly><div className="min-h-screen bg-slate-50">{children}</div></GuestOnly>;
}
