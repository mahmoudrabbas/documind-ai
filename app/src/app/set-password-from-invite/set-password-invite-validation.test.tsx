// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  t: vi.fn((key: string) => key),
  searchParams: new URLSearchParams("token=valid-token-123"),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  apiClient: mocks.apiClient,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ t: mocks.t, dir: "ltr" }),
}));

vi.mock("@/components/auth/auth-page-shell", () => ({
  AuthBrand: () => null,
  AuthPageShell: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/auth/rate-limit-alert", () => ({
  RateLimitAlert: () => null,
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import SetPasswordFromInviteClient from "./set-password-from-invite-client";

describe("SetPasswordFromInviteClient", () => {
  beforeEach(() => {
    mocks.apiClient.mockReset();
    mocks.t.mockClear();
    mocks.searchParams = new URLSearchParams("token=valid-token-123");
  });

  it("performs exactly one validation request on a normal page load", async () => {
    mocks.apiClient.mockResolvedValue({
      data: {
        companyName: "Acme Consulting",
        email: "invitee@acme.com",
        role: "EMPLOYEE",
        expiresAt: "2026-12-31T23:59:59.000Z",
      },
    });

    render(<SetPasswordFromInviteClient />);

    await waitFor(() => {
      expect(mocks.apiClient).toHaveBeenCalledTimes(1);
    });

    expect(mocks.apiClient).toHaveBeenCalledWith(
      "/users/validate-invite",
      expect.objectContaining({
        method: "POST",
        auth: false,
        redirectOnAuthFailure: false,
        body: { token: "valid-token-123" },
      }),
    );

    await screen.findByText("invitee@acme.com");

    expect(mocks.apiClient).toHaveBeenCalledTimes(1);
  });

  it("does not trigger a validation request when the token is missing", () => {
    mocks.searchParams = new URLSearchParams("");
    mocks.apiClient.mockResolvedValue({ data: {} });

    render(<SetPasswordFromInviteClient />);

    expect(mocks.apiClient).not.toHaveBeenCalled();
  });
});