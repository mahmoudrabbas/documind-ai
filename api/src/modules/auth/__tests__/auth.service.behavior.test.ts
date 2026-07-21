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
  createTenant: vi.fn(),
  createUser: vi.fn(),
  deleteTenantById: vi.fn(),
  deleteUserById: vi.fn(),
  findTenantBySlug: vi.fn(),
  findUserDocumentByEmail: vi.fn(),
  restoreUserVerificationTokenIfCurrent: vi.fn(),
  updateUserVerificationToken: vi.fn(),
}));

const mailerMocks = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
}));

const billingMocks = vi.hoisted(() => ({
  provisionSubscription: vi.fn(),
}));

const tokenMocks = vi.hoisted(() => ({
  createEmailVerificationToken: vi.fn(),
}));

const mongooseMocks = vi.hoisted(() => ({
  startSession: vi.fn(async () => ({
    withTransaction: async (
      callback: () => Promise<void>,
    ) => callback(),
    endSession: async () => undefined,
  })),
}));

vi.mock("mongoose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mongoose")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: mongooseMocks.startSession,
    },
    startSession: mongooseMocks.startSession,
  };
});

vi.mock("../auth.repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth.repository.js")>();
  return {
    ...actual,
    createTenant: repoMocks.createTenant,
    createUser: repoMocks.createUser,
    deleteTenantById: repoMocks.deleteTenantById,
    deleteUserById: repoMocks.deleteUserById,
    findTenantBySlug: repoMocks.findTenantBySlug,
    findUserDocumentByEmail: repoMocks.findUserDocumentByEmail,
    restoreUserVerificationTokenIfCurrent:
      repoMocks.restoreUserVerificationTokenIfCurrent,
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

vi.mock("../../billing/registration.service.js", () => ({
  provisionSubscription: billingMocks.provisionSubscription,
}));

const globalSettingsMocks = vi.hoisted(() => ({
  getGlobalSettings: vi.fn().mockResolvedValue({
    supportEmail: "support@example.com",
    maintenanceMode: false,
    allowRegistrations: true,
    defaultTrialDays: 0,
    dataRetentionDays: 365,
  }),
  invalidateGlobalSettingsCache: vi.fn(),
}));
vi.mock("../../platform/global-settings.js", () => globalSettingsMocks);

vi.mock("../emailVerificationToken.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../emailVerificationToken.js")>();
  return {
    ...actual,
    createEmailVerificationToken: tokenMocks.createEmailVerificationToken,
  };
});

import { registerTenantAndAdmin, resendVerificationEmail } from "../auth.service.js";

