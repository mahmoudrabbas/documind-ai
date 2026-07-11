"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/lib/auth-tokens";
import { useI18n } from "@/providers/i18n-provider";
import { AuthHeroPanel, LanguageSwitcher } from "@/components/ui";
import {
  validateCompanyName,
  validateCompanySlug,
  validateAdminName,
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  generateCompanySlug,
} from "@/lib/validation";

type RegisterResponse = {
  success: true;
  message: string;
};

type FormFields =
  | "companyName"
  | "companySlug"
  | "adminName"
  | "email"
  | "password"
  | "confirmPassword";
type FormErrors = Partial<Record<FormFields, string>>;

type LoginResponse = {
  success: true;
  data: {
    tokens: {
      accessToken: string;
    };
  };
};

// TODO: point this at your backend's OAuth entrypoints (same ones used on
// the login page). Each route should kick off the provider's OAuth flow and
// redirect back into the app once a session/token has been established.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type SocialProvider = "google" | "github";

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.39z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.61l4.01 3.11C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

function GitHubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.69 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.67 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.4-2.69 5.37-5.25 5.66.41.36.78 1.07.78 2.16 0 1.56-.01 2.81-.01 3.2 0 .3.2.66.79.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, dir } = useI18n();
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const selectedPackageCode = useMemo(
    () => searchParams.get("package")?.trim() ?? "",
    [searchParams],
  );

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

  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSlugManual, setIsSlugManual] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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

  function handleCompanyNameChange(value: string) {
    setCompanyName(value);
    if (!isSlugManual) {
      setCompanySlug(generateCompanySlug(value));
    }
  }

  function handleCompanySlugChange(value: string) {
    setIsSlugManual(true);
    setCompanySlug(value);
  }

  function validate() {
    const nextErrors: FormErrors = {};

    const companyNameErr = validateCompanyName(companyName);
    if (companyNameErr) nextErrors.companyName = t(companyNameErr);

    const companySlugErr = validateCompanySlug(companySlug);
    if (companySlugErr) nextErrors.companySlug = t(companySlugErr);

    const adminNameErr = validateAdminName(adminName);
    if (adminNameErr) nextErrors.adminName = t(adminNameErr);

    const emailErr = validateEmail(email);
    if (emailErr) nextErrors.email = t(emailErr);

    const passwordErr = validatePassword(password);
    if (passwordErr) nextErrors.password = t(passwordErr);

    const confirmPasswordErr = validateConfirmPassword(
      password,
      confirmPassword,
    );
    if (confirmPasswordErr) nextErrors.confirmPassword = t(confirmPasswordErr);

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        companyName: companyName.trim(),
        companySlug: companySlug.trim().toLowerCase(),
        adminName: adminName.trim(),
        email: email.trim().toLowerCase(),
        password,
      };

      if (selectedPackageCode) {
        body.packageCode = selectedPackageCode;
      }

      await apiClient<RegisterResponse>("/auth/register", {
        method: "POST",
        auth: false,
        body,
      });

      setSuccessMessage(t("auth.registerSuccess"));
      // Clear form fields
      setCompanyName("");
      setCompanySlug("");
      setAdminName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setIsSlugManual(false);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "DUPLICATE_SLUG" || error.message.includes("slug")) {
          setErrors((prev) => ({
            ...prev,
            companySlug: t("auth.companySlugInvalid"),
          }));
          setFormError(error.message);
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError(t("auth.errorGeneric"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSocialSignup(provider: SocialProvider) {
    const url = new URL(
      `${API_BASE_URL}/auth/${provider}`,
      window.location.origin,
    );
    if (companySlug.trim()) {
      url.searchParams.set("companySlug", companySlug.trim().toLowerCase());
    }
    window.location.href = url.toString();
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
            {t("auth.registerDescription")}
          </p>
        </div>

        {/* Register Form */}
        <div className="flex flex-grow flex-col justify-start">
          <h2 className="mb-base text-headline-lg font-bold text-primary">
            {t("auth.signUp")}
          </h2>
          <p className="mb-xl text-body-md text-on-surface-variant">
            {t("auth.createAccount")}
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

              {successMessage ? (
                <div
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 w-full mb-4"
                  role="status"
                >
                  {successMessage}
                </div>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="companyName"
                className="mb-xs block text-label-md text-on-surface-variant"
              >
                {t("auth.companyName")}
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                value={companyName}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                autoComplete="organization"
                placeholder={t("auth.companyNamePlaceholder")}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.companyName && (
                <p className="mt-1.5 text-xs text-error">
                  {errors.companyName}
                </p>
              )}
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
                onChange={(e) => handleCompanySlugChange(e.target.value)}
                placeholder={t("auth.companySlugPlaceholder")}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.companySlug ? (
                <p className="mt-1.5 text-xs text-error">
                  {errors.companySlug}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-outline">
                  {t("auth.companySlugHelp")}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="adminName"
                className="mb-xs block text-label-md text-on-surface-variant"
              >
                {t("auth.adminName")}
              </label>
              <input
                id="adminName"
                name="adminName"
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                autoComplete="name"
                placeholder={t("auth.adminNamePlaceholder")}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.adminName && (
                <p className="mt-1.5 text-xs text-error">{errors.adminName}</p>
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
                onChange={(e) => setEmail(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t("auth.passwordPlaceholder")}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-error">{errors.password}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-xs block text-label-md text-on-surface-variant"
              >
                {t("auth.confirmPassword")}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t("auth.confirmPasswordPlaceholder")}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-error">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary py-md text-title-lg text-on-primary shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex justify-center items-center gap-2 mt-4"
            >
              {isSubmitting ? (
                <span className="material-symbols-outlined animate-spin">
                  progress_activity
                </span>
              ) : null}
              {isSubmitting ? t("auth.registering") : t("auth.register")}
            </button>

            {/* Social signup */}
            <div className="relative flex items-center py-base">
              <div className="flex-grow border-t border-outline-variant"></div>
              <span className="mx-md flex-shrink text-label-sm text-outline">
                OR CONTINUE WITH
              </span>
              <div className="flex-grow border-t border-outline-variant"></div>
            </div>

            <div className="grid grid-cols-2 gap-sm">
              <button
                type="button"
                onClick={() => handleSocialSignup("google")}
                disabled={isSubmitting}
                aria-label="Continue with Google"
                className="flex items-center justify-center gap-xs rounded-lg border border-outline-variant py-sm text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GoogleIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => handleSocialSignup("github")}
                disabled={isSubmitting}
                aria-label="Continue with GitHub"
                className="flex items-center justify-center gap-xs rounded-lg border border-outline-variant py-sm text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GitHubIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="text-center mt-5">
              <Link
                href="/login"
                className="text-sm font-semibold text-primary hover:underline transition"
              >
                {t("auth.alreadyHaveAccount")}
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
            © {new Date().getFullYear()} DocuMind Intelligence Systems. All
            rights reserved.
          </p>
        </div>
      </section>

      {/* Right Section: Visual Panel */}
      <AuthHeroPanel />
    </main>
  );
}
