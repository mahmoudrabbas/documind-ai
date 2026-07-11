"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/providers/i18n-provider";

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
    <main
      dir={dir}
      className="flex min-h-dvh items-center justify-center bg-slate-50 px-5 py-8 text-slate-950"
    >
      <section
        className="w-full min-w-0 max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/70 sm:p-10"
        aria-labelledby="verify-email-title"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20">
          DM
        </div>
        <p className="mt-4 whitespace-normal text-lg font-bold tracking-tight text-slate-950">
          {t("landing.appName") || "DocuMind AI"}
        </p>
        <p className="mt-2 inline-flex max-w-full items-center justify-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-center text-xs font-semibold text-blue-700">
          Email verification
        </p>

        <div
          className={`mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-full border-4 ${
            isSuccess
              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : isError
                ? "border-red-200 bg-red-50 text-red-600"
                : "border-blue-100 bg-blue-50 text-blue-600"
          }`}
          aria-hidden="true"
        >
          {isLoading ? (
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          ) : isSuccess ? (
            <span className="text-3xl font-bold leading-none">✓</span>
          ) : (
            <span className="text-3xl font-bold leading-none">!</span>
          )}
        </div>

        <h1
          id="verify-email-title"
          className="mt-6 whitespace-normal text-2xl font-bold leading-7 tracking-tight text-slate-950 sm:text-3xl sm:leading-9"
        >
          {getVerificationTitle(displayedVerification.status)}
        </h1>

        <p className="mt-3 whitespace-normal break-words text-sm leading-7 text-slate-600">
          {isSuccess
            ? "Your workspace access is ready. Sign in to continue to DocuMind AI."
            : isError
              ? "We could not verify this link. It may be expired, already used, or missing a token."
              : "Hang tight while we confirm your verification link."}
        </p>

        <div
          className={`mt-7 whitespace-normal break-words rounded-2xl border px-4 py-3 text-sm leading-6 ${
            isSuccess
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : isError
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-blue-100 bg-blue-50 text-blue-700"
          }`}
          role={isError ? "alert" : "status"}
          aria-live="polite"
        >
          {displayedVerification.message}
        </div>

        {!isLoading ? (
          <Link
            href="/login"
            className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {getVerificationActionLabel(displayedVerification.status)}
          </Link>
        ) : null}
      </section>
    </main>
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
