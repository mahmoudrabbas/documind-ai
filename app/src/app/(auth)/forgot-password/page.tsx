"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { validateEmail } from "@/lib/validation";

type ForgotPasswordResponse = {
  success: boolean;
  message: string;
};

export default function ForgotPasswordPage() {
  const { t, dir } = useI18n();
  const submissionPending = useRef(false);

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  function validate() {
    const err = validateEmail(email);
    if (err) {
      setFieldError(t(err));
      return false;
    }
    setFieldError("");
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionPending.current) return;
    setError("");

    if (!validate()) return;

    submissionPending.current = true;
    setIsSubmitting(true);

    try {
      await apiClient<ForgotPasswordResponse>("/auth/forgot-password", {
        method: "POST",
        auth: false,
        credentials: "include",
        body: {
          email: email.trim().toLowerCase(),
        },
      });
      setIsSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("common.error"));
      }
    } finally {
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  }

  if (isSent) {
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("auth.forgotPasswordSuccess")}</h2>
              <p className="mt-3 text-sm text-slate-600">{t("auth.forgotPasswordEmailSent")}</p>
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
            <p className="text-sm font-semibold text-blue-600 w-full block">{t("auth.secureSignIn")}</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 w-full block">{t("auth.forgotPasswordTitle")}</h2>
            <p className="mt-2 text-sm text-slate-600 w-full block">{t("auth.forgotPasswordDescription")}</p>
          </div>

          <form className="mt-8 space-y-5 w-full" onSubmit={handleSubmit} noValidate>
            <div aria-live="polite" className="w-full">
              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 w-full" role="alert">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="w-full text-start">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                {t("auth.email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? "email-error" : undefined}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {fieldError ? (
                <p id="email-error" className="mt-1.5 text-xs text-red-600">{fieldError}</p>
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
              {isSubmitting ? t("auth.forgotPasswordSending") : t("auth.forgotPasswordSubmit")}
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