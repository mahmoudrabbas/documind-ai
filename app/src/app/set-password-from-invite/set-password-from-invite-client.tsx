"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { AuthBrand, AuthPageShell } from "@/components/auth/auth-page-shell";
import { RateLimitAlert } from "@/components/auth/rate-limit-alert";
import type { Role } from "@/constants/routes";

type InviteDetails = {
  companyName: string;
  email: string;
  role: Role;
  expiresAt: string;
};
type PageState = {
  status: "loading" | "form" | "success" | "error";
  message: string;
  code?: string;
};
type FieldErrors = Partial<Record<"password" | "confirmPassword", string>>;

const rules = [
  ["auth.ruleMinLength", (value: string) => value.length >= 8],
  ["auth.ruleUppercase", (value: string) => /[A-Z]/.test(value)],
  ["auth.ruleLowercase", (value: string) => /[a-z]/.test(value)],
  ["auth.ruleNumber", (value: string) => /[0-9]/.test(value)],
  ["auth.ruleNoTrimSpaces", (value: string) => value === value.trim()],
] as const;

export default function SetPasswordFromInviteClient() {
  const searchParams = useSearchParams();
  const token = useMemo(
    () => searchParams.get("token")?.trim() ?? "",
    [searchParams],
  );
  const router = useRouter();
  const { t, dir } = useI18n();
  const pending = useRef(false);
  const [state, setState] = useState<PageState>(
    token
      ? {
          status: "loading",
          message: t("auth.inviteChecking"),
        }
      : {
          status: "error",
          code: "INVITE_INVALID",
          message: t("auth.inviteIncomplete"),
        },
  );
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState<number | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void apiClient<{ success: true; data: InviteDetails }>(
      "/users/validate-invite",
      {
        method: "POST",
        auth: false,
        redirectOnAuthFailure: false,
        body: { token },
      },
    )
      .then((response) => {
        if (active) {
          setDetails(response.data);
          setState({
            status: "form",
            message: t("auth.inviteFormMessage"),
          });
        }
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            status: "error",
            code:
              error instanceof ApiError ? (error.code ?? undefined) : undefined,
            message:
              error instanceof ApiError
                ? error.message
                : t("auth.inviteCheckFailed"),
          });
      });
    return () => {
      active = false;
    };
  }, [token, t]);

  const passwordValid =
    password.length <= 128 && rules.every(([, check]) => check(password));
  const formValid =
    passwordValid && confirmPassword === password && confirmPassword.length > 0;

  function validateFields() {
    const next: FieldErrors = {};
    if (!passwordValid)
      next.password = t("auth.setPasswordHelpText");
    if (!confirmPassword) next.confirmPassword = t("auth.confirmPasswordHelp");
    else if (confirmPassword !== password)
      next.confirmPassword = t("auth.passwordsDoNotMatch");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function messageForError(error: unknown) {
    if (!(error instanceof ApiError)) {
      return t("auth.savePasswordError");
    }
    switch (error.code) {
      default:
        return error.message || t("auth.savePasswordError");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rateLimitRetryAfter !== null) return;
    if (pending.current || !validateFields()) return;
    setRateLimitRetryAfter(null);
    setFormError("");
    pending.current = true;
    setIsSubmitting(true);
    setState((current) => ({
      ...current,
      status: "form",
      message: t("auth.settingPasswordState"),
    }));
    try {
      await apiClient("/users/set-password-from-invite", {
        method: "POST",
        auth: false,
        redirectOnAuthFailure: false,
        body: { token, password },
      });
      setState({
        status: "success",
        message: t("auth.setPasswordSuccessState"),
      });
      window.setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 1600);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "PASSWORD_VALIDATION_FAILED"
      ) {
        const detail = Array.isArray(error.details)
          ? (error.details.find(
              (item) =>
                item &&
                typeof item === "object" &&
                "field" in item &&
                item.field === "password",
            ) as { message?: string } | undefined)
          : undefined;
        setErrors({
          password:
            detail?.message ?? t("auth.passwordRequirementsFailed"),
        });
        setState({
          status: "form",
          message: t("auth.reviewHighlightedField"),
        });
      } else if (
        error instanceof ApiError &&
        [
          "INVITE_INVALID",
          "INVITE_EXPIRED",
          "INVITE_ALREADY_ACCEPTED",
          "INVITE_REVOKED",
          "INVITE_REISSUE_REQUIRED",
        ].includes(error.code ?? "")
      ) {
        setState({
          status: "error",
          code: error.code ?? undefined,
          message: error.message,
        });
      } else if (error instanceof ApiError && error.status === 429) {
        setRateLimitRetryAfter(error.retryAfterSeconds ?? 900);
      } else {
        setFormError(messageForError(error));
      }
    } finally {
      pending.current = false;
      setIsSubmitting(false);
    }
  }

  const handleRetrySubmit = useCallback(() => {
    setRateLimitRetryAfter(null);
  }, []);

  const terminal = state.status === "error" || state.status === "success";
  return (
    <AuthPageShell dir={dir} labelledBy="invite-title">
      <AuthBrand label={t("landing.appName") || "DocuMind AI"} />
      <h1 id="invite-title" className="mt-2 text-center text-3xl font-bold">
        {state.status === "success"
          ? t("auth.accountActivated")
          : state.status === "error"
            ? t("auth.inviteUnavailable")
            : t("auth.setUpAccount")}
      </h1>
      <p
        className="mx-auto mt-3 max-w-[32rem] text-center text-sm leading-6 text-slate-600"
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.status === "form" && details
          ? t("auth.invitedJoinText", {
              companyName: details.companyName,
              role: details.role.replaceAll("_", " ").toLowerCase(),
            })
          : state.message}
      </p>
      {state.status === "loading" ? (
        <div
          className="mx-auto mt-8 h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"
          aria-label={t("auth.inviteChecking")}
        />
      ) : null}
      {state.status === "form" && details ? (
        <>
          <dl className="mt-6 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="min-w-0">
              <dt className="text-slate-500">{t("auth.invitedEmailLabel")}</dt>
              <dd className="mt-1 break-words font-semibold">
                {details.email}
              </dd>
            </div>
          </dl>
          <form onSubmit={submit} noValidate className="mt-6 space-y-5">
            <div aria-live="polite" className="w-full">
              {rateLimitRetryAfter !== null ? (
                <div className="mb-4">
                  <RateLimitAlert
                    retryAfterSeconds={rateLimitRetryAfter}
                    onRetry={handleRetrySubmit}
                  />
                </div>
              ) : formError ? (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  {formError}
                </div>
              ) : null}
            </div>
            <label className="block text-sm font-semibold" htmlFor="password">
              {t("auth.passwordLabel")}
              <div className="relative mt-2">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      password: undefined,
                    }));
                  }}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby="password-help password-error"
                  disabled={isSubmitting || rateLimitRetryAfter !== null}
                  className="h-12 w-full rounded-xl border border-slate-300 px-4 pe-16 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={isSubmitting || rateLimitRetryAfter !== null}
                  className="absolute inset-y-0 end-2 px-2 text-xs font-semibold text-blue-700"
                  aria-label={
                    showPassword
                      ? t("auth.hidePassword")
                      : t("auth.showPassword")
                  }
                >
                  {showPassword ? t("auth.hide") : t("auth.show")}
                </button>
              </div>
            </label>
            {errors.password ? (
              <p
                id="password-error"
                role="alert"
                className="text-sm text-red-700"
              >
                {errors.password}
              </p>
            ) : null}
            <ul
              id="password-help"
              className="grid gap-1 text-sm sm:grid-cols-2"
            >
              {rules.map(([ruleKey, check]) => (
                <li
                  key={ruleKey}
                  className={
                    check(password) ? "text-emerald-700" : "text-slate-500"
                  }
                >
                  {check(password)
                    ? `${t("auth.passedPrefix")} ${t(ruleKey)}`
                    : `${t("auth.requiredPrefix")} ${t(ruleKey)}`}
                </li>
              ))}
            </ul>
            <label
              className="block text-sm font-semibold"
              htmlFor="confirmPassword"
            >
              {t("auth.confirmPasswordLabel")}
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setErrors((current) => ({
                    ...current,
                    confirmPassword: undefined,
                  }));
                }}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby="confirm-error"
                disabled={isSubmitting || rateLimitRetryAfter !== null}
                className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
              />
            </label>
            {errors.confirmPassword ? (
              <p
                id="confirm-error"
                role="alert"
                className="text-sm text-red-700"
              >
                {errors.confirmPassword}
              </p>
            ) : null}
            <button
              disabled={!formValid || isSubmitting || rateLimitRetryAfter !== null}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting
                ? t("auth.settingPassword")
                : t("auth.setPasswordAction")}
            </button>
          </form>
        </>
      ) : null}
      {terminal ? (
        <Link
          href="/login"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t("auth.goToSignIn")}
        </Link>
      ) : null}
    </AuthPageShell>
  );
}
