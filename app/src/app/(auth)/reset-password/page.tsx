"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { AuthHeroPanel } from "@/components/ui";

type ResetPasswordResponse = {
  success: boolean;
  message: string;
};

type FormErrors = Partial<Record<"password" | "confirmPassword", string>>;

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

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const slug = searchParams.get("slug")?.trim().toLowerCase();
  const { t, dir, locale } = useI18n();
  const submissionPending = useRef(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    setErrors({});
  }, [locale]);

  if (!token || !slug) {
    return (
      <main
        dir={dir}
        className="flex min-h-screen w-full items-center justify-center bg-surface-container-lowest px-4"
      >
        <div className="text-center max-w-md">
          <h2 className="text-headline-lg font-bold text-primary">{t("common.error")}</h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Missing or invalid password reset link.
          </p>
          <div className="mt-6">
            <Link
              href="/forgot-password"
              className="text-label-md font-semibold text-on-secondary-container hover:underline"
            >
              {t("auth.forgotPassword")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  function validate() {
    const next: FormErrors = {};
    if (!password || password.length < 8) {
      next.password = t("auth.passwordInvalid");
    } else if (!/^(?=.*[A-Za-z])(?=.*\d).+$/.test(password)) {
      next.password = t("auth.passwordInvalid");
    }
    if (!confirmPassword) {
      next.confirmPassword = t("auth.confirmPasswordRequired");
    } else if (password !== confirmPassword) {
      next.confirmPassword = t("auth.passwordsMustMatch");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionPending.current) return;
    setFormError("");
    if (!validate()) return;

    submissionPending.current = true;
    setIsSubmitting(true);
    try {
      await apiClient<ResetPasswordResponse>("/auth/reset-password", {
        method: "POST",
        auth: false,
        credentials: "include",
        body: { token, slug, password, confirmPassword },
      });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError(t("common.error"));
      }
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

        {/* Reset Password Form */}
        <div className="flex flex-grow flex-col justify-start">
          {isSuccess ? (
            <>
              <div className="mb-base flex h-14 w-14 items-center justify-center rounded-full bg-tertiary-container">
                <span
                  className="material-symbols-outlined text-3xl text-on-tertiary-container"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              </div>
              <h2 className="mb-base text-headline-lg font-bold text-primary">
                {t("auth.resetPasswordSuccess")}
              </h2>
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
                {t("auth.resetPasswordTitle")}
              </h2>
              <p className="mb-xl text-body-md text-on-surface-variant">
                {t("auth.resetPasswordSecure")} · {t("auth.companySlug")}: {slug}
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
                      onChange={(event) => {
                        setPassword(event.target.value);
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
                  {errors.password ? (
                    <p id="password-error" className="mt-1.5 text-xs text-error">
                      {errors.password}
                    </p>
                  ) : null}
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
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        clearFieldError(setErrors, "confirmPassword");
                      }}
                      autoComplete="new-password"
                      placeholder={t("auth.confirmPasswordPlaceholder")}
                      disabled={isSubmitting}
                      aria-invalid={Boolean(errors.confirmPassword)}
                      aria-describedby={errors.confirmPassword ? "confirm-error" : undefined}
                      className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm pe-11 transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <PasswordVisibilityToggle
                      visible={showConfirmPassword}
                      onToggle={() => setShowConfirmPassword((prev) => !prev)}
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.confirmPassword ? (
                    <p id="confirm-error" className="mt-1.5 text-xs text-error">
                      {errors.confirmPassword}
                    </p>
                  ) : null}
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
                  {isSubmitting ? t("auth.resettingPassword") : t("auth.resetPasswordSubmit")}
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