"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "../../constants/api";

type VerificationState =
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const FALLBACK_ERROR_MESSAGE = "Invalid or expired verification link.";
const verifiedTokenRequests = new Map<string, Promise<VerificationState>>();

export default function VerifyEmailClient() {
  const searchParams = useSearchParams();
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          DocuMind AI
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          Email verification
        </h1>

        <div
          className={`mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full border ${
            isSuccess
              ? "border-emerald-200 bg-emerald-50"
              : displayedVerification.status === "error"
                ? "border-rose-200 bg-rose-50"
                : "border-slate-200 bg-slate-50"
          }`}
          aria-hidden="true"
        >
          <span
            className={`h-3 w-3 rounded-full ${
              isSuccess
                ? "bg-emerald-500"
                : displayedVerification.status === "error"
                  ? "bg-rose-500"
                  : "bg-slate-400"
            }`}
          />
        </div>

        <p
          className={`mt-5 text-sm ${
            isSuccess
              ? "text-emerald-700"
              : displayedVerification.status === "error"
                ? "text-rose-700"
                : "text-slate-600"
          }`}
          role={displayedVerification.status === "error" ? "alert" : "status"}
        >
          {displayedVerification.message}
        </p>

        {displayedVerification.status !== "loading" ? (
          <Link
            href="/login"
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
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
