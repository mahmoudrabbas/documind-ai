"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { AuthHeroPanel } from "@/components/ui";
import { validateCompanySlug, validateEmail } from "@/lib/validation";

type ForgotPasswordResponse = {
  success: boolean;
  message: string;
};

type FormErrors = Partial<Record<"companySlug" | "email", string>>;

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

export default function ForgotPasswordPage() {
  const { t, dir, locale } = useI18n();
  const submissionPending = useRef(false);

  const [email, setEmail] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

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
          slug: companySlug.trim().toLowerCase(),
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
            Private AI Knowledge Assistant for Company Documents
          </p>
        </div>

        {/* Forgot Password Form */}
        <div className="flex flex-grow flex-col justify-start">
          {isSent ? (
            <>
              <div className="mb-base flex h-14 w-14 items-center justify-center rounded-full bg-tertiary-container">
                <span
                  className="material-symbols-outlined text-3xl text-on-tertiary-container"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  mark_email_read
                </span>
              </div>
              <h2 className="mb-base text-headline-lg font-bold text-primary">
                {t("auth.forgotPasswordSuccess")}
              </h2>
              <p className="mb-xl text-body-md text-on-surface-variant">
                {t("auth.forgotPasswordEmailSent")}
              </p>
              <Link
                href="/login"
                className="text-label-md font-semibold text-on-secondary-container hover:underline"
              >
                {t("auth.backToLogin")}
              </Link>
            </>
          ) : (
            <>
              <h2 className="mb-base text-headline-lg font-bold text-primary">
                {t("auth.forgotPasswordTitle")}
              </h2>
              <p className="mb-xl text-body-md text-on-surface-variant">
                {t("auth.forgotPasswordDescription")}
              </p>

              <form
                className="space-y-md w-full"
                onSubmit={handleSubmit}
                noValidate
              >
                <div aria-live="polite" className="w-full">
                  {error ? (
                    <div
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 w-full mb-4"
                      role="alert"
                    >
                      {error}
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
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  {fieldErrors.email && (
                    <p id="email-error" className="mt-1.5 text-xs text-error">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting || undefined}
                  className="w-full rounded-lg bg-primary py-md text-title-lg text-on-primary shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex justify-center items-center gap-2"
                >
                  {isSubmitting ? (
                    <span className="material-symbols-outlined animate-spin">
                      progress_activity
                    </span>
                  ) : null}
                  {isSubmitting
                    ? t("auth.forgotPasswordSending")
                    : t("auth.forgotPasswordSubmit")}
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
            </>
          )}
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