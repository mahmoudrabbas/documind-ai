"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
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

export default function RegisterPage() {
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
      await apiClient<RegisterResponse>("/auth/register", {
        method: "POST",
        auth: false,
        body: {
          companyName: companyName.trim(),
          companySlug: companySlug.trim().toLowerCase(),
          adminName: adminName.trim(),
          email: email.trim().toLowerCase(),
          password,
        },
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

  return (
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
        <div className="flex flex-grow flex-col justify-center">
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
                <p className="mt-1.5 text-xs text-error">{errors.companyName}</p>
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
                <p className="mt-1.5 text-xs text-error">{errors.companySlug}</p>
              ) : (
                <p className="mt-1.5 text-xs text-outline">{t("auth.companySlugHelp")}</p>
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
                <p className="mt-1.5 text-xs text-error">{errors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-primary py-md text-title-lg text-on-primary shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex justify-center items-center gap-2 mt-4"
            >
              {isSubmitting ? (
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
              ) : null}
              {isSubmitting ? t("auth.registering") : t("auth.register")}
            </button>

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
            © {new Date().getFullYear()} DocuMind Intelligence Systems. All rights reserved.
          </p>
        </div>
      </section>

      {/* Right Section: Visual Panel */}
      <AuthHeroPanel />
    </main>
  );
}
