import type { LoginResult, MeResult, RefreshRotationResult, RefreshTokenContext, RegisterResult, RegisterInput, VerifyEmailResult, AuthIdentity, ForgotPasswordResult, ResetPasswordResult, CompleteTrialResult } from "./auth.types.js";
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
export declare function forgotPassword(input: unknown): Promise<ForgotPasswordResult>;
export declare function resetPassword(input: unknown): Promise<ResetPasswordResult>;
export declare function registerTenantAndAdmin(input: unknown): Promise<RegisterResult>;
export declare function verifyEmail(input: unknown): Promise<VerifyEmailResult>;
export declare function resendVerificationEmail(input: unknown): Promise<{
    success: boolean;
    message: string;
}>;
export declare function completeTrial(identity: AuthIdentity): Promise<CompleteTrialResult>;
export declare function login(input: unknown, context?: RefreshTokenContext): Promise<LoginResult>;
export declare function superAdminLogin(input: unknown, context?: RefreshTokenContext): Promise<LoginResult>;
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
 * Returns the currently authenticated user and tenant for a given identity.
 *
 * Ensure the identity is retrieved from an access token via middleware.
 *
 * @param identity - Authenticated user identity (from req.auth).
 * @throws {AppError} 401 when the user or tenant no longer exists.
 * @throws {AppError} 403 when the user/tenant is no longer active.
 */
export declare function getMe(identity: AuthIdentity): Promise<MeResult>;
export {};
//# sourceMappingURL=auth.service.d.ts.map