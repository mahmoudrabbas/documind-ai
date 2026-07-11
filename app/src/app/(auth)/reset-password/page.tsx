"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

type ResetPasswordResponse = {
  success: boolean;
  message: string;
};

type FormErrors = Partial<Record<"password" | "confirmPassword", string>>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { t, dir } = useI18n();
  const submissionPending = useRef(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!token) {
    return (
      <main dir={dir} className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-slate-900">{t("common.error")}</h2>
          <p className="mt-2 text-sm text-slate-600">Missing or invalid reset token.</p>
          <div className="mt-6">
            <Link href="/forgot-password" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition">
              {t("auth.forgotPassword")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  function validate() {
    const next: FormErrors = {};
    if (!password || password.length < 8) {
      next.password = t("auth.passwordInvalid");
    } else if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(password)) {
      next.password = t("auth.passwordInvalid");
    }
    if (!confirmPassword) {
      next.confirmPassword = t("auth.confirmPasswordRequired");
    } else if (password !== confirmPassword) {
      next.confirmPassword = t("auth.passwordsMustMatch");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionPending.current) return;
    setFormError("");

    if (!validate()) return;

    submissionPending.current = true;
    setIsSubmitting(true);

    try {
      await apiClient<ResetPasswordResponse>("/auth/reset-password", {
        method: "POST",
        auth: false,
        credentials: "include",
        body: { token, password },
      });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError(t("common.error"));
      }
    } finally {
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <main
        dir={dir}
        className="min-h-screen bg-white text-slate-950 flex flex-col lg:flex-row w-full overflow-x-hidden"
      >
        <section className="bg-[#001524] text-white w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 min-h-[40vh] lg:min-h-screen relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08)_0%,transparent_70%)] pointer-events-none" />
          <div className="max-w-md w-full min-w-[280px] sm:min-w-[400px] flex flex-col items-center relative z-10">
            <div className="flex flex-col items-center gap-2">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20" aria-hidden="true">DM</span>
              <p className="text-xl font-bold tracking-tight text-white mt-2">{t("landing.appName")}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">{t("landing.tagline")}</p>
            </div>
          </div>
        </section>
        <section className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 bg-white min-h-[60vh] lg:min-h-screen relative">
          <div className={`absolute top-6 ${dir === "rtl" ? "left-6" : "right-6"} z-20`}>
            <LanguageSwitcher />
          </div>
          <div className="max-w-md w-full min-w-[280px] sm:min-w-[400px]">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mb-4">
                <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("auth.resetPasswordSuccess")}</h2>
              <div className="mt-8">
                <Link href="/login" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition">{t("auth.backToLogin")}</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      dir={dir}
      className="min-h-screen bg-white text-slate-950 flex flex-col lg:flex-row w-full overflow-x-hidden"
    >
      <section className="bg-[#001524] text-white w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 min-h-[40vh] lg:min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08)_0%,transparent_70%)] pointer-events-none" />
        <div className="max-w-md w-full min-w-[280px] sm:min-w-[400px] flex flex-col items-center relative z-10">
          <div className="flex flex-col items-center gap-2">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20" aria-hidden="true">DM</span>
            <p className="text-xl font-bold tracking-tight text-white mt-2">{t("landing.appName")}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">{t("landing.tagline")}</p>
          </div>
        </div>
      </section>
      <section className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 bg-white min-h-[60vh] lg:min-h-screen relative">
        <div className={`absolute top-6 ${dir === "rtl" ? "left-6" : "right-6"} z-20`}>
          <LanguageSwitcher />
        </div>
        <div className="max-w-md w-full min-w-[280px] sm:min-w-[400px]">
          <div className="text-start w-full">
            <p className="text-sm font-semibold text-blue-600 w-full block">{t("auth.resetPasswordSecure")}</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 w-full block">{t("auth.resetPasswordTitle")}</h2>
          </div>

          <form className="mt-8 space-y-5 w-full" onSubmit={handleSubmit} noValidate>
            <div aria-live="polite" className="w-full">
              {formError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 w-full" role="alert">
                  {formError}
                </div>
              ) : null}
            </div>

            <div className="w-full text-start">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                {t("auth.password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder={t("auth.passwordPlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "password-error" : undefined}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.password ? (
                <p id="password-error" className="mt-1.5 text-xs text-red-600">{errors.password}</p>
              ) : null}
            </div>

            <div className="w-full text-start">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                {t("auth.confirmPassword")}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                placeholder={t("auth.confirmPasswordPlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? "confirm-error" : undefined}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.confirmPassword ? (
                <p id="confirm-error" className="mt-1.5 text-xs text-red-600">{errors.confirmPassword}</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:text-white"
            >
              {isSubmitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
              ) : null}
              {isSubmitting ? t("auth.resettingPassword") : t("auth.resetPasswordSubmit")}
            </button>

            <div className="text-center mt-5">
              <Link href="/login" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition">
                {t("auth.backToLogin")}
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}