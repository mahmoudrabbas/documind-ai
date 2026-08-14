"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiClient } from "@/lib/api-client";
import {
  useAuth,
  type AuthTenant,
  type AuthUser,
} from "@/providers/auth-provider";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { useI18n } from "@/providers/i18n-provider";

type Response = {
  success: true;
  data: { user: AuthUser; tenant: AuthTenant; tokens: { accessToken: string } };
};

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const { t, dir, locale } = useI18n();
  const pending = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState<number | null>(
    null,
  );

  function messageForError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      return t("auth.errorInvalidEmailOrPassword");
    }
    return t("auth.errorGeneric");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setFormError("");
    setRateLimitRetryAfter(null);
    pending.current = true;
    setSubmitting(true);
    try {
      const response = await apiClient<Response>("/auth/super-admin/login", {
        method: "POST",
        auth: false,
        credentials: "include",
        body: { email: email.trim().toLowerCase(), password },
      });
      auth.establishSession(response.data.tokens.accessToken, {
        user: response.data.user,
        tenant: response.data.tenant,
      });
      router.replace("/super-admin/tenants");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429) {
        setRateLimitRetryAfter(caught.retryAfterSeconds ?? 900);
      } else {
        setFormError(messageForError(caught));
      }
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  const handleRetryLogin = useCallback(() => {
    setRateLimitRetryAfter(null);
  }, []);

  return (
    <AuthSplitShell
      key={locale}
      dir={dir}
      backToHomeLabel={t("auth.backToHome")}
      description={t("auth.platformAdmin")}
      securityLabel={t("auth.encryptedBadge")}
      rightsLabel={t("auth.rightsReserved", {
        year: String(new Date().getFullYear()),
      })}
      showBackToHome={false}
    >
      <div>
        <h2 className="mb-sm text-headline-lg-mobile font-bold text-primary sm:text-headline-lg">
          {t("auth.superAdminSignIn")}
        </h2>
        <p className="mb-[clamp(1rem,2.5dvh,2rem)] text-body-md text-on-surface-variant">
          {t("auth.superAdminCredentials")}
        </p>

        <form
          className="w-full space-y-[clamp(0.75rem,1.6dvh,1rem)]"
          onSubmit={submit}
          noValidate
        >
          <div aria-live="polite" className="w-full">
            {rateLimitRetryAfter !== null ? (
              <div className="mb-md">
                <RateLimitAlert
                  retryAfterSeconds={rateLimitRetryAfter}
                  onRetry={handleRetryLogin}
                />
              </div>
            ) : formError ? (
              <div
                className="mb-md w-full rounded-lg border border-red-200 bg-red-50 px-md py-sm text-sm text-red-700"
                role="alert"
              >
                {formError}
              </div>
            ) : null}
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
              disabled={submitting}
              className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
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
              disabled={submitting}
              className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-xs flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-md py-sm text-title-lg text-on-primary shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="material-symbols-outlined animate-spin">
                progress_activity
              </span>
            ) : null}
            {submitting ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>
      </div>
    </AuthSplitShell>
  );
}
