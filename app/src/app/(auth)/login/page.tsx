"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import {
  useAuth,
  type AuthTenant,
  type AuthUser,
} from "@/providers/auth-provider";
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
      const destination =
        getSafeReturnTo(searchParams.get("returnTo")) ??
        getRoleHome(response.data.user.role);
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
    <main
      dir={dir}
      className="flex min-h-screen w-full flex-row overflow-x-hidden bg-surface-container-lowest"
    >
      {/* Left panel (Form Panel) */}
      <section className="z-10 flex h-full w-full flex-col p-lg shadow-xl md:p-xl lg:w-[480px] lg:p-2xl xl:w-[560px]">
        {/* Language switcher */}
        <div className="absolute top-6 right-6 z-20">
          <LanguageSwitcher />
        </div>

        {/* Brand Header */}
        <div className="mb-12">
          <div className="mb-sm flex items-center gap-base">
            <span
              className="material-symbols-outlined text-3xl text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              neurology
            </span>
            <h1 className="text-headline-md font-bold tracking-tight text-primary">
              DocuMind AI
            </h1>
          </div>
          <p className="max-w-sm text-body-md text-on-surface-variant">
            Private AI Knowledge Assistant for Company Documents
          </p>
        </div>

        {/* Login Form */}
        <div className="flex flex-grow flex-col justify-center">
          <h2 className="mb-base text-headline-lg font-bold text-primary">
            Welcome Back
          </h2>
          <p className="mb-xl text-body-md text-on-surface-variant">
            Access your enterprise intelligence portal.
          </p>

          <form
            className="space-y-md w-full"
            onSubmit={handleSubmit}
            noValidate
          >
            <div aria-live="polite" className="w-full">
              {formError ? (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 w-full mb-4"
                  role="alert"
                >
                  {formError}
                </div>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="companySlug"
                className="mb-xs block text-label-md text-on-surface-variant"
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
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.companySlug && (
                <p className="mt-1.5 text-xs text-error">{errors.companySlug}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-xs block text-label-md text-on-surface-variant"
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
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-error">{errors.email}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-xs block text-label-md text-on-surface-variant"
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
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-error">{errors.password}</p>
              )}
            </div>

            <div className="flex items-center justify-between py-xs">
              <label className="flex cursor-pointer items-center gap-xs">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                />
                <span className="text-label-md text-on-surface-variant">Remember me</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-label-md text-on-secondary-container hover:underline"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary py-md text-title-lg text-on-primary shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex justify-center items-center gap-2"
            >
              {isSubmitting ? (
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
              ) : null}
              {isSubmitting ? t("auth.signingIn") : "Sign In"}
            </button>

            <div className="text-center mt-5">
              <Link
                href="/register"
                className="text-sm font-semibold text-primary hover:underline transition"
              >
                {t("auth.registerNow")}
              </Link>
            </div>
          </form>
        </div>

        {/* Security Footer */}
        <div className="mt-auto flex flex-col gap-sm border-t border-outline-variant pt-xl">
          <div className="flex items-center gap-sm">
            <span
              className="material-symbols-outlined text-xl text-on-tertiary-container"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              verified_user
            </span>
            <span className="text-label-sm text-on-surface-variant">
              AES-256 Encrypted & SOC2 Compliant
            </span>
          </div>
          <p className="text-body-sm text-outline">
            © {new Date().getFullYear()} DocuMind Intelligence Systems. All rights reserved.
          </p>
        </div>
      </section>

      {/* Right Section: Visual Panel */}
      <AuthHeroPanel />
    </main>
  );
}
