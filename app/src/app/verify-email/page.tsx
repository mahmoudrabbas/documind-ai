"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/providers/i18n-provider";
import { AuthPageShell } from "@/components/auth/auth-page-shell";

import { API_BASE_URL } from "../../constants/api";
import {
  FALLBACK_ERROR_MESSAGE,
  LOADING_VERIFICATION,
  getDisplayedVerification,
  getSafeBackendErrorMessage,
  getVerificationActionLabel,
  getVerificationTitle,
  type VerificationState,
} from "./verification-state";

const verifiedTokenRequests = new Map<string, Promise<VerificationState>>();

export default function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const { t, dir } = useI18n();
  const token = useMemo(
    () => searchParams.get("token")?.trim() ?? "",
    [searchParams],
  );
  const [verification, setVerification] =
    useState<VerificationState>(LOADING_VERIFICATION);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;
    const request = getVerificationRequest(token);

    request.then((result) => {
      if (isActive) {
        setVerification(result);
      }
    });

    return () => {
      isActive = false;
    };
  }, [token]);

  const displayedVerification = getDisplayedVerification(token, verification);
  const isSuccess = displayedVerification.status === "success";
  const isError = displayedVerification.status === "error";
  const isLoading = displayedVerification.status === "loading";

  return (
    <AuthPageShell dir={dir} labelledBy="verify-email-title">
      <div className="flex flex-col items-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950">
          <span
            className="material-symbols-outlined text-2xl text-white"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            neurology
          </span>
        </span>
        <p className="mt-2 text-sm font-bold text-slate-950">
          {t("landing.appName") || "DocuMind AI"}
        </p>
      </div>

      <div
        className={`mx-auto mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 ${
          isSuccess
            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
            : isError
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-slate-200 bg-slate-50 text-slate-950"
        }`}
        aria-hidden="true"
      >
        {isLoading ? (
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
        ) : isSuccess ? (
          <span className="text-3xl font-bold leading-none">✓</span>
        ) : (
          <span className="text-3xl font-bold leading-none">!</span>
        )}
      </div>

      <h1
        id="verify-email-title"
        className="mt-6 text-center text-2xl font-bold leading-8 text-slate-950 sm:text-3xl"
      >
        {getVerificationTitle(displayedVerification.status)}
      </h1>

      <p className="mx-auto mt-3 max-w-[32rem] text-center text-sm leading-6 text-slate-600">
        {isSuccess
          ? "Your workspace access is ready. Sign in to continue to DocuMind AI."
          : isError
            ? "We could not verify this link. It may be expired, already used, or missing a token."
            : "Hang tight while we confirm your verification link."}
      </p>

      <div
        className={`mt-7 w-full min-w-0 rounded-xl border px-4 py-4 text-center text-sm leading-6 ${
          isSuccess
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : isError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-slate-200 bg-slate-50 text-slate-700"
        }`}
        role={isError ? "alert" : "status"}
        aria-live="polite"
      >
        {displayedVerification.message}
      </div>

      {!isLoading ? (
        <Link
          href="/login"
          className="mt-7 flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
        >
          {getVerificationActionLabel(displayedVerification.status)}
        </Link>
      ) : null}
    </AuthPageShell>
  );
}

function getVerificationRequest(token: string) {
  const existingRequest = verifiedTokenRequests.get(token);

  if (existingRequest) {
    return existingRequest;
  }

  const request = verifyEmail(token);
  verifiedTokenRequests.set(token, request);

  return request;
}

async function verifyEmail(token: string): Promise<VerificationState> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      return {
        status: "success",
        message: "Email verified successfully. You can now sign in.",
      };
    }

    return {
      status: "error",
      message: await getBackendErrorMessage(response, token),
    };
  } catch {
    return {
      status: "error",
      message: FALLBACK_ERROR_MESSAGE,
    };
  }
}

async function getBackendErrorMessage(response: Response, token: string) {
  try {
    const payload = (await response.json()) as unknown;
    return getSafeBackendErrorMessage(payload, token);
  } catch {
    return FALLBACK_ERROR_MESSAGE;
  }
}