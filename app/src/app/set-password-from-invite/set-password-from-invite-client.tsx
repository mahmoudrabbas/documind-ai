"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { API_BASE_URL } from "../../constants/api";
import { useI18n } from "@/providers/i18n-provider"; 

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
  const { t, dir } = useI18n(); 
  
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
    <main dir={dir} className="flex min-h-screen items-center justify-center bg-slate-50 p-6 w-full overflow-x-hidden">
      <div className="w-full max-w-[440px] min-w-[290px] sm:min-w-[400px] rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
        
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 block w-full text-center">
          {t("landing.appName") || "DocuMind AI"}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 block w-full text-center">
          Set your password
        </h1>

        {isForm && state.message && (
          <p className="mt-3 text-xs text-center leading-relaxed text-slate-500 max-w-sm mx-auto">
            {state.message}
          </p>
        )}

        {isForm && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5 w-full">
            <div className="w-full text-start">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Enter password"
                disabled={isSubmitting}
                required
              />
              <p className="mt-2 text-[11px] leading-normal text-slate-500">
                Must be at least 8 characters with uppercase, lowercase, and digits.
              </p>
            </div>

            <div className="w-full text-start">
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed"
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
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                  <span>Setting password...</span>
                </>
              ) : (
                "Set password"
              )}
            </button>
          </form>
        )}

        {!isForm && (
          <div className="flex flex-col items-center w-full">
            <div
              className={`mx-auto mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                isSuccess
                  ? "border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-100"
                  : isError
                    ? "border-rose-200 bg-rose-50 shadow-sm shadow-rose-100"
                    : "border-slate-200 bg-slate-50"
              }`}
              aria-hidden="true"
            >
              <span
                className={`h-3 w-3 rounded-full transition-all duration-300 ${
                  isSuccess
                    ? "bg-emerald-500 scale-110"
                    : isError
                      ? "bg-rose-500 scale-110"
                      : "bg-slate-400"
                }`}
              />
            </div>

            <p
              className={`mt-6 text-sm text-center leading-relaxed block w-full px-2 whitespace-normal break-words ${
                isSuccess
                  ? "text-emerald-700 font-medium"
                  : isError
                    ? "text-rose-700 font-medium"
                    : "text-slate-600"
              }`}
              role={isError ? "alert" : "status"}
            >
              {state.message}
            </p>

            {state.status !== "loading" && (
              <Link
                href="/login"
                className="mt-8 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-blue-700"
              >
                {isSuccess ? "Go to Login" : "Back to Login"}
              </Link>
            )}
          </div>
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