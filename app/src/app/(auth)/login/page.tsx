"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { setAccessToken } from "@/lib/auth-tokens";

type LoginResponse = {
  success: true;
  data: {
    tokens: {
      accessToken: string;
    };
  };
};

type FormErrors = Partial<Record<"companySlug" | "email" | "password", string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const trustItems = [
  {
    title: "Tenant isolated",
    description: "Every workspace is separated by company boundary.",
  },
  {
    title: "Verified access",
    description: "Only activated users can access company knowledge.",
  },
  {
    title: "Private answers",
    description: "Responses are grounded in approved internal documents.",
  },
];

function messageForError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Could not sign in. Please try again.";
  }

  switch (error.code) {
    case "EMAIL_NOT_VERIFIED":
      return "Please verify your email before signing in.";
    case "INVALID_CREDENTIALS":
      return "Invalid company, email, or password.";
    case "ACCOUNT_NOT_ACTIVE":
      return "Account is not active.";
    case "TENANT_NOT_ACTIVE":
      return "Tenant is not active.";
    default:
      return "Could not sign in. Please try again.";
  }
}

export default function LoginPage() {
  const router = useRouter();

  const [companySlug, setCompanySlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate() {
    const nextErrors: FormErrors = {};
    const trimmedCompanySlug = companySlug.trim();
    const trimmedEmail = email.trim();

    if (!trimmedCompanySlug) {
      nextErrors.companySlug = "Company slug is required.";
    }

    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!emailPattern.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!validate()) {
      return;
    }

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

      setAccessToken(response.data.tokens.accessToken);
      router.push("/");
    } catch (error) {
      setFormError(messageForError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-950 lg:h-dvh lg:overflow-hidden">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-6 px-5 py-6 sm:px-8 lg:h-dvh lg:grid-cols-[1fr_420px] lg:gap-10 lg:py-4">
        <section className="hidden h-full max-h-[calc(100dvh-2rem)] rounded-3xl border border-slate-200 bg-white p-8 shadow-sm lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-sm"
                aria-hidden="true"
              >
                DM
              </span>
              <div>
                <p className="text-lg font-semibold tracking-tight text-slate-950">
                  DocuMind AI
                </p>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Private AI Workspace
                </p>
              </div>
            </div>

            <div className="mt-10 max-w-xl">
              <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Secure company knowledge
              </span>

              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-slate-950">
                Sign in to your private company knowledge assistant.
              </h1>

              <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">
                Access tenant-isolated documents, review cited answers, and work
                with verified internal knowledge through a secure AI workspace.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Verified retrieval
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  Answers from approved files
                </p>
              </div>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                Protected
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Query
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  “Find the latest leave carry-over policy.”
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      HR_Policy_2024.pdf
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Verified answer returned with source citation.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    Page 14
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {trustItems.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700"
                  aria-hidden="true"
                >
                  ✓
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-950">
                  {item.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full" aria-labelledby="login-title">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold text-white"
              aria-hidden="true"
            >
              DM
            </span>
            <div>
              <p className="font-semibold tracking-tight text-slate-950">
                DocuMind AI
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Private AI Workspace
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 sm:p-8">
            <div>
              <p className="text-sm font-semibold text-blue-600">
                Secure sign in
              </p>
              <h2
                id="login-title"
                className="mt-2 text-3xl font-semibold tracking-tight text-slate-950"
              >
                Sign in
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Access your company workspace.
              </p>
            </div>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit} noValidate>
              <div aria-live="polite">
                {formError ? (
                  <div
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
                    role="alert"
                  >
                    {formError}
                  </div>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="companySlug"
                  className="block text-sm font-medium text-slate-700"
                >
                  Company slug
                </label>
                <input
                  id="companySlug"
                  name="companySlug"
                  type="text"
                  value={companySlug}
                  onChange={(event) => setCompanySlug(event.target.value)}
                  autoComplete="organization"
                  placeholder="acme-consulting"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.companySlug)}
                  aria-describedby={
                    errors.companySlug
                      ? "companySlug-error"
                      : "companySlug-help"
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                />
                {errors.companySlug ? (
                  <p
                    id="companySlug-error"
                    className="mt-2 text-sm leading-5 text-red-600"
                  >
                    {errors.companySlug}
                  </p>
                ) : (
                  <p
                    id="companySlug-help"
                    className="mt-2 text-sm leading-5 text-slate-500"
                  >
                    Use your company workspace slug.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="admin@company.com"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                />
                {errors.email ? (
                  <p
                    id="email-error"
                    className="mt-2 text-sm leading-5 text-red-600"
                  >
                    {errors.email}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700"
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
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                />
                {errors.password ? (
                  <p
                    id="password-error"
                    className="mt-2 text-sm leading-5 text-red-600"
                  >
                    {errors.password}
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting || undefined}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:text-white"
              >
                {isSubmitting ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    aria-hidden="true"
                  />
                ) : null}
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>

              <p className="text-center text-xs leading-5 text-slate-500">
                Your session uses an in-memory access token and a secure
                httpOnly refresh cookie.
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
