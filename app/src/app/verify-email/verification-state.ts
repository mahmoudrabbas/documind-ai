export type VerificationState =
  | {
      status: "loading";
      message: string;
    }
  | {
      status: "success";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

export const FALLBACK_ERROR_MESSAGE =
  "Invalid or expired verification link.";

export const LOADING_VERIFICATION: VerificationState = {
  status: "loading",
  message: "We are securely validating your verification link.",
};

export const MISSING_TOKEN_VERIFICATION: VerificationState = {
  status: "error",
  message:
    "The verification token is missing from this link. Please open the complete link from your email.",
};

export function getDisplayedVerification(
  token: string,
  verification: VerificationState,
): VerificationState {
  return token ? verification : MISSING_TOKEN_VERIFICATION;
}

export function getVerificationTitle(
  status: VerificationState["status"],
) {
  switch (status) {
    case "success":
      return "Email verified successfully";

    case "error":
      return "Verification failed";

    default:
      return "Verifying your email";
  }
}

export function getVerificationActionLabel(
  status: VerificationState["status"],
) {
  return status === "success"
    ? "Continue to sign in"
    : "Back to sign in";
}

export function getSafeBackendErrorMessage(
  payload: unknown,
  token: string,
) {
  const message = extractErrorMessage(payload);

  if (!message) {
    return FALLBACK_ERROR_MESSAGE;
  }

  const normalizedMessage = message.replace(/\s+/g, " ").trim();

  if (isSafeErrorMessage(normalizedMessage, token)) {
    return normalizedMessage;
  }

  return FALLBACK_ERROR_MESSAGE;
}

function extractErrorMessage(payload: unknown): string | null {
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

  if (
    candidate.error &&
    typeof candidate.error === "object" &&
    "message" in candidate.error
  ) {
    const nestedError = candidate.error as {
      message?: unknown;
    };

    if (typeof nestedError.message === "string") {
      return nestedError.message;
    }
  }

  if (typeof candidate.details === "string") {
    return candidate.details;
  }

  return null;
}

function isSafeErrorMessage(message: string, token: string) {
  if (!message || message.length > 180) {
    return false;
  }

  const lowercaseMessage = message.toLowerCase();
  const lowercaseToken = token.trim().toLowerCase();

  if (
    lowercaseToken &&
    lowercaseMessage.includes(lowercaseToken)
  ) {
    return false;
  }

  const unsafePatterns = [
    /stack trace/i,
    /exception at/i,
    /node_modules/i,
    /mongodb/i,
    /mongoose/i,
    /jwt[_\s-]?secret/i,
    /internal server path/i,
    /\/home\/.+\//i,
    /[a-z]:\\.+\\/i,
    /<script/i,
  ];

  return !unsafePatterns.some((pattern) => pattern.test(message));
}
