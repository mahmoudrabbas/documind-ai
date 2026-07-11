"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/lib/auth-tokens";
import { useI18n } from "@/providers/i18n-provider";
import { AuthHeroPanel, LanguageSwitcher } from "@/components/ui";
import { validateEmail, validateCompanySlug } from "@/lib/validation";

type LoginResponse = {
  success: true;
  data: {
    tokens: {
      accessToken: string;
    };
  };
};

type FormErrors = Partial<Record<"companySlug" | "email" | "password", string>>;

export default function LoginPage() {
  const router = useRouter();
  const { t, dir } = useI18n();
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    if (getAccessToken()) {
      router.replace("/dashboard");
      return;
    }

    async function checkSession() {
      try {
        const response = await apiClient<LoginResponse>("/auth/refresh", {
          method: "POST",
          auth: false,
          redirectOnAuthFailure: false,
        });

        setAccessToken(response.data.tokens.accessToken);
        router.replace("/dashboard");
      } catch {
        clearAccessToken();
        setIsCheckingSession(false);
      }
    }

    checkSession();
  }, [router]);

  const [companySlug, setCompanySlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isCheckingSession) {
    return (
      <main className="min-h-screen bg-white text-slate-950 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm shadow-slate-200/50">
          <p className="text-sm font-medium text-slate-500">
            Checking your session…
          </p>
        </div>
      </main>
    );
  }

  const trustItems = [
    {
      title: t("auth.tenantIsolationTitle"),
      description: t("auth.tenantIsolationDesc"),
    },
    {
      title: t("auth.verifiedAccessTitle"),
      description: t("auth.verifiedAccessDesc"),
    },
    {
      title: t("auth.privateAnswersTitle"),
      description: t("auth.privateAnswersDesc"),
    },
  ];

  function messageForError(error: unknown) {
    if (!(error instanceof ApiError)) {
      return t("auth.errorGeneric");
    }

    switch (error.code) {
      case "EMAIL_NOT_VERIFIED":
        return t("auth.errorEmailNotVerified");
      case "INVALID_CREDENTIALS":
        return t("auth.errorInvalidCredentials");
      case "ACCOUNT_NOT_ACTIVE":
        return t("auth.errorAccountNotActive");
      case "TENANT_NOT_ACTIVE":
        return t("auth.errorTenantNotActive");
      default:
        return t("auth.errorGeneric");
    }
  }

  function validate() {
    const nextErrors: FormErrors = {};

    const companySlugErr = validateCompanySlug(companySlug);
    if (companySlugErr) nextErrors.companySlug = t(companySlugErr);

    const emailErr = validateEmail(email);
    if (emailErr) nextErrors.email = t(emailErr);

    if (!password) {
      nextErrors.password = t("auth.passwordRequired");
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        auth: false,
        credentials: "include",
        body: {
          companySlug: companySlug.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          password,
        },
      });

      setAccessToken(response.data.tokens.accessToken);
      router.push("/dashboard");
    } catch (error) {
      setFormError(messageForError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main
      dir={dir}
      className="min-h-screen bg-white text-slate-950 flex flex-col lg:flex-row w-full overflow-x-hidden"
    >
      <AuthHeroPanel
        title={t("landing.heroTitle")}
        description={t("landing.heroDescription")}
      />

      {/* Right panel (White Form Panel) */}
      <section className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 bg-white min-h-[60vh] lg:min-h-screen relative">
        {/* Language switcher inside White Panel */}
        <div
          className={`absolute top-6 ${dir === "rtl" ? "left-6" : "right-6"} z-20 `}
        >
          <LanguageSwitcher />
        </div>

        <div className="max-w-md w-full min-w-[280px] sm:min-w-[400px]">
          <div className="text-start w-full">
            <p className="text-sm font-semibold text-blue-600 w-full block">
              {t("auth.secureSignIn")}
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 w-full block">
              {t("auth.signIn")}
            </h2>
            <p className="mt-2 text-sm text-slate-600 w-full block">
              {t("auth.accessWorkspace")}
            </p>
          </div>

          <form
            className="mt-8 space-y-5 w-full"
            onSubmit={handleSubmit}
            noValidate
          >
            <div aria-live="polite" className="w-full">
              {formError ? (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 w-full"
                  role="alert"
                >
                  {formError}
                </div>
              ) : null}
            </div>

            <div className="w-full text-start">
              <label
                htmlFor="companySlug"
                className="block text-sm font-medium text-slate-700"
              >
                {t("auth.companySlug")}
              </label>
              <input
                id="companySlug"
                name="companySlug"
                type="text"
                value={companySlug}
                onChange={(event) => setCompanySlug(event.target.value)}
                autoComplete="organization"
                placeholder={t("auth.companySlugPlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.companySlug)}
                aria-describedby={
                  errors.companySlug ? "companySlug-error" : "companySlug-help"
                }
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.companySlug ? (
                <p
                  id="companySlug-error"
                  className="mt-1.5 text-xs text-red-600"
                >
                  {errors.companySlug}
                </p>
              ) : (
                <p
                  id="companySlug-help"
                  className="mt-1.5 text-xs text-slate-500"
                >
                  {t("auth.companySlugHelp")}
                </p>
              )}
            </div>

            <div className="w-full text-start">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
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
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.email ? (
                <p id="email-error" className="mt-1.5 text-xs text-red-600">
                  {errors.email}
                </p>
              ) : null}
            </div>

            <div className="w-full text-start">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                {t("auth.password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder={t("auth.passwordPlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.password ? (
                <p id="password-error" className="mt-1.5 text-xs text-red-600">
                  {errors.password}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:text-white"
            >
              {isSubmitting ? (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden="true"
                />
              ) : null}
              {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
            </button>

            <div className="text-center mt-5">
              <Link
                href="/register"
                className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition"
              >
                {t("auth.registerNow")}
              </Link>
            </div>

            <p className="text-center text-xs leading-relaxed text-slate-500 mt-6">
              {t("auth.sessionNote")}
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
