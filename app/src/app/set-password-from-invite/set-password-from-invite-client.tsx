"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { API_BASE_URL } from "../../constants/api";

type SetPasswordState =
  | { status: "loading"; message: string }
  | { status: "form"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const FALLBACK_ERROR_MESSAGE = "Invalid or expired invite link.";

interface SetPasswordForm {
  password: string;
  confirmPassword: string;
}

interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

export default function SetPasswordFromInviteClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = useMemo(
    () => searchParams.get("token")?.trim() ?? "",
    [searchParams],
  );
  const [errorState, setErrorState] = useState<SetPasswordState | null>(null);
  const [form, setForm] = useState<SetPasswordForm>({
    password: "",
    confirmPassword: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derive state from token presence
  const state: SetPasswordState =
    errorState ||
    (token
      ? {
          status: "form",
          message: "Enter a strong password to activate your account.",
        }
      : {
          status: "error",
          message: "Invite token is missing.",
        });

  function validatePassword(password: string): PasswordValidation {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push("Password must be at least 8 characters");
    }
    if (password.length > 128) {
      errors.push("Password must be at most 128 characters");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }
    if (!/[0-9]/.test(password)) {
      errors.push("Password must contain at least one digit");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    const passwordValidation = validatePassword(form.password);
    if (!passwordValidation.isValid) {
      setErrorState({
        status: "error",
        message: passwordValidation.errors[0] ?? "Invalid password",
      });
      setIsSubmitting(false);
      return;
    }

    if (form.password !== form.confirmPassword) {
      setErrorState({
        status: "error",
        message: "Passwords do not match",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/users/set-password-from-invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            password: form.password,
          }),
        },
      );

      if (response.ok) {
        setErrorState({
          status: "success",
          message: "Password set successfully. You can now sign in.",
        });
        setTimeout(() => {
          router.push("/login");
        }, 2000);
        return;
      }

      const backendMessage = await getBackendErrorMessage(response, token);
      setErrorState({
        status: "error",
        message: backendMessage,
      });
    } catch {
      setErrorState({
        status: "error",
        message: FALLBACK_ERROR_MESSAGE,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isSuccess = state.status === "success";
  const isError = state.status === "error";
  const isForm = state.status === "form";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          DocuMind AI
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          Set your password
        </h1>

        {isForm && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Enter password"
                disabled={isSubmitting}
                required
              />
              <p className="mt-2 text-xs text-slate-600">
                Must be at least 8 characters with uppercase, lowercase, and
                digits.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm({ ...form, confirmPassword: e.target.value })
                }
                placeholder="Confirm password"
                disabled={isSubmitting}
                required
              />
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Setting password..." : "Set password"}
            </button>
          </form>
        )}

        {!isForm && (
          <>
            <div
              className={`mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full border ${
                isSuccess
                  ? "border-emerald-200 bg-emerald-50"
                  : isError
                    ? "border-rose-200 bg-rose-50"
                    : "border-slate-200 bg-slate-50"
              }`}
              aria-hidden="true"
            >
              <span
                className={`h-3 w-3 rounded-full ${
                  isSuccess
                    ? "bg-emerald-500"
                    : isError
                      ? "bg-rose-500"
                      : "bg-slate-400"
                }`}
              />
            </div>

            <p
              className={`mt-5 text-center text-sm ${
                isSuccess
                  ? "text-emerald-700"
                  : isError
                    ? "text-rose-700"
                    : "text-slate-600"
              }`}
              role={isError ? "alert" : "status"}
            >
              {state.message}
            </p>

            {state.status !== "loading" && (
              <Link
                href="/login"
                className="mt-6 inline-flex w-full min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                {isSuccess ? "Go to Login" : "Back to Login"}
              </Link>
            )}
          </>
        )}
      </div>
    </main>
  );
}

async function getBackendErrorMessage(response: Response, token: string) {
  try {
    const payload = (await response.json()) as unknown;
    const message = extractErrorMessage(payload);

    if (message && isSafeErrorMessage(message, token)) {
      return message;
    }
  } catch {
    return FALLBACK_ERROR_MESSAGE;
  }

  return FALLBACK_ERROR_MESSAGE;
}

function extractErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as {
    error?: unknown;
    message?: unknown;
    details?: unknown;
  };

  if (typeof candidate.message === "string") {
    return candidate.message;
  }

  if (typeof candidate.error === "string") {
    return candidate.error;
  }

  if (typeof candidate.details === "string") {
    return candidate.details;
  }

  return null;
}

function isSafeErrorMessage(message: string, token: string) {
  const trimmedMessage = message.trim();

  return (
    trimmedMessage.length > 0 &&
    trimmedMessage.length <= 180 &&
    !trimmedMessage.includes(token)
  );
}
