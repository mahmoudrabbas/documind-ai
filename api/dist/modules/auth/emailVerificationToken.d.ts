declare const EMAIL_VERIFICATION_PURPOSE = "email_verification";
export interface EmailVerificationTokenPayload {
    sub: string;
    tenantId: string;
    email: string;
    purpose: typeof EMAIL_VERIFICATION_PURPOSE;
    jti: string;
    exp: number;
}
interface SignEmailVerificationTokenInput {
    userId: string;
    tenantId: string;
    email: string;
    purpose?: string;
    expiresIn?: string;
}
export declare function createEmailVerificationToken(input: SignEmailVerificationTokenInput): {
    token: string;
    jti: `${string}-${string}-${string}-${string}-${string}`;
    expiresAt: Date;
    tokenHash: string;
};
export declare function verifyEmailVerificationToken(token: string): EmailVerificationTokenPayload;
export declare function hashVerificationJti(jti: string): string;
export {};
//# sourceMappingURL=emailVerificationToken.d.ts.map