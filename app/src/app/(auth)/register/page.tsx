"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { AuthHeroPanel, LanguageSwitcher } from "@/components/ui";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";
import { getAccessToken, setAccessToken, clearAccessToken } from "@/lib/auth-tokens";
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

/** Clears a single field's error from a FormErrors-shaped state object, no-op if already clear */
function clearFieldError<K extends string>(
  setter: React.Dispatch<React.SetStateAction<Partial<Record<K, string>>>>,
  field: K,
) {
  setter((prev) => {
    if (!prev[field]) return prev;
    const next = { ...prev };
    delete next[field];
    return next;
  });
}

/** Eye / eye-off toggle button for password field visibility */
function PasswordVisibilityToggle({
  visible,
  onToggle,
  disabled,
}: {
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      tabIndex={-1}
      aria-label={visible ? "Hide password" : "Show password"}
      className="absolute inset-y-0 end-0 flex items-center px-md text-on-surface-variant transition-colors hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="material-symbols-outlined text-xl" aria-hidden="true">
        {visible ? "visibility_off" : "visibility"}
      </span>
    </button>
  );
}

type LoginResponse = {
  success: true;
  data: {
    tokens: {
      accessToken: string;
    };
    user: Record<string, unknown>;
    tenant: Record<string, unknown>;
  };
};

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, dir, locale } = useI18n();
  const submissionPending = useRef(false);

  const selectedPackageCode = useMemo(
    () => searchParams.get("package")?.trim() ?? "",
    [searchParams],
  );

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

  useEffect(() => {
    if (!selectedPackageCode) return;
    let active = true;
    apiClient<{
      success: boolean;
      data: Array<{
        name: string;
        code: string;
        trialDays: number;
        monthlyPrice: number;
        annualPrice: number;
      }>;
    }>("/public/packages", { auth: false })
      .then((res) => {
        if (active) setPackagesList(res.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedPackageCode]);

  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSlugManual, setIsSlugManual] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState<number | null>(
    null,
  );
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [packagesList, setPackagesList] = useState<
    Array<{
      name: string;
      code: string;
      trialDays: number;
      monthlyPrice: number;
      annualPrice: number;
    }>
  >([]);
  const [registeredPackage, setRegisteredPackage] = useState<{
    name: string;
    trialDays: number;
    monthlyPrice: number;
    annualPrice: number;
  } | null>(null);

  function handleCompanyNameChange(value: string) {
    setCompanyName(value);
    if (!isSlugManual) {
      setCompanySlug(generateCompanySlug(value));
    }
    clearFieldError(setErrors, "companyName");
  }

  function handleCompanySlugChange(value: string) {
    setIsSlugManual(true);
    setCompanySlug(value);
    clearFieldError(setErrors, "companySlug");
  }

  function messageForError(error: unknown) {
    if (!(error instanceof ApiError)) {
      return t("auth.errorGeneric");
    }

    switch (error.code) {
      case "EMAIL_NOT_VERIFIED":
        return t("auth.errorEmailNotVerified");
      case "INVALID_CREDENTIALS":
        return t("auth.errorINVALID_CREDENTIALS");
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
    if (submissionPending.current) return;
    setFormError("");
    setRateLimitRetryAfter(null);
    setSuccessMessage("");

    if (!validate()) {
      return;
    }

    submissionPending.current = true;
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

      const pkg = packagesList.find((p) => p.code === selectedPackageCode) ?? null;
      if (pkg) {
        setRegisteredPackage({
          name: pkg.name,
          trialDays: pkg.trialDays,
          monthlyPrice: pkg.monthlyPrice,
          annualPrice: pkg.annualPrice,
        });
      } else {
        setRegisteredPackage({
          name: "Free",
          trialDays: 0,
          monthlyPrice: 0,
          annualPrice: 0,
        });
      }

      // Clear form fields
      setCompanyName("");
      setCompanySlug("");
      setAdminName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setIsSlugManual(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setRateLimitRetryAfter(error.retryAfterSeconds ?? 900);
      } else {
        setFormError(messageForError(error));
      }
    } finally {
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  }

  const handleRetry = useCallback(() => {
    setRateLimitRetryAfter(null);
  }, []);

  return (
    <main
      key={locale}
      dir={dir}
      className="flex min-h-screen w-full flex-row overflow-x-hidden bg-surface-container-lowest"
    >
      {/* Left panel (Form Panel) */}
      <section className="z-10 flex min-h-screen w-full flex-col border-r border-outline-variant p-lg md:p-xl lg:w-[480px] lg:p-2xl xl:w-[560px]">
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
              {rateLimitRetryAfter !== null ? (
                <div className="mb-4">
                  <RateLimitAlert
                    retryAfterSeconds={rateLimitRetryAfter}
                    onRetry={handleRetry}
                  />
                </div>
              ) : formError ? (
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

              {successMessage && registeredPackage ? (
                <div className="rounded-xl border border-primary/20 bg-primary-container/10 px-4 py-4 mb-4">
                  <h3 className="font-bold text-primary text-title-md">
                    Subscription Active
                  </h3>
                  <div className="mt-2 space-y-1 text-sm text-on-surface-variant">
                    <p>
                      Plan:{" "}
                      <strong className="text-on-surface">
                        {registeredPackage.name}
                      </strong>
                    </p>
                    {registeredPackage.trialDays > 0 && (
                      <p>
                        Trial period:{" "}
                        <strong className="text-on-surface">
                          {registeredPackage.trialDays} days
                        </strong>
                      </p>
                    )}
                    {registeredPackage.monthlyPrice > 0 && (
                      <p>
                        Billing:{" "}
                        <strong className="text-on-surface">
                          {registeredPackage.monthlyPrice ===
                          registeredPackage.annualPrice / 12
                            ? `$${registeredPackage.annualPrice}/year ($${registeredPackage.monthlyPrice}/mo)`
                            : `$${registeredPackage.monthlyPrice}/mo`}
                        </strong>
                      </p>
                    )}
                    {registeredPackage.monthlyPrice === 0 && (
                      <p>
                        You are on the{" "}
                        <strong className="text-on-surface">Free</strong> plan.
                        Upgrade anytime from settings.
                      </p>
                    )}
                  </div>
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
                aria-invalid={Boolean(errors.companyName)}
                aria-describedby={errors.companyName ? "companyName-error" : undefined}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.companyName && (
                <p id="companyName-error" className="mt-1.5 text-xs text-error">
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
                aria-invalid={Boolean(errors.companySlug)}
                aria-describedby={
                  errors.companySlug ? "companySlug-error" : "companySlug-help"
                }
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.companySlug ? (
                <p id="companySlug-error" className="mt-1.5 text-xs text-error">
                  {errors.companySlug}
                </p>
              ) : (
                <p id="companySlug-help" className="mt-1.5 text-xs text-outline">
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
                onChange={(e) => {
                  setAdminName(e.target.value);
                  clearFieldError(setErrors, "adminName");
                }}
                autoComplete="name"
                placeholder={t("auth.adminNamePlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.adminName)}
                aria-describedby={errors.adminName ? "adminName-error" : undefined}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.adminName && (
                <p id="adminName-error" className="mt-1.5 text-xs text-error">{errors.adminName}</p>
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFieldError(setErrors, "email");
                }}
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {errors.email && (
                <p id="email-error" className="mt-1.5 text-xs text-error">{errors.email}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-xs block text-label-md text-on-surface-variant"
              >
                {t("auth.password")}
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError(setErrors, "password");
                  }}
                  autoComplete="new-password"
                  placeholder={t("auth.passwordPlaceholder")}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm pe-11 transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
                <PasswordVisibilityToggle
                  visible={showPassword}
                  onToggle={() => setShowPassword((prev) => !prev)}
                  disabled={isSubmitting}
                />
              </div>
              {errors.password && (
                <p id="password-error" className="mt-1.5 text-xs text-error">{errors.password}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-xs block text-label-md text-on-surface-variant"
              >
                {t("auth.confirmPassword")}
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    clearFieldError(setErrors, "confirmPassword");
                  }}
                  autoComplete="new-password"
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.confirmPassword)}
                  aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
                  className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm pe-11 transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                />
                <PasswordVisibilityToggle
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((prev) => !prev)}
                  disabled={isSubmitting}
                />
              </div>
              {errors.confirmPassword && (
                <p id="confirmPassword-error" className="mt-1.5 text-xs text-error">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {successMessage ? (
              <div className="text-center mt-6">
                <p className="text-sm text-on-surface-variant mb-3">
                  Your account is ready. You can close this page or log in.
                </p>
                <Link
                  href="/login"
                  className="inline-block rounded-lg bg-primary px-6 py-3 text-title-lg font-semibold text-on-primary"
                >
                  Go to Login
                </Link>
              </div>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting || undefined}
                className="w-full rounded-lg bg-primary py-md text-title-lg text-on-primary shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex justify-center items-center gap-2 mt-4"
              >
                {isSubmitting ? (
                  <span className="material-symbols-outlined animate-spin">
                    progress_activity
                  </span>
                ) : null}
                {isSubmitting ? t("auth.registering") : t("auth.register")}
              </button>
            )}

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
