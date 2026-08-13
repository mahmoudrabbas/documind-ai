"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { clearAccessToken } from "@/lib/auth-tokens";
import { useI18n } from "@/providers/i18n-provider";

export default function LogoutPage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    async function logout() {
      try {
        await apiClient("/auth/logout", {
          method: "POST",
          auth: false,
          redirectOnAuthFailure: false,
        });
      } catch {
        // Continue redirect even if logout API fails.
      } finally {
        clearAccessToken();
        router.replace("/login");
      }
    }

    logout();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm shadow-slate-200/50">
        <p className="text-sm font-medium text-slate-500">
          {t("auth.signingOut")}
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">
          {t("auth.redirectingToLogin")}
        </h1>
      </div>
    </main>
  );
}
