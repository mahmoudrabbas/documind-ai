import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import type { BaseRole } from "../../common/auth/baseRoles.js";
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
  AUTH_SESSION_MIGRATION_PENDING,
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
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { provisionSubscription } from "../billing/registration.service.js";
import { transitionSubscription } from "../billing/subscription.service.js";
import {
  createEmailVerificationToken,
  hashVerificationJti,
  verifyEmailVerificationToken,
} from "./emailVerificationToken.js";
import {
  activateTenantIfPendingVerification,
  createTenant,
  createUser,
  createRefreshTokenRecordForEligibleUser,
  deleteTenantById,
  deleteUserById,
  findTenantById,
  findTenantBySlug,
  findRefreshTokenRecord,
  findUserDocumentByEmail,
  findUserDocumentById,
  findUserDocumentByTenantAndEmail,
  findSuperAdminByTenantAndEmail,
  findUserByTenantAndId,
  markReuseAndRevokeTokenFamily,
  revokeAllRefreshTokensForTenantUser,
  revokeRefreshToken,
  rotateRefreshTokenForEligibleUser,
  restoreUserVerificationTokenIfCurrent,
  updateUserVerificationToken,
  updateUserPasswordResetToken,
  findUserByTenantAndIdWithPasswordResetToken,
  consumePasswordResetTokenAndUpdatePassword,
} from "./auth.repository.js";
import type { UserCreateInput } from "./auth.repository.js";
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
import {
  PLATFORM_TENANT_SLUG,
  isBlockedCustomerTenantSlug,
  isReservedPlatformSlug,
  isSystemPlatformTenant,
  normalizeTenantSlugCandidate,
} from "../../common/auth/platformTenant.js";
import {
  normalizeAuditActorRole,
  resolveAuditActorKind,
} from "../../common/observability/auditEvents.js";

const GENERIC_RESEND_VERIFICATION_RESPONSE = {
  success: true,
  message:
    "If the account exists and requires verification, we'll send an email. Already verified? You can sign in.",
};

function hasVerifiedEmail(
  user: Pick<CreatedUserRecord, "emailVerified" | "emailVerifiedAt">,
) {
  return user.emailVerifiedAt instanceof Date || user.emailVerified;
}

function isResendVerificationEligible(
  tenant: Pick<CreatedTenantRecord, "status" | "isSystemTenant">,
  user: Pick<CreatedUserRecord, "status" | "emailVerified" | "emailVerifiedAt">,
) {
  if (tenant.isSystemTenant || tenant.status === "suspended") {
    return false;
  }

  if (hasVerifiedEmail(user)) {
    return false;
  }

  return user.status === "pending_email_verification";
}

function safeAuditLog(input: AuditEventInput) {
  try {
    const actorRole = normalizeAuditActorRole(input.actorRole);
    const actorKind = resolveAuditActorKind({
      actorId: input.actorId,
      actorKind: input.actorKind,
      actorRole,
    });

    let userId: string | mongoose.Types.ObjectId | null;
    if (input.actorId === undefined || input.actorId === null || input.actorId === "") {
      userId = actorKind === "SYSTEM" ? "system" : null;
    } else {
      userId = new mongoose.Types.ObjectId(input.actorId);
    }

    createAuditLog({
      ...input,
      tenantId: input.tenantId ?? "system",
      actorKind,
      actorId: userId,
      actorRole,
      userId,
    }).catch((err) => {
      console.error("[audit-log-failed]", err);
    });
  } catch (err) {
    console.error("[audit-log-failed]", err);
  }
}

