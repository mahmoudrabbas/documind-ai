import type { LoginResult, RefreshRotationResult, RefreshTokenContext, RegisterResult, RegisterInput, VerifyEmailResult } from "./auth.types.js";
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
export {};
//# sourceMappingURL=auth.service.d.ts.map