import crypto from "node:crypto";
import { signJwt, verifyJwt } from "./jwtTokens.js";
import { config } from "../../config/index.js";

const PASSWORD_RESET_PURPOSE = "password_reset";

export interface PasswordResetTokenPayload extends Record<string, unknown> {
  sub: string;
  email: string;
  purpose: typeof PASSWORD_RESET_PURPOSE;
  jti: string;
  exp: number;
}

interface SignPasswordResetTokenInput {
  userId: string;
  email: string;
  expiresIn?: string;
}

/**
 * Creates a signed JWT password-reset token and returns the
 * raw token string together with its jti hash and expiry.
 */
export function createPasswordResetToken(
  input: SignPasswordResetTokenInput,
) {
  const jti = crypto.randomUUID();
  const expiresInSeconds = parseDurationSeconds(
    input.expiresIn ?? config.PASSWORD_RESET_JWT_EXPIRES_IN,
  );
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const payload: PasswordResetTokenPayload = {
    sub: input.userId,
    email: input.email,
    purpose: PASSWORD_RESET_PURPOSE,
    jti,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };

  const token = signJwt(payload, config.PASSWORD_RESET_JWT_SECRET, config.PASSWORD_RESET_JWT_EXPIRES_IN);

  return {
    token,
    jti,
    expiresAt,
    tokenHash: hashPasswordResetJti(jti),
  };
}

/**
 * Verifies a password-reset JWT and returns its payload.
 * Throws on invalid signature, expired token, or wrong purpose.
 */
export function verifyPasswordResetToken(
  token: string,
): PasswordResetTokenPayload {
  const payload = verifyJwt<PasswordResetTokenPayload>(
    token,
    config.PASSWORD_RESET_JWT_SECRET,
  );

  if (payload.purpose !== PASSWORD_RESET_PURPOSE) {
    throw new Error("Invalid password reset token purpose");
  }

  return payload;
}

/**
 * SHA-256 hash of the token jti — used for database comparison.
 */
export function hashPasswordResetJti(jti: string) {
  return crypto.createHash("sha256").update(jti).digest("hex");
}

function parseDurationSeconds(value: string) {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());

  if (!match) {
    return 15 * 60; // default 15 minutes
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "s";

  switch (unit) {
    case "s": return amount;
    case "m": return amount * 60;
    case "h": return amount * 60 * 60;
    case "d": return amount * 24 * 60 * 60;
    default: return 15 * 60;
  }
}
