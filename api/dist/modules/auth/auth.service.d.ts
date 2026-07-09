import type { LoginResult, MeResult, RefreshRotationResult, RefreshTokenContext, RegisterResult, RegisterInput, VerifyEmailResult } from "./auth.types.js";
type CreatedUserRecord = {
    _id: {
        toString(): string;
    };
    id?: string;
    tenantId: unknown;
    name: string;
    email: string;
    role: string;
    status: string;
    emailVerified: boolean;
    createdAt?: Date;
};
export declare function registerTenantAndAdmin(input: unknown): Promise<RegisterResult>;
export declare function verifyEmail(input: unknown): Promise<VerifyEmailResult>;
export declare function resendVerificationEmail(input: unknown): Promise<{
    success: boolean;
    message: string;
}>;
export declare function login(input: unknown, context?: RefreshTokenContext): Promise<LoginResult>;
export declare function refreshAccessToken(token: string, context?: RefreshTokenContext): Promise<RefreshRotationResult>;
export declare function logout(token: string, context?: RefreshTokenContext): Promise<void>;
export declare function revokeAllRefreshTokensForUser(userId: string, tenantId: string): Promise<void>;
export declare function createEmailVerificationTokenForUser(user: Pick<CreatedUserRecord, "_id" | "tenantId" | "email">, options?: {
    purpose?: string;
    expiresIn?: string;
}): Promise<string>;
export declare function createRegisterPayload(input: RegisterInput): {
    companyName: string;
    companySlug: string | undefined;
    adminName: string;
    email: string;
    password: string;
};
/**
 * Returns the currently authenticated user and tenant for a given access token.
 *
 * Verifies the access token signature/expiry, ensures it is an access token,
 * loads the user and tenant from the database, and asserts the account is
 * still allowed to sign in (active + email verified + tenant active).
 *
 * @param accessToken - Raw JWT access token (without the `Bearer ` prefix).
 * @throws {AppError} 401 when the token is missing, invalid, or expired.
 * @throws {AppError} 403 when the user/tenant is no longer active.
 */
export declare function getMe(accessToken: string): Promise<MeResult>;
export {};
//# sourceMappingURL=auth.service.d.ts.map