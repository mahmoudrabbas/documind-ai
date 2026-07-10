"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
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

type FormFields = "companyName" | "companySlug" | "adminName" | "email" | "password" | "confirmPassword";
type FormErrors = Partial<Record<FormFields, string>>;

export default function RegisterPage() {
  const { t, dir } = useI18n();

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

    const confirmPasswordErr = validateConfirmPassword(password, confirmPassword);
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
    <main dir={dir} className="min-h-screen bg-white text-slate-950 flex flex-col lg:flex-row w-full overflow-x-hidden">
      
      <section className="bg-[#001524] text-white w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 min-h-[40vh] lg:min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08)_0%,transparent_70%)] pointer-events-none" />

        <div className="max-w-md w-full min-w-[280px] sm:min-w-[400px] flex flex-col items-center relative z-10">
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

          <div className="mt-8 text-center w-full">
            <span className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 mb-4">
              {t("landing.badge")}
            </span>

            <h1 className="text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white text-center w-full block">
              {t("auth.registerTitle")}
            </h1>

            <p className="mt-4 text-sm leading-relaxed text-slate-300 text-center w-full max-w-sm block">
              {t("auth.registerDescription")}
            </p>
          </div>

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

      {/* Right column (Registration form) */}
      <section className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 lg:px-16 bg-white min-h-[60vh] lg:min-h-screen relative">
        <div className={`absolute top-6 ${dir === "rtl" ? "left-6" : "right-6"} z-20`}>
          <LanguageSwitcher />
        </div>

        <div className="max-w-md w-full min-w-[280px] sm:min-w-[400px]">
          <div className="text-start w-full">
            <p className="text-sm font-semibold text-blue-600 w-full block">
              {t("auth.secureRegistration")}
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 w-full block">
              {t("auth.signUp")}
            </h2>
            <p className="mt-2 text-sm text-slate-600 w-full block">
              {t("auth.createAccount")}
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

              {successMessage ? (
                <div
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 w-full"
                  role="status"
                >
                  {successMessage}
                </div>
              ) : null}
            </div>

            <div className="w-full text-start">
              <label
                htmlFor="companyName"
                className="block text-sm font-medium text-slate-700"
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
                aria-invalid={Boolean(errors.companyName)}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.companyName ? (
                <p className="mt-1.5 text-xs text-red-600">
                  {errors.companyName}
                </p>
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
                onChange={(e) => handleCompanySlugChange(e.target.value)}
                placeholder={t("auth.companySlugPlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.companySlug)}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.companySlug ? (
                <p className="mt-1.5 text-xs text-red-600">
                  {errors.companySlug}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">
                  {t("auth.companySlugHelp")}
                </p>
              )}
            </div>

            <div className="w-full text-start">
              <label
                htmlFor="adminName"
                className="block text-sm font-medium text-slate-700"
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
                aria-invalid={Boolean(errors.adminName)}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.adminName ? (
                <p className="mt-1.5 text-xs text-red-600">
                  {errors.adminName}
                </p>
              ) : null}
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
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.email)}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.email ? (
                <p className="mt-1.5 text-xs text-red-600">
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
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t("auth.passwordPlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.password)}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.password ? (
                <p className="mt-1.5 text-xs text-red-600">
                  {errors.password}
                </p>
              ) : null}
            </div>

            <div className="w-full text-start">
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700"
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
                aria-invalid={Boolean(errors.confirmPassword)}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              {errors.confirmPassword ? (
                <p className="mt-1.5 text-xs text-red-600">
                  {errors.confirmPassword}
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
              {isSubmitting ? t("auth.registering") : t("auth.register")}
            </button>

            <div className="text-center mt-5">
              <Link
                href="/login"
                className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition"
              >
                {t("auth.alreadyHaveAccount")}
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
