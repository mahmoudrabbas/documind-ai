"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { AuthBrand, AuthPageShell } from "@/components/auth/auth-page-shell";

type InviteDetails = {
  companyName: string;
  email: string;
  role: string;
  expiresAt: string;
};
type PageState = {
  status: "loading" | "form" | "success" | "error";
  message: string;
  code?: string;
};
type FieldErrors = Partial<Record<"password" | "confirmPassword", string>>;

const rules = [
  ["At least 8 characters", (value: string) => value.length >= 8],
  ["An uppercase letter", (value: string) => /[A-Z]/.test(value)],
  ["A lowercase letter", (value: string) => /[a-z]/.test(value)],
  ["A number", (value: string) => /[0-9]/.test(value)],
  ["No leading or trailing spaces", (value: string) => value === value.trim()],
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
          message: "Checking your invitation...",
        }
      : {
          status: "error",
          code: "INVITE_INVALID",
          message: "This invitation link is incomplete.",
        },
  );
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
            message: "Create a password to activate your account.",
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
                : "We could not check this invitation.",
          });
      });
    return () => {
      active = false;
    };
  }, [token]);

  const passwordValid =
    password.length <= 128 && rules.every(([, check]) => check(password));
  const formValid =
    passwordValid && confirmPassword === password && confirmPassword.length > 0;

  function validateFields() {
    const next: FieldErrors = {};
    if (!passwordValid)
      next.password =
        "Use 8-128 characters with uppercase, lowercase, and a number, without surrounding spaces.";
    if (!confirmPassword) next.confirmPassword = "Confirm your password.";
    else if (confirmPassword !== password)
      next.confirmPassword = "Passwords do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !validateFields()) return;
    pending.current = true;
    setIsSubmitting(true);
    setState((current) => ({
      ...current,
      status: "form",
      message: "Setting your password...",
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
        message: "Your password is ready. You can now sign in.",
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
            detail?.message ??
            "The password does not meet the security requirements.",
        });
        setState({
          status: "form",
          message: "Review the highlighted field and try again.",
        });
      } else if (
        error instanceof ApiError &&
        [
          "INVITE_INVALID",
          "INVITE_EXPIRED",
          "INVITE_ALREADY_ACCEPTED",
          "INVITE_REVOKED",
        ].includes(error.code ?? "")
      ) {
        setState({
          status: "error",
          code: error.code ?? undefined,
          message: error.message,
        });
      } else {
        setState({
          status: "form",
          message: "We could not save your password. Please try again.",
        });
      }
    } finally {
      pending.current = false;
      setIsSubmitting(false);
    }
  }

  const terminal = state.status === "error" || state.status === "success";
  return (
    <AuthPageShell dir={dir} labelledBy="invite-title">
      <AuthBrand label={t("landing.appName") || "DocuMind AI"} />
      <h1 id="invite-title" className="mt-2 text-center text-3xl font-bold">
        {state.status === "success"
          ? "Account activated"
          : state.status === "error"
            ? "Invitation unavailable"
            : "Set up your account"}
      </h1>
      <p
        className="mx-auto mt-3 max-w-[32rem] text-center text-sm leading-6 text-slate-600"
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.status === "form" && details
          ? `You have been invited to join ${details.companyName} as ${details.role.replaceAll("_", " ").toLowerCase()}.`
          : state.message}
      </p>
      {state.status === "loading" ? (
        <div
          className="mx-auto mt-8 h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"
          aria-label="Checking invitation"
        />
      ) : null}
      {state.status === "form" && details ? (
        <>
          <dl className="mt-6 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="min-w-0">
              <dt className="text-slate-500">Invited email</dt>
              <dd className="mt-1 break-words font-semibold">
                {details.email}
              </dd>
            </div>
          </dl>
          <form onSubmit={submit} noValidate className="mt-6 space-y-5">
            <label className="block text-sm font-semibold" htmlFor="password">
              Password
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
                  className="h-12 w-full rounded-xl border border-slate-300 px-4 pe-16 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 end-2 px-2 text-xs font-semibold text-blue-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
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
              {rules.map(([label, check]) => (
                <li
                  key={label}
                  className={
                    check(password) ? "text-emerald-700" : "text-slate-500"
                  }
                >
                  {check(password) ? "Passed:" : "Required:"} {label}
                </li>
              ))}
            </ul>
            <label
              className="block text-sm font-semibold"
              htmlFor="confirmPassword"
            >
              Confirm password
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
              disabled={!formValid || isSubmitting}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSubmitting ? "Setting password..." : "Set password"}
            </button>
          </form>
        </>
      ) : null}
      {terminal ? (
        <Link
          href="/login"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to sign in
        </Link>
      ) : null}
    </AuthPageShell>
  );
}
