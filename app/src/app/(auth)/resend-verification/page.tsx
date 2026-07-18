"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";
import { AuthHeroPanel } from "@/components/ui";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { ApiError, apiClient } from "@/lib/api-client";
import { validateCompanySlug, validateEmail } from "@/lib/validation";
import { useI18n } from "@/providers/i18n-provider";

type ResendVerificationResponse = {
  success: boolean;
  message: string;
};

type FormErrors = Partial<Record<"companySlug" | "email", string>>;

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

export default function ResendVerificationPage() {
  const searchParams = useSearchParams();
  const { t, dir, locale } = useI18n();
  const submissionPending = useRef(false);
  const [companySlug, setCompanySlug] = useState(
    searchParams.get("companySlug")?.trim().toLowerCase() ?? "",
  );
  const [email, setEmail] = useState(
    searchParams.get("email")?.trim().toLowerCase() ?? "",
  );
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState<number | null>(
    null,
  );
  const submitDisabled = isSubmitting || rateLimitRetryAfter !== null;

  function validate() {
    const next: FormErrors = {};
    const slugError = validateCompanySlug(companySlug.trim().toLowerCase());
    const emailError = validateEmail(email);
    if (slugError) next.companySlug = t(slugError);
    if (emailError) next.email = t(emailError);
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rateLimitRetryAfter !== null) return;
    if (submissionPending.current) return;
    setFormError("");
    setSuccessMessage("");
    setRateLimitRetryAfter(null);
    if (!validate()) return;

    submissionPending.current = true;
    setIsSubmitting(true);

    try {
      await apiClient<ResendVerificationResponse>(
        "/auth/resend-verification-email",
        {
          method: "POST",
          auth: false,
          credentials: "include",
          body: {
            companySlug: companySlug.trim().toLowerCase(),
            email: email.trim().toLowerCase(),
          },
        },
      );
      setSuccessMessage(t("auth.resendVerificationSuccess"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setRateLimitRetryAfter(error.retryAfterSeconds ?? 900);
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
            : t("auth.resendVerificationError"),
        );
      }
    } finally {
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  }

  const handleRetryRequest = useCallback(() => {
    setRateLimitRetryAfter(null);
  }, []);

  return (
    <main
      key={locale}
      dir={dir}
      className="flex min-h-screen w-full flex-row overflow-x-hidden bg-surface-container-lowest"
    >
      <section className="z-10 flex min-h-screen w-full flex-col border-r border-outline-variant p-lg md:p-xl lg:w-[480px] lg:p-2xl xl:w-[560px]">
        <div className="absolute top-6 right-6 z-20">
          <LanguageSwitcher />
        </div>

        <div className="mb-12">
          <Link
            href="/"
            aria-label={t("auth.backToHome")}
            className="mb-lg inline-flex items-center gap-xs text-label-md font-semibold text-primary transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              arrow_back
            </span>
            {t("auth.backToHome")}
          </Link>
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
            {t("auth.resendVerificationDescription")}
          </p>
        </div>

        <div className="flex flex-grow flex-col justify-start">
          <h2 className="mb-base text-headline-lg font-bold text-primary">
            {t("auth.resendVerificationTitle")}
          </h2>
          <p className="mb-xl text-body-md text-on-surface-variant">
            {t("auth.resendVerificationInstructions")}
          </p>

          <form className="space-y-md w-full" onSubmit={handleSubmit} noValidate>
            <div aria-live="polite" className="w-full">
              {rateLimitRetryAfter !== null ? (
                <div className="mb-4">
                  <RateLimitAlert
                    retryAfterSeconds={rateLimitRetryAfter}
                    onRetry={handleRetryRequest}
                  />
                </div>
              ) : formError ? (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 w-full mb-4"
                  role="alert"
                >
                  {formError}
                </div>
              ) : successMessage ? (
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
                onChange={(event) => {
                  setCompanySlug(event.target.value);
                  clearFieldError(setFieldErrors, "companySlug");
                }}
                autoComplete="organization"
                placeholder={t("auth.companySlugPlaceholder")}
                disabled={submitDisabled}
                aria-invalid={Boolean(fieldErrors.companySlug)}
                aria-describedby={
                  fieldErrors.companySlug ? "companySlug-error" : "companySlug-help"
                }
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {fieldErrors.companySlug ? (
                <p id="companySlug-error" className="mt-1.5 text-xs text-error">
                  {fieldErrors.companySlug}
                </p>
              ) : (
                <p id="companySlug-help" className="mt-1.5 text-xs text-on-surface-variant">
                  {t("auth.companySlugHelp")}
                </p>
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
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearFieldError(setFieldErrors, "email");
                }}
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                disabled={submitDisabled}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
              {fieldErrors.email ? (
                <p id="email-error" className="mt-1.5 text-xs text-error">
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={submitDisabled}
              aria-busy={isSubmitting || undefined}
              className="w-full rounded-lg bg-primary py-md text-title-lg text-on-primary shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex justify-center items-center gap-2"
            >
              {isSubmitting ? (
                <span className="material-symbols-outlined animate-spin">
                  progress_activity
                </span>
              ) : null}
              {isSubmitting
                ? t("auth.resendVerificationSending")
                : t("auth.resendVerificationSubmit")}
            </button>

            <div className="text-center mt-5">
              <Link
                href="/login"
                className="text-sm font-semibold text-primary hover:underline transition"
              >
                {t("auth.backToLogin")}
              </Link>
            </div>
          </form>
        </div>

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

      <AuthHeroPanel />
    </main>
  );
}
