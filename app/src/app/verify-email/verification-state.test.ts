import { describe, expect, it } from "vitest";

import {
  FALLBACK_ERROR_MESSAGE,
  LOADING_VERIFICATION,
  getDisplayedVerification,
  getSafeBackendErrorMessage,
  getVerificationActionLabel,
  getVerificationTitle,
} from "./verification-state";

describe("verify-email view state", () => {
  it("uses a polished loading title while verification is pending", () => {
    expect(
      getVerificationTitle(LOADING_VERIFICATION.status),
    ).toBe("Verifying your email");
  });

  it("shows the sign-in action for successful verification", () => {
    expect(getVerificationTitle("success")).toBe(
      "Email verified successfully",
    );

    expect(getVerificationActionLabel("success")).toBe(
      "Continue to sign in",
    );
  });

  it("shows a friendly failure state when the token is missing", () => {
    const displayed = getDisplayedVerification(
      "",
      LOADING_VERIFICATION,
    );

    expect(displayed.status).toBe("error");

    expect(displayed.message).toContain(
      "verification token is missing",
    );

    expect(getVerificationTitle(displayed.status)).toBe(
      "Verification failed",
    );

    expect(getVerificationActionLabel(displayed.status)).toBe(
      "Back to sign in",
    );
  });

  it("does not expose a token returned inside a backend message", () => {
    expect(
      getSafeBackendErrorMessage(
        {
          message: "Invalid token secret-token",
        },
        "secret-token",
      ),
    ).toBe(FALLBACK_ERROR_MESSAGE);
  });

  it("allows safe user-facing backend messages", () => {
    expect(
      getSafeBackendErrorMessage(
        {
          message: "Link expired.",
        },
        "token",
      ),
    ).toBe("Link expired.");
  });

  it("supports a nested backend error message", () => {
    expect(
      getSafeBackendErrorMessage(
        {
          error: {
            message: "Verification link has already been used.",
          },
        },
        "token",
      ),
    ).toBe("Verification link has already been used.");
  });

  it("does not expose stack traces or internal implementation details", () => {
    expect(
      getSafeBackendErrorMessage(
        {
          message:
            "MongoDB exception at node_modules/auth/service.js",
        },
        "token",
      ),
    ).toBe(FALLBACK_ERROR_MESSAGE);
  });
});
