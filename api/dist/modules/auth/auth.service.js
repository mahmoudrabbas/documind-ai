import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { config } from "../../config/index.js";
import { AppError } from "../../common/errors/AppError.js";
import { EMAIL_ALREADY_EXISTS, EMAIL_NOT_VERIFIED, ACCOUNT_NOT_ACTIVE, INVALID_CREDENTIALS, INVALID_OR_EXPIRED_VERIFICATION_TOKEN, REFRESH_TOKEN_REUSED, REGISTRATION_FAILED, SESSION_EXPIRED, TENANT_NOT_ACTIVE, TENANT_ALREADY_EXISTS, UNAUTHORIZED, } from "../../common/errors/errorCodes.js";
import { sendVerificationEmail } from "./auth.mailer.js";
import { createEmailVerificationToken, hashVerificationJti, verifyEmailVerificationToken, } from "./emailVerificationToken.js";
import { activateTenantIfPendingVerification, claimRefreshTokenForRotation, createTenant, createUser, createRefreshTokenRecord, deleteTenantById, deleteUserById, findTenantById, findTenantBySlug, findRefreshTokenRecord, findUserDocumentByEmail, findUserDocumentById, findUserDocumentByTenantAndEmail, findUserByTenantAndId, markReuseAndRevokeTokenFamily, revokeAllRefreshTokensForTenantUser, revokeRefreshToken, setRefreshTokenReplacement, updateUserVerificationToken, } from "./auth.repository.js";
import { validateRegisterInput, validateLoginInput, validateResendVerificationEmailInput, validateVerifyEmailInput, } from "./auth.validator.js";
import { hashPassword, verifyPassword } from "./passwordHashing.js";
import { signJwt, verifyJwt } from "./jwtTokens.js";
import { durationToMilliseconds } from "./jwtTokens.js";
import { hashRefreshToken, hashRefreshTokenJti, } from "./refreshTokenHashing.js";
function normalizeSlug(companySlug, companyName) {
    const candidate = (companySlug ?? companyName)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    return (candidate ||
        companyName
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, ""));
}
function isDuplicateKeyError(error) {
    return Boolean(error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000);
}
function serializeTenant(tenant) {
    return {
        id: tenant.id ?? tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        createdAt: tenant.createdAt?.toISOString() ?? new Date().toISOString(),
    };
}
function serializeUser(user) {
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
function serializeVerifiedUser(user) {
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
function buildVerificationUrl(token) {
    const url = new URL("/verify-email", config.APP_FRONTEND_URL);
    url.searchParams.set("token", token);
    return url.toString();
}
export async function registerTenantAndAdmin(input) {
    const payload = validateRegisterInput(input);
    const normalizedEmail = payload.email.toLowerCase().trim();
    const normalizedSlug = normalizeSlug(payload.companySlug, payload.companyName);
    const tenantExists = await findTenantBySlug(normalizedSlug);
    if (tenantExists) {
        throw new AppError(409, TENANT_ALREADY_EXISTS, "Tenant already exists");
    }
    const passwordHash = await hashPassword(payload.password);
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
    const created = {
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
        }
        catch (error) {
            const isTransactionUnsupported = error instanceof Error && /replica set|transaction/i.test(error.message);
            if (isTransactionUnsupported || error instanceof Error) {
                created.tenant = await createTenant(tenantPayload);
                userPayload.tenantId = created.tenant._id.toString();
                created.user = await createUser(userPayload);
            }
            else {
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
    }
    catch (error) {
        if (created.user) {
            await deleteUserById(created.user._id.toString());
        }
        if (created.tenant) {
            const tenantId = created.tenant._id.toString();
            await deleteTenantById(tenantId);
        }
        if (isDuplicateKeyError(error)) {
            if (error && typeof error === "object" && "keyPattern" in error) {
                const keyPattern = error.keyPattern;
                if (keyPattern.slug) {
                    throw new AppError(409, TENANT_ALREADY_EXISTS, "Tenant already exists");
                }
                if (keyPattern.tenantId && keyPattern.email) {
                    throw new AppError(409, EMAIL_ALREADY_EXISTS, "Email already exists in this tenant");
                }
                if (keyPattern.email) {
                    throw new AppError(409, EMAIL_ALREADY_EXISTS, "Email already exists");
                }
            }
            throw new AppError(409, EMAIL_ALREADY_EXISTS, "Email already exists in this tenant");
        }
        if (error instanceof AppError) {
            throw error;
        }
        console.error("[auth-register]", error);
        throw new AppError(500, REGISTRATION_FAILED, "Registration failed");
    }
    finally {
        await session.endSession();
    }
}
export async function verifyEmail(input) {
    const payload = validateVerifyEmailInput(input);
    const invalidTokenError = new AppError(400, INVALID_OR_EXPIRED_VERIFICATION_TOKEN, "Invalid or expired verification token");
    try {
        const tokenPayload = verifyEmailVerificationToken(payload.token);
        if (tokenPayload.purpose !== "email_verification") {
            throw invalidTokenError;
        }
        const user = await findUserDocumentById(tokenPayload.sub);
        if (!user || user.tenantId.toString() !== tokenPayload.tenantId || user.email !== tokenPayload.email) {
            throw invalidTokenError;
        }
        if (user.emailVerified ||
            user.status !== "pending_email_verification" ||
            !user.emailVerificationTokenHash ||
            !user.emailVerificationExpiresAt ||
            user.emailVerificationExpiresAt.getTime() <= Date.now()) {
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
        const activatedTenant = (await activateTenantIfPendingVerification(user.tenantId.toString())) ??
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
    }
    catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        throw invalidTokenError;
    }
}
export async function resendVerificationEmail(input) {
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
function invalidCredentialsError() {
    return new AppError(401, INVALID_CREDENTIALS, "Invalid company, email, or password");
}
function assertAccountCanSignIn(user, tenant) {
    if (!user.emailVerified || user.status === "pending_email_verification") {
        throw new AppError(403, EMAIL_NOT_VERIFIED, "Please verify your email before signing in");
    }
    if (user.status !== "active") {
        throw new AppError(403, ACCOUNT_NOT_ACTIVE, "Account is not active");
    }
    if (tenant.status !== "active") {
        throw new AppError(403, TENANT_NOT_ACTIVE, "Tenant is not active");
    }
}
function createAccessToken(user, tenant) {
    return signJwt({
        sub: user.id ?? user._id.toString(),
        tenantId: tenant.id ?? tenant._id.toString(),
        role: user.role,
        email: user.email,
        type: "access",
    }, config.JWT_SECRET, config.JWT_EXPIRES_IN);
}
export async function login(input, context = {}) {
    const payload = validateLoginInput(input);
    const tenant = await findTenantBySlug(payload.companySlug);
    if (!tenant) {
        throw invalidCredentialsError();
    }
    const user = await findUserDocumentByTenantAndEmail(tenant._id.toString(), payload.email);
    if (!user ||
        !user.passwordHash ||
        !(await verifyPassword(user.passwordHash, payload.password))) {
        throw invalidCredentialsError();
    }
    assertAccountCanSignIn(user, tenant);
    const jti = randomUUID();
    const familyId = randomUUID();
    const refreshToken = signJwt({
        sub: user.id,
        tenantId: tenant._id.toString(),
        type: "refresh",
        jti,
        familyId,
    }, config.JWT_REFRESH_SECRET, config.JWT_REFRESH_EXPIRES_IN);
    await createRefreshTokenRecord({
        tenantId: tenant._id.toString(),
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        jtiHash: hashRefreshTokenJti(jti),
        familyId,
        expiresAt: new Date(Date.now() + durationToMilliseconds(config.JWT_REFRESH_EXPIRES_IN)),
        createdByIp: context.ip,
        userAgent: context.userAgent,
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
    return new AppError(401, SESSION_EXPIRED, "Session expired. Please sign in again.");
}
function refreshTokenReusedError() {
    return new AppError(401, REFRESH_TOKEN_REUSED, "Session security check failed. Please sign in again.");
}
export async function refreshAccessToken(token, context = {}) {
    if (!token) {
        throw sessionExpiredError();
    }
    try {
        const claims = verifyJwt(token, config.JWT_REFRESH_SECRET);
        if (claims.type !== "refresh" ||
            !claims.sub ||
            !claims.tenantId ||
            !claims.jti ||
            !claims.familyId) {
            throw new Error("Invalid refresh token claims");
        }
        const tokenRecord = await findRefreshTokenRecord(claims.tenantId, hashRefreshToken(token), hashRefreshTokenJti(claims.jti));
        if (!tokenRecord ||
            tokenRecord.familyId !== claims.familyId ||
            tokenRecord.tenantId.toString() !== claims.tenantId ||
            tokenRecord.userId.toString() !== claims.sub) {
            throw sessionExpiredError();
        }
        if (tokenRecord.revokedAt) {
            await markReuseAndRevokeTokenFamily(tokenRecord.familyId, tokenRecord.tenantId.toString(), tokenRecord.userId.toString(), tokenRecord.id, new Date(), context.ip);
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
        if (!user || !tenant)
            throw sessionExpiredError();
        assertAccountCanSignIn(user, tenant);
        const rotatedAt = new Date();
        const claimedToken = await claimRefreshTokenForRotation(tokenRecord.id, rotatedAt);
        if (!claimedToken) {
            await markReuseAndRevokeTokenFamily(tokenRecord.familyId, tokenRecord.tenantId.toString(), tokenRecord.userId.toString(), tokenRecord.id, rotatedAt, context.ip);
            throw refreshTokenReusedError();
        }
        const newJti = randomUUID();
        const newRefreshToken = signJwt({
            sub: claims.sub,
            tenantId: claims.tenantId,
            type: "refresh",
            jti: newJti,
            familyId: tokenRecord.familyId,
        }, config.JWT_REFRESH_SECRET, config.JWT_REFRESH_EXPIRES_IN);
        const replacement = await createRefreshTokenRecord({
            tenantId: claims.tenantId,
            userId: claims.sub,
            tokenHash: hashRefreshToken(newRefreshToken),
            jtiHash: hashRefreshTokenJti(newJti),
            familyId: tokenRecord.familyId,
            expiresAt: new Date(Date.now() + durationToMilliseconds(config.JWT_REFRESH_EXPIRES_IN)),
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
    }
    catch (error) {
        if (error instanceof AppError &&
            [SESSION_EXPIRED, REFRESH_TOKEN_REUSED].includes(error.code)) {
            throw error;
        }
        throw sessionExpiredError();
    }
}
export async function logout(token, context = {}) {
    if (!token)
        return;
    try {
        const claims = verifyJwt(token, config.JWT_REFRESH_SECRET);
        if (claims.type !== "refresh" ||
            !claims.jti ||
            !claims.sub ||
            !claims.tenantId) {
            return;
        }
        const record = await findRefreshTokenRecord(claims.tenantId, hashRefreshToken(token), hashRefreshTokenJti(claims.jti));
        if (record &&
            record.userId.toString() === claims.sub &&
            record.tenantId.toString() === claims.tenantId) {
            await revokeRefreshToken(record.id, new Date(), context.ip);
        }
    }
    catch {
        // Logout is intentionally idempotent, including for invalid cookies.
    }
}
export async function revokeAllRefreshTokensForUser(userId, tenantId) {
    await revokeAllRefreshTokensForTenantUser(userId, tenantId, new Date());
}
export async function createEmailVerificationTokenForUser(user, options = {}) {
    const verificationToken = createEmailVerificationToken({
        userId: user._id.toString(),
        tenantId: user.tenantId?.toString() ?? "",
        email: user.email,
        purpose: options.purpose,
        expiresIn: options.expiresIn,
    });
    await updateUserVerificationToken(user._id.toString(), verificationToken.tokenHash, verificationToken.expiresAt);
    return verificationToken.token;
}
export function createRegisterPayload(input) {
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
export async function getMe(identity) {
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
//# sourceMappingURL=auth.service.js.map