type CreatedTenantRecord = {
  _id: { toString(): string };
  id?: string;
  name: string;
  slug: string;
  isSystemTenant: boolean;
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
  role: BaseRole;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
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

function normalizedRawSlugCandidate(
  companySlug: string | undefined,
  companyName: string,
) {
  return normalizeTenantSlugCandidate(companySlug ?? companyName);
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

  if (isBlockedCustomerTenantSlug(payload.slug)) {
    return { success: true, message: genericMessage };
  }

  const tenant = await findTenantBySlug(payload.slug);
  if (!tenant || isSystemPlatformTenant(tenant)) {
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
      tenantId: tenantId.toString(),
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
    if (isBlockedCustomerTenantSlug(payload.slug)) {
      throw invalidTokenError;
    }

    const tenant = await findTenantBySlug(payload.slug);
    if (
      !tenant ||
      isSystemPlatformTenant(tenant) ||
      tokenPayload.tenantId !== tenant._id.toString()
    ) {
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

    safeAuditLog({
      tenantId,
      resourceType: "User",
      resourceId: user.id.toString(),
      action: "AUTH_PASSWORD_RESET",
      actorId: user.id.toString(),
      actorEmail: user.email,
      actorRole: user.role,
      changes: {},
      metadata: { userId: user.id.toString() },
    });

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

  if (
    isBlockedCustomerTenantSlug(
      normalizedRawSlugCandidate(payload.companySlug, payload.companyName),
    ) ||
    isReservedPlatformSlug(normalizedSlug)
  ) {
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
  };

  const userPayload: UserCreateInput = {
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
    await session.withTransaction(async () => {
      created.tenant = await createTenant(tenantPayload, session);

      userPayload.tenantId = created.tenant._id.toString();

      created.user = await createUser(userPayload, session);
    });

    if (!created.tenant || !created.user) {
      throw new AppError(500, REGISTRATION_FAILED, "Registration failed");
    }

    await provisionSubscription(
      created.tenant._id.toString(),
      payload.packageCode,
    );

    const verificationToken = await createEmailVerificationTokenForUser(
      created.user,
    );

    try {
      await sendVerificationEmail({
        to: created.user.email,
        adminName: created.user.name,
        companyName: created.tenant.name,
        verificationUrl: buildVerificationUrl(verificationToken),
        tenantId: created.tenant._id.toString(),
      });
    } catch (error) {
      console.error("[auth-register-email-delivery]", error);
    }

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

    safeAuditLog({
      tenantId: user.tenantId.toString(),
      resourceType: "User",
      resourceId: user._id.toString(),
      action: "AUTH_EMAIL_VERIFIED",
      actorId: user._id.toString(),
      actorEmail: user.email,
      actorRole: user.role,
      changes: { emailVerifiedAt: user.emailVerifiedAt },
      metadata: { userId: user._id.toString() },
    });

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
  const normalizedCompanySlug = payload.companySlug.trim().toLowerCase();
  const normalizedEmail = payload.email.trim().toLowerCase();

  if (isBlockedCustomerTenantSlug(normalizedCompanySlug)) {
    return GENERIC_RESEND_VERIFICATION_RESPONSE;
  }

  const tenant = await findTenantBySlug(normalizedCompanySlug);
  if (!tenant || isSystemPlatformTenant(tenant)) {
    return GENERIC_RESEND_VERIFICATION_RESPONSE;
  }

  const tenantId = tenant._id.toString();
  const user = await findUserDocumentByEmail(tenantId, normalizedEmail);

  if (!user || !isResendVerificationEligible(tenant, user)) {
    return GENERIC_RESEND_VERIFICATION_RESPONSE;
  }

  const previousTokenHash = user.emailVerificationTokenHash;
  const previousExpiresAt = user.emailVerificationExpiresAt;
  const token = await issueEmailVerificationTokenForUser(user);

  try {
    await sendVerificationEmail({
      to: user.email,
      adminName: user.name,
      companyName: tenant.name,
      verificationUrl: buildVerificationUrl(token.token),
      tenantId,
    });
  } catch (error) {
    await restoreUserVerificationTokenIfCurrent(
      tenantId,
      user._id.toString(),
      token.tokenHash,
      token.expiresAt,
      previousTokenHash,
      previousExpiresAt,
    );
    throw error;
  }

  return GENERIC_RESEND_VERIFICATION_RESPONSE;
}

export async function completeTrial(
  identity: AuthIdentity,
): Promise<CompleteTrialResult> {
  const tenant = await findTenantById(identity.tenantId);

  if (!tenant) {
    throw new AppError(404, "NOT_FOUND", "Tenant not found");
  }

  // Subscription was created during registration; transition TRIALING → ACTIVE.
  const subscription = await transitionSubscription(
    identity.tenantId,
    "ACTIVE",
    { triggeredBy: "user" },
  );

  await TenantModel.updateOne(
    { _id: tenant._id },
    { $set: { plan: "active" } },
  ).exec();

  const pkg = await PackageModel.findById(subscription.packageId).lean().exec();

  return {
    success: true,
    subscription: {
      id: subscription._id.toString(),
      packageId: subscription.packageId.toString(),
      packageName: pkg?.name ?? "Unknown",
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
  if (isBlockedCustomerTenantSlug(payload.companySlug)) {
    throw invalidCredentialsError();
  }

  const tenant = await findTenantBySlug(payload.companySlug);

  if (!tenant || isSystemPlatformTenant(tenant)) {
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
      outcome: "DENIED",
      actorId: user?._id?.toString() ?? "",
      actorEmail: payload.email,
      actorKind: "UNAUTHENTICATED",
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
      outcome: "DENIED",
      actorId: user._id.toString(),
      actorEmail: payload.email,
      actorKind: "UNAUTHENTICATED",
      changes: {
        reason: error instanceof Error ? error.message : "account_not_active",
        ip: context.ip,
      },
      metadata: { userId: user._id.toString() },
    });
    throw error;
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

  const issued = await createRefreshTokenRecordForEligibleUser({
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
  if (!issued.eligible || !issued.record) throw sessionMigrationPendingError();

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
  const tenant = await findTenantBySlug(PLATFORM_TENANT_SLUG);
  if (!tenant || tenant.status !== "active") {
    throw new AppError(401, INVALID_CREDENTIALS, "Invalid email or password");
  }

  const user = await findSuperAdminByTenantAndEmail(
    tenant._id.toString(),
    payload.email,
  );
  if (
    !user ||
    user.role !== "SUPER_ADMIN" ||
    user.tenantId.toString() !== tenant._id.toString() ||
    user.status !== "active" ||
    !user.emailVerified ||
    !user.passwordHash ||
    !(await verifyPassword(user.passwordHash, payload.password))
  ) {
    safeAuditLog({
      tenantId: tenant._id.toString(),
      resourceType: "User",
      resourceId: payload.email,
      action: "AUTH_LOGIN_FAILURE",
      outcome: "DENIED",
      actorId: user?._id?.toString() ?? "",
      actorEmail: payload.email,
      actorKind: "UNAUTHENTICATED",
      changes: { reason: "invalid_credentials", ip: context.ip, scope: "super_admin" },
      metadata: { userId: user?._id?.toString() ?? "" },
    });
    throw new AppError(401, INVALID_CREDENTIALS, "Invalid email or password");
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
  const issued = await createRefreshTokenRecordForEligibleUser({
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
  if (!issued.eligible || !issued.record) throw sessionMigrationPendingError();

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

function sessionMigrationPendingError() {
  return new AppError(
    409,
    AUTH_SESSION_MIGRATION_PENDING,
    "A new session cannot be created right now. Please try again later.",
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
        outcome: "DENIED",
        actorId: tokenRecord.userId.toString(),
        actorEmail: reuseUser?.email ?? "unknown",
        actorKind: "USER",
        actorRole: reuseUser?.role ?? null,
        changes: {
          familyId: tokenRecord.familyId,
          ip: context.ip,
        },
        metadata: { userId: tokenRecord.userId.toString() },
      });

      throw refreshTokenReusedError();
    }

    if (tokenRecord.expiresAt.getTime() <= Date.now()) {
      await revokeRefreshToken(
        String(tokenRecord.tenantId),
        String(tokenRecord.userId),
        tokenRecord.id,
        new Date(),
        context.ip,
      );
      throw sessionExpiredError();
    }

    const [user, tenant] = await Promise.all([
      findUserByTenantAndId(claims.tenantId, claims.sub),
      findTenantById(claims.tenantId),
    ]);

    if (!user || !tenant) throw sessionExpiredError();

    assertAccountCanSignIn(user, tenant);

    const rotatedAt = new Date();
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
    const rotation = await rotateRefreshTokenForEligibleUser({
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
    }, tokenRecord.id, rotatedAt);
    if (rotation.outcome === "migration-blocked") {
      await revokeRefreshToken(
        tokenRecord.tenantId.toString(),
        tokenRecord.userId.toString(),
        tokenRecord.id,
        rotatedAt,
        context.ip,
      );
      throw sessionMigrationPendingError();
    }
    if (rotation.outcome !== "rotated" || !rotation.replacement) {
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
    const replacement = rotation.replacement as { _id: mongoose.Types.ObjectId; id: mongoose.Types.ObjectId };

    safeAuditLog({
      tenantId: claims.tenantId,
      resourceType: "Session",
      resourceId: replacement.id.toString(),
      action: "AUTH_TOKEN_REFRESH",
      actorId: claims.sub,
      actorEmail: user.email,
      actorRole: user.role,
      changes: { familyId: tokenRecord.familyId, ip: context.ip },
      metadata: { userId: claims.sub },
    });

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
      [SESSION_EXPIRED, REFRESH_TOKEN_REUSED, AUTH_SESSION_MIGRATION_PENDING].includes(error.code)
    ) {
      throw error;
    }

    throw sessionExpiredError();
  }
}

export async function logout(token: string, context: RefreshTokenContext = {}) {
  if (!token) {
    safeAuditLog({
      resourceType: "Session",
      resourceId: "missing-refresh-token",
      action: "AUTH_LOGOUT",
      actorKind: "UNAUTHENTICATED",
      actorRole: null,
      actorEmail: null,
      changes: { ip: context.ip },
    });
    return;
  }

  try {
    const claims = verifyJwt<AuthTokenClaims>(token, config.JWT_REFRESH_SECRET);

    if (
      claims.type !== "refresh" ||
      !claims.jti ||
      !claims.sub ||
      !claims.tenantId
    ) {
      safeAuditLog({
        resourceType: "Session",
        resourceId: "invalid-refresh-token",
        action: "AUTH_LOGOUT",
        outcome: "SUCCESS",
        actorKind: "UNAUTHENTICATED",
        actorRole: null,
        actorEmail: null,
        changes: { ip: context.ip },
      });
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
      const revocation = await revokeRefreshToken(
        record.tenantId.toString(),
        record.userId.toString(),
        record.id,
        new Date(),
        context.ip,
      );

      if (revocation.modifiedCount === 1) {
        const actor = await findUserByTenantAndId(
          claims.tenantId,
          claims.sub,
        ).catch(() => null);

        safeAuditLog({
          tenantId: claims.tenantId,
          resourceType: "Session",
          resourceId: record.id.toString(),
          action: "AUTH_LOGOUT",
          outcome: "SUCCESS",
          actorId: actor?.id ?? actor?._id.toString(),
          actorEmail: actor ? actor.email.trim().toLowerCase() : null,
          actorKind: actor ? "USER" : "UNAUTHENTICATED",
          actorRole: actor?.role ?? null,
          changes: { ip: context.ip },
          metadata: { userId: claims.sub },
        });
        return;
      }
    }
    safeAuditLog({
      tenantId: claims.tenantId,
      resourceType: "Session",
      resourceId: claims.jti,
      action: "AUTH_LOGOUT",
      outcome: "SUCCESS",
      actorKind: "UNAUTHENTICATED",
      actorRole: null,
      actorEmail: null,
      changes: { ip: context.ip },
    });
  } catch {
    safeAuditLog({
      resourceType: "Session",
      resourceId: "invalid-refresh-token",
      action: "AUTH_LOGOUT",
      outcome: "SUCCESS",
      actorKind: "UNAUTHENTICATED",
      actorRole: null,
      actorEmail: null,
      changes: { ip: context.ip },
    });
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

  const actor = await findUserByTenantAndId(
    identity.tenantId,
    identity.userId,
  ).catch(() => null);

  safeAuditLog({
    tenantId: identity.tenantId,
    resourceType: "Session",
    resourceId: identity.userId,
    action: "AUTH_LOGOUT_ALL",
    actorId: actor?.id ?? actor?._id.toString(),
    actorEmail: actor ? actor.email.trim().toLowerCase() : null,
    actorKind: actor ? "USER" : "UNAUTHENTICATED",
    actorRole: actor?.role ?? null,
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
  options: {
    purpose?: "email_verification" | "user_invitation";
    expiresIn?: string;
  } = {},
) {
  const verificationToken = await issueEmailVerificationTokenForUser(
    user,
    options,
  );

  return verificationToken.token;
}

async function issueEmailVerificationTokenForUser(
  user: Pick<CreatedUserRecord, "_id" | "tenantId" | "email">,
  options: {
    purpose?: "email_verification" | "user_invitation";
    expiresIn?: string;
  } = {},
) {
  const verificationToken = createEmailVerificationToken({
    userId: user._id.toString(),
    tenantId: user.tenantId?.toString() ?? "",
    email: user.email,
    purpose: options.purpose,
    expiresIn: options.expiresIn,
  });

  await updateUserVerificationToken(
    user.tenantId?.toString() ?? "",
    user._id.toString(),
    verificationToken.tokenHash,
    verificationToken.expiresAt,
  );

  return verificationToken;
}

/**
 * Test-only: generates a verification token for a given email + companySlug.
 * Guarded by NODE_ENV check in the controller — never exposed in production.
 */
export async function createTestVerificationToken(
  email: string,
  companySlug: string,
): Promise<string> {
  const tenant = await findTenantBySlug(companySlug);
  if (!tenant) {
    throw new AppError(404, INVALID_OR_EXPIRED_VERIFICATION_TOKEN, "Tenant not found");
  }

  const user = await findUserDocumentByEmail(tenant._id.toString(), email);
  if (!user) {
    throw new AppError(404, INVALID_OR_EXPIRED_VERIFICATION_TOKEN, "User not found");
  }

  return createEmailVerificationTokenForUser(user);
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
