import crypto from "node:crypto";
import { config } from "../config/index.js";

export const USER_INVITATION_PURPOSE = "user_invitation";

export type UserInvitationTokenPayload = {
  sub: string;
  tenantId: string;
  email: string;
  purpose: typeof USER_INVITATION_PURPOSE;
  jti: string;
  exp: number;
};

export interface UserInvitationTokenResult {
  token: string;
  jti: string;
  expiresAt: Date;
  tokenHash: string;
}

/**
 * Creates a signed single-use invitation token.
 *
 * Must stay byte-for-byte compatible with the API's
 * `createEmailVerificationToken` (same HS256 signature, same `user_invitation`
 * purpose, same jti→hash mapping) so the API can verify links that the worker
 * emails out on behalf of bulk-imported users.
 */
export function createUserInvitationToken(input: {
  userId: string;
  tenantId: string;
  email: string;
  expiresIn?: string;
}): UserInvitationTokenResult {
  const jti = crypto.randomUUID();
  const expiresInSeconds = parseDurationSeconds(
    input.expiresIn ?? config.EMAIL_VERIFICATION_JWT_EXPIRES_IN,
  );
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const payload: UserInvitationTokenPayload = {
    sub: input.userId,
    tenantId: input.tenantId,
    email: input.email,
    purpose: USER_INVITATION_PURPOSE,
    jti,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const token = signJwt(payload);

  return {
    token,
    jti,
    expiresAt,
    tokenHash: hashVerificationJti(jti),
  };
}

export function hashVerificationJti(jti: string) {
  return crypto.createHash("sha256").update(jti).digest("hex");
}

function signJwt(payload: Record<string, unknown>) {
  const secret = config.EMAIL_VERIFICATION_JWT_SECRET;
  if (!secret || secret.trim() === "") {
    throw new Error("EMAIL_VERIFICATION_JWT_SECRET is not configured");
  }

  const encodedHeader = base64UrlEncode(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  );
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function parseDurationSeconds(value: string) {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());

  if (!match) {
    return 24 * 60 * 60;
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "s";

  switch (unit) {
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 60 * 60;
    case "d":
      return amount * 24 * 60 * 60;
    default:
      return 24 * 60 * 60;
  }
}
