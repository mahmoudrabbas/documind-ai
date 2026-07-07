import crypto from "node:crypto";
import mongoose from "mongoose";
import { config } from "../../config/index.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  EMAIL_ALREADY_EXISTS,
  INVALID_OR_EXPIRED_VERIFICATION_TOKEN,
  REGISTRATION_FAILED,
  TENANT_ALREADY_EXISTS,
} from "../../common/errors/errorCodes.js";
import type {
  RegisterResult,
  RegisterInput,
  VerifyEmailResult,
} from "./auth.types.js";
import { sendVerificationEmail } from "./auth.mailer.js";
import {
  createEmailVerificationToken,
  hashVerificationJti,
  verifyEmailVerificationToken,
} from "./emailVerificationToken.js";
import {
  activateTenantIfPendingVerification,
  createTenant,
  createUser,
  deleteTenantById,
  deleteUserById,
  findTenantById,
  findTenantBySlug,
  findUserDocumentByEmail,
  findUserDocumentById,
  updateUserVerificationToken,
} from "./auth.repository.js";
import {
  validateRegisterInput,
  validateResendVerificationEmailInput,
  validateVerifyEmailInput,
} from "./auth.validator.js";

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

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");

  return `scrypt$${salt}$${hash}`;
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
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

export async function registerTenantAndAdmin(
  input: unknown
): Promise<RegisterResult> {
  const payload = validateRegisterInput(input);

  const normalizedEmail = payload.email.toLowerCase().trim();
  const normalizedSlug = normalizeSlug(payload.companySlug, payload.companyName);

  const tenantExists = await findTenantBySlug(normalizedSlug);

  if (tenantExists) {
    throw new AppError(409, TENANT_ALREADY_EXISTS, "Tenant already exists");
  }

  const passwordHash = hashPassword(payload.password);

  const tenantPayload = {
    name: payload.companyName.trim(),
    slug: normalizedSlug,
    status: "pending_verification",
    plan: "free",
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
        error instanceof Error && /replica set|transaction/i.test(error.message);

      if (isTransactionUnsupported || error instanceof Error) {
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

    const verificationToken = await createEmailVerificationTokenForUser(created.user);

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
          throw new AppError(409, TENANT_ALREADY_EXISTS, "Tenant already exists");
        }

        if (keyPattern.tenantId && keyPattern.email) {
          throw new AppError(
            409,
            EMAIL_ALREADY_EXISTS,
            "Email already exists in this tenant"
          );
        }

        if (keyPattern.email) {
          throw new AppError(
            409,
            EMAIL_ALREADY_EXISTS,
            "Email already exists"
          );
        }
      }
        throw new AppError(
          409,
          EMAIL_ALREADY_EXISTS,
          "Email already exists in this tenant"
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
    "Invalid or expired verification token"
  );

  try {
    const tokenPayload = verifyEmailVerificationToken(payload.token);

    if (tokenPayload.purpose !== "email_verification") {
      throw invalidTokenError;
    }

    const user = await findUserDocumentById(tokenPayload.sub);

    if (!user || user.tenantId.toString() !== tokenPayload.tenantId || user.email !== tokenPayload.email) {
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

    if (user.emailVerificationTokenHash !== hashVerificationJti(tokenPayload.jti)) {
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
    message: "If the email exists and is not verified, a verification email has been sent",
  };

  const user = await findUserDocumentByEmail(payload.email);

  if (!user || user.emailVerified || user.status !== "pending_email_verification") {
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

export async function createEmailVerificationTokenForUser(
  user: Pick<CreatedUserRecord, "_id" | "tenantId" | "email">,
  options: { purpose?: string; expiresIn?: string } = {}
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
    verificationToken.expiresAt
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
