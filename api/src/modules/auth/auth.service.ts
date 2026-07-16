import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { config } from "../../config/index.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  EMAIL_ALREADY_EXISTS,
  EMAIL_NOT_VERIFIED,
  ACCOUNT_NOT_ACTIVE,
  INVALID_CREDENTIALS,
  INVALID_OR_EXPIRED_VERIFICATION_TOKEN,
  REFRESH_TOKEN_REUSED,
  REGISTRATION_FAILED,
  SESSION_EXPIRED,
  TENANT_NOT_ACTIVE,
  TENANT_ALREADY_EXISTS,
  UNAUTHORIZED,
  PASSWORD_RESET_FAILED,
} from "../../common/errors/errorCodes.js";
import type {
  AuthTokenClaims,
  LoginResult,
  MeResult,
  RefreshRotationResult,
  RefreshTokenContext,
  RegisterResult,
  RegisterInput,
  VerifyEmailResult,
  AuthIdentity,
  ForgotPasswordResult,
  ResetPasswordResult,
  CompleteTrialResult,
} from "./auth.types.js";
import { sendVerificationEmail, sendForgotPasswordEmail } from "./auth.mailer.js";
import { createAuditLog } from "../audit/audit.repository.js";
import type { AuditEventInput } from "../audit/audit.types.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import {
  createEmailVerificationToken,
  hashVerificationJti,
  verifyEmailVerificationToken,
} from "./emailVerificationToken.js";
import {
  activateTenantIfPendingVerification,
  claimRefreshTokenForRotation,
  createTenant,
  createUser,
  createRefreshTokenRecord,
  deleteTenantById,
  deleteUserById,
  findTenantById,
  findTenantBySlug,
  findRefreshTokenRecord,
  findUserDocumentByEmail,
  findUserDocumentById,
  findUserDocumentByTenantAndEmail,
  findSuperAdminByEmail,
  findUserByTenantAndId,
  markReuseAndRevokeTokenFamily,
  revokeAllRefreshTokensForTenantUser,
  revokeRefreshToken,
  setRefreshTokenReplacement,
  updateUserVerificationToken,
  updateUserPasswordResetToken,
  findUserByTenantAndIdWithPasswordResetToken,
  consumePasswordResetTokenAndUpdatePassword,
} from "./auth.repository.js";
import {
  validateRegisterInput,
  validateLoginInput,
  validateSuperAdminLoginInput,
  validateResendVerificationEmailInput,
  validateVerifyEmailInput,
  validateForgotPasswordInput,
  validateResetPasswordInput,
} from "./auth.validator.js";
import {
  createPasswordResetToken,
  hashPasswordResetJti,
  verifyPasswordResetToken,
} from "./passwordResetToken.js";
import { hashPassword, verifyPassword } from "./passwordHashing.js";
import { signJwt, verifyJwt, durationToMilliseconds } from "./jwtTokens.js";
import {
  hashRefreshToken,
  hashRefreshTokenJti,
} from "./refreshTokenHashing.js";

function safeAuditLog(input: AuditEventInput) {
  createAuditLog(input as unknown as Record<string, unknown>).catch((err) => {
    console.error("[audit-log-failed]", err);
  });
}

type CreatedTenantRecord = {
  _id: { toString(): string };
  id?: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt?: Date;
};

type CreatedUserRecord = {
  _id: { toString(): string };
  id?: string;
  tenantId: unknown;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt?: Date;
};

function normalizeSlug(companySlug: string | undefined, companyName: string) {
  const candidate = (companySlug ?? companyName)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return (
    candidate ||
    companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: number }).code === 11000,
  );
}

