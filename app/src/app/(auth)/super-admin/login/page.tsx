"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiClient } from "@/lib/api-client";
import {
  useAuth,
  type AuthTenant,
  type AuthUser,
} from "@/providers/auth-provider";
import { AuthHeroPanel } from "@/components/ui/AuthHeroPanel";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";

type Response = {
  success: true;
  data: { user: AuthUser; tenant: AuthTenant; tokens: { accessToken: string } };
};

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const pending = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState<number | null>(null);

  function messageForError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      return "Invalid email or password.";
    }
    return "Unable to sign in. Please try again.";
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
    <main className="flex min-h-screen w-full flex-row overflow-x-hidden bg-surface-container-lowest">
      {/* Left panel (Form Panel) */}
      <section className="z-10 flex h-full w-full flex-col p-lg shadow-xl md:p-xl lg:w-[480px] lg:p-2xl xl:w-[560px]">
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
            Platform administration
          </p>
        </div>

        {/* Login Form */}
        <div className="flex flex-grow flex-col justify-center">
          <h2 className="mb-base text-headline-lg font-bold text-primary">
            Super Admin Sign In
          </h2>
          <p className="mb-xl text-body-md text-on-surface-variant">
            Use your platform administrator credentials.
          </p>

          <form className="space-y-md w-full" onSubmit={submit} noValidate>
            <div aria-live="polite" className="w-full">
              {rateLimitRetryAfter !== null ? (
                <div className="mb-4">
                  <RateLimitAlert
                    retryAfterSeconds={rateLimitRetryAfter}
                    onRetry={handleRetryLogin}
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
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-xs block text-label-md text-on-surface-variant"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
                disabled={submitting}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-xs block text-label-md text-on-surface-variant"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={submitting}
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary py-md text-title-lg text-on-primary shadow-sm transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex justify-center items-center gap-2 mt-4"
            >
              {submitting ? (
                <span className="material-symbols-outlined animate-spin">
                  progress_activity
                </span>
              ) : null}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
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
