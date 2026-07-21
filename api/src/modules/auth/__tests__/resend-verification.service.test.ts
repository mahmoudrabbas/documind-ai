import { beforeEach, describe, expect, it, vi } from "vitest";

const configMocks = vi.hoisted(() => ({
  config: {
    NODE_ENV: "test",
    APP_FRONTEND_URL: "http://localhost:3000",
    STRIPE_SUCCESS_URL: "",
    STRIPE_CANCEL_URL: "",
    EMAIL_VERIFICATION_BASE_URL: "http://localhost:3000/verify",
    PASSWORD_RESET_BASE_URL: "http://localhost:3000/reset",
    JWT_SECRET: "test-jwt-secret",
    JWT_REFRESH_SECRET: "test-jwt-refresh-secret",
    JWT_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    EMAIL_VERIFICATION_JWT_SECRET: "test-email-verification-secret",
    EMAIL_VERIFICATION_JWT_EXPIRES_IN: "24h",
    PASSWORD_RESET_JWT_SECRET: "test-password-reset-secret",
    PASSWORD_RESET_JWT_EXPIRES_IN: "15m",
    EMAIL_WEBHOOK_SECRET: "test-email-webhook-secret",
    MONGODB_URI: "mongodb://localhost:27017/test",
    REDIS_URL: "redis://localhost:6379",
  },
}));
vi.mock("../../../config/index.js", () => configMocks);

const repoMocks = vi.hoisted(() => ({
  findTenantBySlug: vi.fn(),
  findUserDocumentByEmail: vi.fn(),
  updateUserVerificationToken: vi.fn(),
}));

const mailerMocks = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("../auth.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth.repository.js")>();
  return {
    ...actual,
    findTenantBySlug: repoMocks.findTenantBySlug,
    findUserDocumentByEmail: repoMocks.findUserDocumentByEmail,
    updateUserVerificationToken: repoMocks.updateUserVerificationToken,
  };
});

vi.mock("../auth.mailer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth.mailer.js")>();
  return {
    ...actual,
    sendVerificationEmail: mailerMocks.sendVerificationEmail,
  };
});

import { resendVerificationEmail } from "../auth.service.js";

describe("resendVerificationEmail", () => {
  beforeEach(() => {
    repoMocks.findTenantBySlug.mockReset();
    repoMocks.findUserDocumentByEmail.mockReset();
    repoMocks.updateUserVerificationToken.mockReset().mockResolvedValue(undefined);
    mailerMocks.sendVerificationEmail.mockReset().mockResolvedValue(undefined);
  });

  it("generates one replacement token and sends one email for an eligible unverified account", async () => {
    repoMocks.findTenantBySlug.mockResolvedValue({
      _id: { toString: () => "tenant-1" },
      name: "Acme",
      status: "pending_verification",
      isSystemTenant: false,
    });
    repoMocks.findUserDocumentByEmail.mockResolvedValue({
      _id: { toString: () => "user-1" },
      tenantId: { toString: () => "tenant-1" },
      email: "user@example.com",
      name: "User",
      status: "pending_email_verification",
      emailVerified: false,
      emailVerifiedAt: null,
      emailVerificationTokenHash: "previous-hash",
      emailVerificationExpiresAt: new Date("2026-07-18T12:00:00.000Z"),
    });

    const result = await resendVerificationEmail({
      companySlug: " Acme-Co ",
      email: "USER@example.com ",
    });

    expect(result).toEqual({
      success: true,
      message:
        "If the account exists and requires verification, we'll send an email. Already verified? You can sign in.",
    });
    expect(repoMocks.findTenantBySlug).toHaveBeenCalledWith("acme-co");
    expect(repoMocks.findUserDocumentByEmail).toHaveBeenCalledWith(
      "tenant-1",
      "user@example.com",
    );
    expect(repoMocks.updateUserVerificationToken).toHaveBeenCalledTimes(1);
    expect(mailerMocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("does not create a token or send email for already verified or disabled accounts", async () => {
    repoMocks.findTenantBySlug.mockResolvedValue({
      _id: { toString: () => "tenant-1" },
      name: "Acme",
      status: "active",
      isSystemTenant: false,
    });

    for (const user of [
      {
        _id: { toString: () => "verified-user" },
        tenantId: { toString: () => "tenant-1" },
        email: "verified@example.com",
        name: "Verified",
        status: "active",
        emailVerified: true,
        emailVerifiedAt: new Date("2026-07-18T12:00:00.000Z"),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
      {
        _id: { toString: () => "disabled-user" },
        tenantId: { toString: () => "tenant-1" },
        email: "disabled@example.com",
        name: "Disabled",
        status: "disabled",
        emailVerified: false,
        emailVerifiedAt: null,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    ]) {
      repoMocks.findUserDocumentByEmail.mockResolvedValueOnce(user);
      await expect(
        resendVerificationEmail({
          companySlug: "acme-co",
          email: user.email,
        }),
      ).resolves.toEqual({
        success: true,
        message:
          "If the account exists and requires verification, we'll send an email. Already verified? You can sign in.",
      });
    }

    expect(repoMocks.updateUserVerificationToken).not.toHaveBeenCalled();
    expect(mailerMocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("does not create a token or send email for unknown tenants, unknown users, suspended tenants, or system tenants", async () => {
    repoMocks.findTenantBySlug
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: { toString: () => "tenant-1" },
        name: "Acme",
        status: "pending_verification",
        isSystemTenant: false,
      })
      .mockResolvedValueOnce({
        _id: { toString: () => "tenant-2" },
        name: "Suspended",
        status: "suspended",
        isSystemTenant: false,
      })
      .mockResolvedValueOnce({
        _id: { toString: () => "tenant-3" },
        name: "System",
        status: "active",
        isSystemTenant: true,
      });
    repoMocks.findUserDocumentByEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: { toString: () => "user-2" },
        tenantId: { toString: () => "tenant-2" },
        email: "pending@example.com",
        name: "Pending",
        status: "pending_email_verification",
        emailVerified: false,
        emailVerifiedAt: null,
        emailVerificationTokenHash: "existing-hash",
        emailVerificationExpiresAt: new Date("2026-07-18T12:00:00.000Z"),
      });

    for (const payload of [
      { companySlug: "missing", email: "user@example.com" },
      { companySlug: "acme", email: "missing@example.com" },
      { companySlug: "suspended", email: "pending@example.com" },
      { companySlug: "documind.ai", email: "platform@example.com" },
    ]) {
      await expect(resendVerificationEmail(payload)).resolves.toEqual({
        success: true,
        message:
          "If the account exists and requires verification, we'll send an email. Already verified? You can sign in.",
      });
    }

    expect(repoMocks.updateUserVerificationToken).not.toHaveBeenCalled();
    expect(mailerMocks.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