function serializeTenant(tenant: CreatedTenantRecord) {
  return {
    id: tenant.id ?? tenant._id.toString(),
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    plan: tenant.plan,
    createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function serializeUser(user: CreatedUserRecord) {
  return {
    id: user.id ?? user._id.toString(),
    tenantId: user.tenantId?.toString() ?? "",
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function serializeVerifiedUser(user: CreatedUserRecord) {
  return {
    id: user.id ?? user._id.toString(),
    tenantId: user.tenantId?.toString() ?? "",
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
  };
}

function buildVerificationUrl(token: string) {
  const url = new URL("/verify-email", config.APP_FRONTEND_URL);

  url.searchParams.set("token", token);

  return url.toString();
}

function buildResetPasswordUrl(token: string, slug: string) {
  const url = new URL("/reset-password", config.APP_FRONTEND_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("slug", slug);
  return url.toString();
}

export async function forgotPassword(
  input: unknown,
): Promise<ForgotPasswordResult> {
  const payload = validateForgotPasswordInput(input);
  const genericMessage =
    "If an account matches the provided company and email, password reset instructions will be sent.";

  const tenant = await findTenantBySlug(payload.slug);
  if (!tenant) {
    return { success: true, message: genericMessage };
  }
  const tenantId = tenant._id.toString();

  const user = await findUserDocumentByTenantAndEmail(tenantId, payload.email);

  if (
    !user ||
    user.status !== "active"
  ) {
    return { success: true, message: genericMessage };
  }

  const resetToken = createPasswordResetToken({
    userId: user.id,
    tenantId,
  });

  await updateUserPasswordResetToken(
    tenantId,
    user.id,
    resetToken.tokenHash,
    resetToken.expiresAt,
  );

  try {
    await sendForgotPasswordEmail({
      to: user.email,
      userName: user.name,
      companyName: tenant.name,
      resetUrl: buildResetPasswordUrl(resetToken.token, tenant.slug),
    });
  } catch {
    // Keep the public response indistinguishable when delivery is unavailable.
  }

  return { success: true, message: genericMessage };
}

export async function resetPassword(
  input: unknown,
): Promise<ResetPasswordResult> {
  const payload = validateResetPasswordInput(input);
  const invalidTokenError = new AppError(
    400,
    PASSWORD_RESET_FAILED,
    "Invalid or expired password reset token",
  );

  try {
    const tokenPayload = verifyPasswordResetToken(payload.token);
    const tenant = await findTenantBySlug(payload.slug);
    if (!tenant || tokenPayload.tenantId !== tenant._id.toString()) {
      throw invalidTokenError;
    }
    const tenantId = tenant._id.toString();

    const user = await findUserByTenantAndIdWithPasswordResetToken(tenantId, tokenPayload.sub);

    if (
      !user ||
      !user.passwordResetTokenHash ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() <= Date.now()
    ) {
      throw invalidTokenError;
    }

    if (
      user.passwordResetTokenHash !== hashPasswordResetJti(tokenPayload.jti)
    ) {
      throw invalidTokenError;
    }

    const passwordHash = await hashPassword(payload.password);

    const consumedUser = await consumePasswordResetTokenAndUpdatePassword(
      tenantId,
      user.id,
      user.passwordResetTokenHash,
      passwordHash,
    );
    if (!consumedUser) {
      throw invalidTokenError;
    }
    await revokeAllRefreshTokensForTenantUser(user.id, tenantId, new Date());

    return {
      success: true,
      message: "Password has been reset successfully. You can now sign in.",
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw invalidTokenError;
  }
}

export async function registerTenantAndAdmin(
  input: unknown,
): Promise<RegisterResult> {
  const payload = validateRegisterInput(input);

  const normalizedEmail = payload.email.toLowerCase().trim();
  const normalizedSlug = normalizeSlug(
    payload.companySlug,
    payload.companyName,
  );

  if (["__documind_platform__", "documind-ai"].includes(normalizedSlug)) {
    throw new AppError(409, TENANT_ALREADY_EXISTS, "Tenant already exists");
  }

  const tenantExists = await findTenantBySlug(normalizedSlug);

  if (tenantExists) {
    throw new AppError(409, TENANT_ALREADY_EXISTS, "Tenant already exists");
  }

  const passwordHash = await hashPassword(payload.password);

  const tenantPayload: Parameters<typeof createTenant>[0] = {
    name: payload.companyName.trim(),
    slug: normalizedSlug,
    status: "pending_verification",
    plan: "free",
    ...(payload.packageCode ? { selectedPackageCode: payload.packageCode } : {}),
  };

  const userPayload = {
    tenantId: "",
    name: payload.adminName.trim(),
    email: normalizedEmail,
    passwordHash,
    role: "COMPANY_ADMIN",
    status: "pending_email_verification",
    emailVerified: false,
    emailVerifiedAt: null,
  };

  const created: {
    tenant: CreatedTenantRecord | null;
    user: CreatedUserRecord | null;
  } = {
    tenant: null,
    user: null,
  };

  const session = await mongoose.startSession();

  try {
    try {
      await session.withTransaction(async () => {
        created.tenant = await createTenant(tenantPayload, session);

        userPayload.tenantId = created.tenant._id.toString();

        created.user = await createUser(userPayload, session);
      });
    } catch (error) {
      const isTransactionUnsupported =
        error instanceof Error &&
        /replica set|transaction|retryable writes/i.test(error.message);

      if (isTransactionUnsupported) {
        created.tenant = await createTenant(tenantPayload);

        userPayload.tenantId = created.tenant._id.toString();

        created.user = await createUser(userPayload);
      } else {
        throw error;
      }
    }

    if (!created.tenant || !created.user) {
      throw new AppError(500, REGISTRATION_FAILED, "Registration failed");
    }

    const verificationToken = await createEmailVerificationTokenForUser(
      created.user,
    );

    await sendVerificationEmail({
      to: created.user.email,
      adminName: created.user.name,
      companyName: created.tenant.name,
      verificationUrl: buildVerificationUrl(verificationToken),
    });

    return {
      tenant: serializeTenant(created.tenant),
      user: serializeUser(created.user),
    };
  } catch (error) {
    if (created.user) {
      await deleteUserById(created.user._id.toString());
    }

    if (created.tenant) {
      const tenantId = created.tenant._id.toString();

      await deleteTenantById(tenantId);
    }

    if (isDuplicateKeyError(error)) {
      if (error && typeof error === "object" && "keyPattern" in error) {
        const keyPattern = error.keyPattern as Record<string, unknown>;

        if (keyPattern.slug) {
          throw new AppError(
            409,
            TENANT_ALREADY_EXISTS,
            "Tenant already exists",
          );
        }

        if (keyPattern.tenantId && keyPattern.email) {
          throw new AppError(
            409,
            EMAIL_ALREADY_EXISTS,
            "Email already exists in this tenant",
          );
        }

        if (keyPattern.email) {
          throw new AppError(409, EMAIL_ALREADY_EXISTS, "Email already exists");
        }
      }
      throw new AppError(
        409,
        EMAIL_ALREADY_EXISTS,
        "Email already exists in this tenant",
      );
    }

    if (error instanceof AppError) {
      throw error;
    }

    console.error("[auth-register]", error);

    throw new AppError(500, REGISTRATION_FAILED, "Registration failed");
  } finally {
    await session.endSession();
  }
}

export async function verifyEmail(input: unknown): Promise<VerifyEmailResult> {
  const payload = validateVerifyEmailInput(input);
  const invalidTokenError = new AppError(
    400,
    INVALID_OR_EXPIRED_VERIFICATION_TOKEN,
    "Invalid or expired verification token",
  );

  try {
    const tokenPayload = verifyEmailVerificationToken(payload.token);

    if (tokenPayload.purpose !== "email_verification") {
      throw invalidTokenError;
    }

    const user = await findUserDocumentById(tokenPayload.sub);

    if (
      !user ||
      user.tenantId.toString() !== tokenPayload.tenantId ||
      user.email !== tokenPayload.email
    ) {
      throw invalidTokenError;
    }

    if (
      user.emailVerified ||
      user.status !== "pending_email_verification" ||
      !user.emailVerificationTokenHash ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() <= Date.now()
    ) {
      throw invalidTokenError;
    }

    if (
      user.emailVerificationTokenHash !== hashVerificationJti(tokenPayload.jti)
    ) {
      throw invalidTokenError;
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.status = "active";
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;

    await user.save();

    const activatedTenant =
      (await activateTenantIfPendingVerification(user.tenantId.toString())) ??
      (await findTenantById(user.tenantId.toString()));

    if (!activatedTenant) {
      throw invalidTokenError;
    }

    return {
      user: serializeVerifiedUser(user),
      tenant: {
        id: activatedTenant._id.toString(),
        status: activatedTenant.status,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw invalidTokenError;
  }
}

export async function resendVerificationEmail(input: unknown) {
  const payload = validateResendVerificationEmailInput(input);
  const genericResponse = {
    success: true,
    message:
      "If the email exists and is not verified, a verification email has been sent",
  };

  const user = await findUserDocumentByEmail(payload.email);

  if (
    !user ||
    user.emailVerified ||
    user.status !== "pending_email_verification"
  ) {
    return genericResponse;
  }

  const token = await createEmailVerificationTokenForUser(user);
  const tenant = await findTenantById(user.tenantId.toString());

  await sendVerificationEmail({
    to: user.email,
    adminName: user.name,
    companyName: tenant?.name ?? "your company",
    verificationUrl: buildVerificationUrl(token),
  });

  return genericResponse;
}

export async function completeTrial(
  identity: AuthIdentity,
): Promise<CompleteTrialResult> {
  const tenant = await findTenantById(identity.tenantId);

  if (!tenant) {
    throw new AppError(404, "NOT_FOUND", "Tenant not found");
  }

  const packageCode = tenant.selectedPackageCode;
  if (!packageCode) {
    throw new AppError(400, "NO_PENDING_TRIAL", "No pending trial package found");
  }

  if (tenant.plan !== "free") {
    throw new AppError(400, "TRIAL_ALREADY_ACTIVE", "A plan is already active for this tenant");
  }

  const pkg = await PackageModel.findOne({ code: packageCode, active: true }).lean().exec();

  if (!pkg) {
    throw new AppError(400, "INVALID_PACKAGE", "Selected package is no longer available");
  }

  const existingSubscription = await SubscriptionModel.findOne({
    tenantId: tenant._id,
  }).lean().exec();

  if (existingSubscription) {
    throw new AppError(400, "SUBSCRIPTION_EXISTS", "A subscription already exists for this tenant");
  }

  const now = new Date();
  const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const subscription = await SubscriptionModel.create({
    tenantId: tenant._id,
    packageId: pkg._id,
    packageVersion: pkg.version,
    status: "trialing",
    startedAt: now,
    renewsAt: trialEnd,
  });

  await TenantModel.updateOne(
    { _id: tenant._id },
    { $set: { plan: "trial" }, $unset: { selectedPackageCode: "" } },
  ).exec();

  return {
    success: true,
    subscription: {
      id: subscription._id.toString(),
      packageId: pkg._id.toString(),
      packageName: pkg.name,
      status: subscription.status,
      startedAt: subscription.startedAt.toISOString(),
    },
  };
}

function invalidCredentialsError() {
  return new AppError(
    401,
    INVALID_CREDENTIALS,
    "Invalid company, email, or password",
  );
}

function assertAccountCanSignIn(
  user: CreatedUserRecord,
  tenant: CreatedTenantRecord,
) {
  if (!user.emailVerified || user.status === "pending_email_verification") {
    throw new AppError(
      403,
      EMAIL_NOT_VERIFIED,
      "Please verify your email before signing in",
    );
  }

  if (user.status !== "active") {
    throw new AppError(403, ACCOUNT_NOT_ACTIVE, "Account is not active");
  }

  if (tenant.status !== "active") {
    throw new AppError(403, TENANT_NOT_ACTIVE, "Tenant is not active");
  }
}

function createAccessToken(
  user: CreatedUserRecord,
  tenant: CreatedTenantRecord,
) {
  return signJwt(
    {
      sub: user.id ?? user._id.toString(),
      tenantId: tenant.id ?? tenant._id.toString(),
      role: user.role,
      email: user.email,
      type: "access",
    },
    config.JWT_SECRET,
    config.JWT_EXPIRES_IN,
  );
}

export async function login(
  input: unknown,
  context: RefreshTokenContext = {},
): Promise<LoginResult> {
  const payload = validateLoginInput(input);
  const tenant = await findTenantBySlug(payload.companySlug);

  if (!tenant) {
    throw invalidCredentialsError();
  }

  const user = await findUserDocumentByTenantAndEmail(
    tenant._id.toString(),
    payload.email,
  );

  if (
    !user ||
    !user.passwordHash ||
    !(await verifyPassword(user.passwordHash, payload.password))
  ) {
    safeAuditLog({
      tenantId: tenant._id.toString(),
      resourceType: "User",
      resourceId: payload.email,
      action: "AUTH_LOGIN_FAILURE",
      actorId: user?._id?.toString() ?? "",
      actorEmail: payload.email,
      actorRole: user?.role ?? "",
      changes: { reason: "invalid_credentials", ip: context.ip },
      metadata: { userId: user?._id?.toString() ?? "" },
    });
    throw invalidCredentialsError();
  }

  try {
    assertAccountCanSignIn(user, tenant);
  } catch (error) {
    safeAuditLog({
      tenantId: tenant._id.toString(),
      resourceType: "User",
      resourceId: payload.email,
      action: "AUTH_LOGIN_FAILURE",
      actorId: user._id.toString(),
      actorEmail: payload.email,
      actorRole: user.role,
      changes: {
        reason: error instanceof Error ? error.message : "account_not_active",
        ip: context.ip,
      },
      metadata: { userId: user._id.toString() },
    });
    throw error;
  }

  // Activate trial subscription if registration included a packageCode.
  if (tenant.selectedPackageCode && tenant.plan === "free") {
    try {
      const trialPkg = await PackageModel.findOne({ code: tenant.selectedPackageCode, active: true }).lean().exec();
      if (trialPkg) {
        const existingSub = await SubscriptionModel.findOne({ tenantId: tenant._id }).lean().exec();
        if (!existingSub) {
          const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await SubscriptionModel.create({
            tenantId: tenant._id,
            packageId: trialPkg._id,
            packageVersion: trialPkg.version,
            status: "trialing",
            startedAt: new Date(),
            renewsAt: trialEnd,
          });
          await TenantModel.updateOne(
            { _id: tenant._id },
            { $set: { plan: "trial" }, $unset: { selectedPackageCode: "" } },
          ).exec();
          tenant.plan = "trial";
        }
      }
    } catch {
      // Non-blocking — login succeeds even if trial activation fails
    }
  }

  const jti = randomUUID();
  const familyId = randomUUID();
  const refreshToken = signJwt(
    {
      sub: user.id,
      tenantId: tenant._id.toString(),
      type: "refresh",
      jti,
      familyId,
    },
    config.JWT_REFRESH_SECRET,
    config.JWT_REFRESH_EXPIRES_IN,
  );

  await createRefreshTokenRecord({
    tenantId: tenant._id.toString(),
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    jtiHash: hashRefreshTokenJti(jti),
    familyId,
    expiresAt: new Date(
      Date.now() + durationToMilliseconds(config.JWT_REFRESH_EXPIRES_IN),
    ),
    createdByIp: context.ip,
    userAgent: context.userAgent,
  });

  safeAuditLog({
    tenantId: tenant._id.toString(),
    resourceType: "User",
    resourceId: payload.email,
    action: "AUTH_LOGIN_SUCCESS",
    actorId: user.id,
    actorEmail: payload.email,
    actorRole: user.role,
    changes: { ip: context.ip, userAgent: context.userAgent },
    metadata: { userId: user.id },
  });

  return {
    user: serializeVerifiedUser(user),
    tenant: {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan: tenant.plan,
    },
    tokens: {
      accessToken: createAccessToken(user, tenant),
      refreshToken,
      tokenType: "Bearer",
      expiresIn: config.JWT_EXPIRES_IN,
    },
  };
}

export async function superAdminLogin(
  input: unknown,
  context: RefreshTokenContext = {},
): Promise<LoginResult> {
  const payload = validateSuperAdminLoginInput(input);
  const user = await findSuperAdminByEmail(payload.email);
  if (
    !user ||
    user.role !== "SUPER_ADMIN" ||
    user.status !== "active" ||
    !user.emailVerified ||
    !user.passwordHash ||
    !(await verifyPassword(user.passwordHash, payload.password))
  ) {
    safeAuditLog({
      tenantId: user?.tenantId?.toString() ?? "",
      resourceType: "User",
      resourceId: payload.email,
      action: "AUTH_LOGIN_FAILURE",
      actorId: user?._id?.toString() ?? "",
      actorEmail: payload.email,
      actorRole: user?.role ?? "",
      changes: { reason: "invalid_credentials", ip: context.ip, scope: "super_admin" },
      metadata: { userId: user?._id?.toString() ?? "" },
    });
    throw new AppError(401, INVALID_CREDENTIALS, "Invalid email or password");
  }
  const tenant = await findTenantById(user.tenantId.toString());
  if (
    !tenant ||
    tenant.slug !== "__documind_platform__" ||
    tenant.status !== "active"
  )
    throw new AppError(401, INVALID_CREDENTIALS, "Invalid email or password");
  const jti = randomUUID();
  const familyId = randomUUID();
  const refreshToken = signJwt(
    {
      sub: user.id,
      tenantId: tenant._id.toString(),
      type: "refresh",
      jti,
      familyId,
    },
    config.JWT_REFRESH_SECRET,
    config.JWT_REFRESH_EXPIRES_IN,
  );
  await createRefreshTokenRecord({
    tenantId: tenant._id.toString(),
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    jtiHash: hashRefreshTokenJti(jti),
    familyId,
    expiresAt: new Date(
      Date.now() + durationToMilliseconds(config.JWT_REFRESH_EXPIRES_IN),
    ),
    createdByIp: context.ip,
    userAgent: context.userAgent,
  });

  safeAuditLog({
    tenantId: tenant._id.toString(),
    resourceType: "User",
    resourceId: payload.email,
    action: "AUTH_LOGIN_SUCCESS",
    actorId: user.id,
    actorEmail: payload.email,
    actorRole: user.role,
    changes: { ip: context.ip, userAgent: context.userAgent, scope: "super_admin" },
    metadata: { userId: user.id },
  });

  return {
    user: serializeVerifiedUser(user),
    tenant: {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan: tenant.plan,
    },
    tokens: {
      accessToken: createAccessToken(user, tenant),
      refreshToken,
      tokenType: "Bearer",
      expiresIn: config.JWT_EXPIRES_IN,
    },
  };
}

function sessionExpiredError() {
  return new AppError(
    401,
    SESSION_EXPIRED,
    "Session expired. Please sign in again.",
  );
}

function refreshTokenReusedError() {
  return new AppError(
    401,
    REFRESH_TOKEN_REUSED,
    "Session security check failed. Please sign in again.",
  );
}

export async function refreshAccessToken(
  token: string,
  context: RefreshTokenContext = {},
): Promise<RefreshRotationResult> {
  if (!token) {
    throw sessionExpiredError();
  }

  try {
    const claims = verifyJwt<AuthTokenClaims>(token, config.JWT_REFRESH_SECRET);

    if (
      claims.type !== "refresh" ||
      !claims.sub ||
      !claims.tenantId ||
      !claims.jti ||
      !claims.familyId
    ) {
      throw new Error("Invalid refresh token claims");
    }

    const tokenRecord = await findRefreshTokenRecord(
      claims.tenantId,
      hashRefreshToken(token),
      hashRefreshTokenJti(claims.jti),
    );

    if (
      !tokenRecord ||
      tokenRecord.familyId !== claims.familyId ||
      tokenRecord.tenantId.toString() !== claims.tenantId ||
      tokenRecord.userId.toString() !== claims.sub
    ) {
      throw sessionExpiredError();
    }

    if (tokenRecord.revokedAt) {
      await markReuseAndRevokeTokenFamily(
        tokenRecord.familyId,
        tokenRecord.tenantId.toString(),
        tokenRecord.userId.toString(),
        tokenRecord.id,
        new Date(),
        context.ip,
      );

      const reuseUser = await UserModel.findById(tokenRecord.userId)
        .select("email role")
        .lean()
        .exec();

      safeAuditLog({
        tenantId: tokenRecord.tenantId.toString(),
        resourceType: "User",
        resourceId: tokenRecord.id,
        action: "AUTH_REFRESH_TOKEN_REUSE",
        actorId: tokenRecord.userId.toString(),
        actorEmail: reuseUser?.email ?? "unknown",
        actorRole: reuseUser?.role ?? "unknown",
        changes: {
          familyId: tokenRecord.familyId,
          ip: context.ip,
          jtiHash: hashRefreshTokenJti(claims.jti!),
        },
        metadata: { userId: tokenRecord.userId.toString() },
      });

      throw refreshTokenReusedError();
    }

    if (tokenRecord.expiresAt.getTime() <= Date.now()) {
      await revokeRefreshToken(tokenRecord.id, new Date(), context.ip);
      throw sessionExpiredError();
    }

    const [user, tenant] = await Promise.all([
      findUserByTenantAndId(claims.tenantId, claims.sub),
      findTenantById(claims.tenantId),
    ]);

    if (!user || !tenant) throw sessionExpiredError();

    assertAccountCanSignIn(user, tenant);

    const rotatedAt = new Date();
    const claimedToken = await claimRefreshTokenForRotation(
      tokenRecord.id,
      rotatedAt,
    );

    if (!claimedToken) {
      await markReuseAndRevokeTokenFamily(
        tokenRecord.familyId,
        tokenRecord.tenantId.toString(),
        tokenRecord.userId.toString(),
        tokenRecord.id,
        rotatedAt,
        context.ip,
      );
      throw refreshTokenReusedError();
    }

    const newJti = randomUUID();
    const newRefreshToken = signJwt(
      {
        sub: claims.sub,
        tenantId: claims.tenantId,
        type: "refresh",
        jti: newJti,
        familyId: tokenRecord.familyId,
      },
      config.JWT_REFRESH_SECRET,
      config.JWT_REFRESH_EXPIRES_IN,
    );
    const replacement = await createRefreshTokenRecord({
      tenantId: claims.tenantId,
      userId: claims.sub,
      tokenHash: hashRefreshToken(newRefreshToken),
      jtiHash: hashRefreshTokenJti(newJti),
      familyId: tokenRecord.familyId,
      expiresAt: new Date(
        Date.now() + durationToMilliseconds(config.JWT_REFRESH_EXPIRES_IN),
      ),
      createdByIp: context.ip,
      userAgent: context.userAgent,
    });

    await setRefreshTokenReplacement(tokenRecord.id, replacement.id);

    return {
      refreshToken: newRefreshToken,
      tokens: {
        accessToken: createAccessToken(user, tenant),
        tokenType: "Bearer",
        expiresIn: config.JWT_EXPIRES_IN,
      },
    };
  } catch (error) {
    if (
      error instanceof AppError &&
      [SESSION_EXPIRED, REFRESH_TOKEN_REUSED].includes(error.code)
    ) {
      throw error;
    }

    throw sessionExpiredError();
  }
}

export async function logout(token: string, context: RefreshTokenContext = {}) {
  if (!token) return;

  try {
    const claims = verifyJwt<AuthTokenClaims>(token, config.JWT_REFRESH_SECRET);

    if (
      claims.type !== "refresh" ||
      !claims.jti ||
      !claims.sub ||
      !claims.tenantId
    ) {
      return;
    }

    const record = await findRefreshTokenRecord(
      claims.tenantId,
      hashRefreshToken(token),
      hashRefreshTokenJti(claims.jti),
    );

    if (
      record &&
      record.userId.toString() === claims.sub &&
      record.tenantId.toString() === claims.tenantId
    ) {
      await revokeRefreshToken(record.id, new Date(), context.ip);
    }
  } catch {
    // Logout is intentionally idempotent, including for invalid cookies.
  }
}

export async function logoutAll(
  identity: AuthIdentity,
  context: RefreshTokenContext = {},
) {
  const revokedCount = await revokeAllRefreshTokensForTenantUser(
    identity.userId,
    identity.tenantId,
    new Date(),
  );

  safeAuditLog({
    tenantId: identity.tenantId,
    resourceType: "Session",
    resourceId: identity.userId,
    action: "AUTH_LOGOUT_ALL",
    actorId: identity.userId,
    actorEmail: identity.email ?? "",
    actorRole: identity.role ?? "",
    changes: { revokedCount: revokedCount.modifiedCount, ip: context.ip },
    metadata: { userId: identity.userId },
  });

  return { success: true, message: "All sessions revoked" };
}

export async function revokeAllRefreshTokensForUser(
  userId: string,
  tenantId: string,
) {
  await revokeAllRefreshTokensForTenantUser(userId, tenantId, new Date());
}

export async function createEmailVerificationTokenForUser(
  user: Pick<CreatedUserRecord, "_id" | "tenantId" | "email">,
  options: { purpose?: string; expiresIn?: string } = {},
) {
  const verificationToken = createEmailVerificationToken({
    userId: user._id.toString(),
    tenantId: user.tenantId?.toString() ?? "",
    email: user.email,
    purpose: options.purpose,
    expiresIn: options.expiresIn,
  });

  await updateUserVerificationToken(
    user._id.toString(),
    verificationToken.tokenHash,
    verificationToken.expiresAt,
  );

  return verificationToken.token;
}

export function createRegisterPayload(input: RegisterInput) {
  return {
    companyName: input.companyName,
    companySlug: input.companySlug,
    adminName: input.adminName,
    email: input.email,
    password: input.password,
  };
}

/**
 * Returns the currently authenticated user and tenant for a given identity.
 *
 * Ensure the identity is retrieved from an access token via middleware.
 *
 * @param identity - Authenticated user identity (from req.auth).
 * @throws {AppError} 401 when the user or tenant no longer exists.
 * @throws {AppError} 403 when the user/tenant is no longer active.
 */
export async function getMe(identity: AuthIdentity): Promise<MeResult> {
  const [user, tenant] = await Promise.all([
    findUserByTenantAndId(identity.tenantId, identity.userId),
    findTenantById(identity.tenantId),
  ]);

  if (!user || !tenant) {
    throw new AppError(401, UNAUTHORIZED, "Account no longer exists");
  }

  assertAccountCanSignIn(user, tenant);

  return {
    user: serializeVerifiedUser(user),
    tenant: {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan: tenant.plan,
    },
  };
}
