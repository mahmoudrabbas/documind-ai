declare const PASSWORD_RESET_PURPOSE = "password_reset";
export interface PasswordResetTokenPayload extends Record<string, unknown> {
    sub: string;
    tenantId: string;
    purpose: typeof PASSWORD_RESET_PURPOSE;
    jti: string;
    exp: number;
}
interface SignPasswordResetTokenInput {
    userId: string;
    tenantId: string;
    expiresIn?: string;
}
/**
 * Creates a signed JWT password-reset token and returns the
 * raw token string together with its jti hash and expiry.
 */
export declare function createPasswordResetToken(input: SignPasswordResetTokenInput): {
    token: string;
    jti: `${string}-${string}-${string}-${string}-${string}`;
    expiresAt: Date;
    tokenHash: string;
};
/**
 * Verifies a password-reset JWT and returns its payload.
 * Throws on invalid signature, expired token, or wrong purpose.
 */
export declare function verifyPasswordResetToken(token: string): PasswordResetTokenPayload;
/**
 * SHA-256 hash of the token jti — used for database comparison.
 */
export declare function hashPasswordResetJti(jti: string): string;
export {};
//# sourceMappingURL=passwordResetToken.d.ts.map