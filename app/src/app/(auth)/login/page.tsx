"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { useAuth, type AuthTenant, type AuthUser } from "@/providers/auth-provider";
import { getSafeReturnTo } from "@/lib/safe-return-to";
import { getRoleHome } from "@/lib/role-home";
import { useI18n } from "@/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { validateEmail, validateCompanySlug } from "@/lib/validation";

type LoginResponse = {
  success: true;
  data: {
    tokens: {
      accessToken: string;
    };
    user: AuthUser;
    tenant: AuthTenant;
  };
};

type FormErrors = Partial<Record<"companySlug" | "email" | "password", string>>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { establishSession } = useAuth();
  const submissionPending = useRef(false);
  const { t, dir } = useI18n();

  const [companySlug, setCompanySlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (submissionPending.current) return;
    setFormError("");

    if (!validate()) {
      return;
    }

    submissionPending.current = true;
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

      establishSession(response.data.tokens.accessToken, {
        user: response.data.user,
        tenant: response.data.tenant,
      });
      const destination = getSafeReturnTo(searchParams.get("returnTo")) ?? getRoleHome(response.data.user.role);
      router.replace(destination);
      router.refresh();
    } catch (error) {
      setFormError(messageForError(error));
    } finally {
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main dir={dir} className="min-h-screen bg-white text-slate-950 flex flex-col lg:flex-row w-full overflow-x-hidden">
      {/* Left panel (Navy Info Panel) */}
      <section className="bg-[#001524] text-white w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 min-h-[40vh] lg:min-h-screen relative overflow-hidden">
        {/* Subtle radial glow effect */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08)_0%,transparent_70%)] pointer-events-none" />

        <div className="max-w-md w-full min-w-[280px] sm:min-w-[400px] flex flex-col items-center relative z-10">
          {/* Logo element centered */}
          <div className="flex flex-col items-center gap-2">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20"
              aria-hidden="true"
            >
              DM
            </span>
            <p className="text-xl font-bold tracking-tight text-white mt-2">
              {t("landing.appName")}
            </p>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
              {t("landing.tagline")}
            </p>
          </div>

          <h1 className="mt-8 text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white text-center w-full block">
            {t("landing.heroTitle")}
          </h1>

          <p className="mt-4 text-sm leading-relaxed text-slate-300 text-center w-full max-w-sm block">
            {t("landing.heroDescription")}
          </p>

          {/* Trust cards */}
          <div className="mt-10 grid grid-cols-1 gap-3 w-full">
            {trustItems.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 flex gap-3.5 items-start backdrop-blur-sm text-start"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-400"
                  aria-hidden="true"
                >
                  ✓
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 leading-normal">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Right panel (White Form Panel) */}
      <section className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 bg-white min-h-[60vh] lg:min-h-screen relative">
        {/* Language switcher inside White Panel */}
        <div className={`absolute top-6 ${dir === "rtl" ? "left-6" : "right-6"} z-20 `}>
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

          <form className="mt-8 space-y-5 w-full" onSubmit={handleSubmit} noValidate>
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
                  errors.companySlug
                    ? "companySlug-error"
                    : "companySlug-help"
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
                <p
                  id="email-error"
                  className="mt-1.5 text-xs text-red-600"
                >
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
                <p
                  id="password-error"
                  className="mt-1.5 text-xs text-red-600"
                >
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