describe("auth.service targeted behavior", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mongooseMocks.startSession.mockReset().mockResolvedValue({
      withTransaction: async (
        callback: () => Promise<void>,
      ) => callback(),
      endSession: async () => undefined,
    });

    repoMocks.createTenant.mockReset();
    repoMocks.createUser.mockReset();
    repoMocks.deleteTenantById.mockReset().mockResolvedValue(undefined);
    repoMocks.deleteUserById.mockReset().mockResolvedValue(undefined);
    repoMocks.findTenantBySlug.mockReset();
    repoMocks.findUserDocumentByEmail.mockReset();
    repoMocks.restoreUserVerificationTokenIfCurrent
      .mockReset()
      .mockResolvedValue(true);
    repoMocks.updateUserVerificationToken.mockReset().mockResolvedValue(undefined);

    mailerMocks.sendVerificationEmail.mockReset().mockResolvedValue(undefined);
    billingMocks.provisionSubscription.mockReset().mockResolvedValue(undefined);
    tokenMocks.createEmailVerificationToken.mockReset().mockReturnValue({
      token: "verification-token",
      jti: "verification-jti",
      expiresAt: new Date("2026-07-18T12:30:00.000Z"),
      tokenHash: "verification-token-hash",
    });
  });

  describe("resendVerificationEmail", () => {
    it("restores the previous token state with compare-and-set after ordinary mail failure", async () => {
      repoMocks.findTenantBySlug.mockResolvedValue({
        _id: { toString: () => "tenant-1" },
        name: "Acme",
        slug: "acme",
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
      mailerMocks.sendVerificationEmail.mockRejectedValue(new Error("smtp down"));

      await expect(
        resendVerificationEmail({
          companySlug: "acme",
          email: "user@example.com",
        }),
      ).rejects.toThrow("smtp down");

      expect(repoMocks.updateUserVerificationToken).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "verification-token-hash",
        new Date("2026-07-18T12:30:00.000Z"),
      );
      expect(
        repoMocks.restoreUserVerificationTokenIfCurrent,
      ).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "verification-token-hash",
        new Date("2026-07-18T12:30:00.000Z"),
        "previous-hash",
        new Date("2026-07-18T12:00:00.000Z"),
      );
    });

    it("keeps the new token when send succeeds", async () => {
      repoMocks.findTenantBySlug.mockResolvedValue({
        _id: { toString: () => "tenant-1" },
        name: "Acme",
        slug: "acme",
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

      await expect(
        resendVerificationEmail({
          companySlug: "acme",
          email: "user@example.com",
        }),
      ).resolves.toEqual({
        success: true,
        message:
          "If the account exists and requires verification, we'll send an email. Already verified? You can sign in.",
      });

      expect(
        repoMocks.restoreUserVerificationTokenIfCurrent,
      ).not.toHaveBeenCalled();
    });

    it("does not blindly overwrite a newer token when rollback compare-and-set no longer matches", async () => {
      repoMocks.findTenantBySlug.mockResolvedValue({
        _id: { toString: () => "tenant-1" },
        name: "Acme",
        slug: "acme",
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
      repoMocks.restoreUserVerificationTokenIfCurrent.mockResolvedValue(false);
      mailerMocks.sendVerificationEmail.mockRejectedValue(new Error("smtp down"));

      await expect(
        resendVerificationEmail({
          companySlug: "acme",
          email: "user@example.com",
        }),
      ).rejects.toThrow("smtp down");

      expect(
        repoMocks.restoreUserVerificationTokenIfCurrent,
      ).toHaveBeenCalledTimes(1);
      expect(repoMocks.updateUserVerificationToken).toHaveBeenCalledTimes(1);
    });
  });

  describe("registerTenantAndAdmin", () => {
    it("does not send verification email before provisioning succeeds", async () => {
      repoMocks.createTenant.mockResolvedValue({
        _id: { toString: () => "tenant-1" },
        name: "Acme",
        slug: "acme",
        status: "pending_verification",
        plan: "free",
        isSystemTenant: false,
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
      });
      repoMocks.createUser.mockResolvedValue({
        _id: { toString: () => "user-1" },
        tenantId: { toString: () => "tenant-1" },
        name: "Admin User",
        email: "admin@example.com",
        role: "COMPANY_ADMIN",
        status: "pending_email_verification",
        emailVerified: false,
        emailVerifiedAt: null,
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
      });
      billingMocks.provisionSubscription.mockRejectedValue(
        new Error("subscription failed"),
      );

      await expect(
        registerTenantAndAdmin({
          companyName: "Acme",
          companySlug: "acme",
          adminName: "Admin User",
          email: "admin@example.com",
          password: "StrongPass123!",
        }),
      ).rejects.toMatchObject({ code: "REGISTRATION_FAILED" });

      expect(mailerMocks.sendVerificationEmail).not.toHaveBeenCalled();
      expect(repoMocks.deleteUserById).toHaveBeenCalledWith("user-1");
      expect(repoMocks.deleteTenantById).toHaveBeenCalledWith("tenant-1");
    });

    it("sends one verification email after provisioning succeeds", async () => {
      repoMocks.createTenant.mockResolvedValue({
        _id: { toString: () => "tenant-1" },
        name: "Acme",
        slug: "acme",
        status: "pending_verification",
        plan: "free",
        isSystemTenant: false,
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
      });
      repoMocks.createUser.mockResolvedValue({
        _id: { toString: () => "user-1" },
        tenantId: { toString: () => "tenant-1" },
        name: "Admin User",
        email: "admin@example.com",
        role: "COMPANY_ADMIN",
        status: "pending_email_verification",
        emailVerified: false,
        emailVerifiedAt: null,
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
      });

      await expect(
        registerTenantAndAdmin({
          companyName: "Acme",
          companySlug: "acme",
          adminName: "Admin User",
          email: "admin@example.com",
          password: "StrongPass123!",
        }),
      ).resolves.toMatchObject({
        tenant: { slug: "acme" },
        user: { email: "admin@example.com" },
      });

      expect(
        billingMocks.provisionSubscription.mock.invocationCallOrder[0],
      ).toBeLessThan(
        mailerMocks.sendVerificationEmail.mock.invocationCallOrder[0],
      );
      expect(mailerMocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it("preserves the provisioned account when verification email delivery fails", async () => {
      repoMocks.createTenant.mockResolvedValue({
        _id: { toString: () => "tenant-1" },
        name: "Acme",
        slug: "acme",
        status: "pending_verification",
        plan: "free",
        isSystemTenant: false,
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
      });
      repoMocks.createUser.mockResolvedValue({
        _id: { toString: () => "user-1" },
        tenantId: { toString: () => "tenant-1" },
        name: "Admin User",
        email: "admin@example.com",
        role: "COMPANY_ADMIN",
        status: "pending_email_verification",
        emailVerified: false,
        emailVerifiedAt: null,
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
      });
      mailerMocks.sendVerificationEmail.mockRejectedValue(
        new Error("smtp down"),
      );

      await expect(
        registerTenantAndAdmin({
          companyName: "Acme",
          companySlug: "acme",
          adminName: "Admin User",
          email: "admin@example.com",
          password: "StrongPass123!",
        }),
      ).resolves.toMatchObject({
        tenant: { slug: "acme" },
        user: { email: "admin@example.com" },
      });

      expect(repoMocks.deleteUserById).not.toHaveBeenCalled();
      expect(repoMocks.deleteTenantById).not.toHaveBeenCalled();
      expect(repoMocks.updateUserVerificationToken).toHaveBeenCalledTimes(1);
    });
  });
});
