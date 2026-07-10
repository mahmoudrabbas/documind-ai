"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "../../constants/api";
import { useI18n } from "@/providers/i18n-provider";

type VerificationState =
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const FALLBACK_ERROR_MESSAGE = "Invalid or expired verification link.";
const verifiedTokenRequests = new Map<string, Promise<VerificationState>>();

export default function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const { t, dir } = useI18n(); 
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [verification, setVerification] = useState<VerificationState>({
    status: "loading",
    message: "Verifying your email...",
  });

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

  const displayedVerification = token
    ? verification
    : ({
        status: "error",
        message: "Verification token is missing.",
      } satisfies VerificationState);
  const isSuccess = displayedVerification.status === "success";

  return (
    <main dir={dir} className="flex min-h-screen items-center justify-center bg-slate-50 p-6 w-full overflow-x-hidden">
      <div className="w-full max-w-[440px] min-w-[290px] sm:min-w-[400px] rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50 flex flex-col items-center">
        
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 block w-full">
          {t("landing.appName") || "DocuMind AI"}
        </p>
        
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 block w-full">
          Email Verification
        </h1>

        <div
          className={`mx-auto mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
            isSuccess
              ? "border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-100"
              : displayedVerification.status === "error"
                ? "border-rose-200 bg-rose-50 shadow-sm shadow-rose-100"
                : "border-slate-200 bg-slate-50 animate-pulse"
          }`}
          aria-hidden="true"
        >
          <span
            className={`h-3 w-3 rounded-full transition-all duration-300 ${
              isSuccess
                ? "bg-emerald-500 scale-110"
                : displayedVerification.status === "error"
                  ? "bg-rose-500 scale-110"
                  : "bg-slate-400"
            }`}
          />
        </div>

        <p
          className={`mt-6 text-sm leading-relaxed block w-full px-2 whitespace-normal break-words ${
            isSuccess
              ? "text-emerald-700 font-medium"
              : displayedVerification.status === "error"
                ? "text-rose-700 font-medium"
                : "text-slate-600"
          }`}
          role={displayedVerification.status === "error" ? "alert" : "status"}
        >
          {displayedVerification.message}
        </p>

        {displayedVerification.status !== "loading" ? (
          <Link
            href="/login"
            className="mt-8 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-[0.98]"
          >
            {isSuccess ? "Go to Login" : "Back to Login"}
          </Link>
        ) : null}
      </div>
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

    const backendMessage = await getBackendErrorMessage(response, token);

    return {
      status: "error",
      message: backendMessage,
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