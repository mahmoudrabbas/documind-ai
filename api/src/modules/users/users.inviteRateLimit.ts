import crypto from "node:crypto";
import type { Request, RequestHandler } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import { createRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";

// ---------------------------------------------------------------------------
// Invitation rate limiting is split by operation and security risk.
//
// The three invitation operations used to share a single limiter instance, so
// a burst of /users/validate-invite requests (an automatic, low-risk read
// triggered on page load) drained the same bucket as the security-sensitive
// /users/set-password-from-invite and the email-abuse-sensitive
// /users/:id/resend-invitation. Each operation now gets an independent bucket
// with its own Redis store prefix, keyed by hashed context only (never a raw
// invitation token).
// ---------------------------------------------------------------------------

// ── Named constants (no magic numbers) ─────────────────────────────────────

/** Shared window for all invitation operations, in milliseconds. */
export const INVITE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Max validation requests per hashed (IP, token) per window. */
export const INVITE_VALIDATE_MAX = 100;
/** Max password-setup requests per hashed (IP, token) per window. */
export const INVITE_SET_PASSWORD_MAX = 5;
/** Max resend requests per hashed (tenant, user, IP) per window. */
export const INVITE_RESEND_MAX = 10;

/** Redis key prefix for POST /users/validate-invite. */
export const INVITE_VALIDATE_STORE_PREFIX = "rate-limit:invite-validate:";
/** Redis key prefix for POST /users/set-password-from-invite. */
export const INVITE_SET_PASSWORD_STORE_PREFIX = "rate-limit:invite-set-password:";
/** Redis key prefix for POST /users/:id/resend-invitation. */
export const INVITE_RESEND_STORE_PREFIX = "rate-limit:invite-resend:";

export const INVITE_VALIDATE_MESSAGE =
  "Too many invitation validation attempts. Please try again later.";
export const INVITE_SET_PASSWORD_MESSAGE =
  "Too many password setup attempts. Please try again later.";
export const INVITE_RESEND_MESSAGE =
  "Too many invitation resend attempts. Please try again later.";

// ── Hashed keying ──────────────────────────────────────────────────────────
//
// Tokens and identifiers are hashed with SHA-256 so raw invitation tokens
// never appear in Redis keys or logs. Hashing the token also keeps the rate
// limit scoped per invite link: an exhausted bucket only affects that link,
// never the whole IP.

function hashRateLimitValue(value: unknown): string {
  return typeof value === "string" && value.length > 0
    ? crypto.createHash("sha256").update(value).digest("hex")
    : "unknown";
}

function hashRateLimitScope(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Key generator for the public token-based invitation operations
 * (validate-invite, set-password-from-invite). Scopes each bucket to a
 * hashed (IP, token) pair. `ipKeyGenerator` is called inline so IPv6 clients
 * are grouped by their /56 subnet (the helper is also referenced directly so
 * express-rate-limit's keyGeneratorIpFallback source scan passes).
 */
export function inviteTokenKeyGenerator(req: Request): string {
  const ipHash = hashRateLimitScope(
    ipKeyGenerator(req.ip ?? "unknown", 56),
  );
  const tokenHash = hashRateLimitValue(req.body?.token);
  return `${ipHash}:${tokenHash}`;
}

/**
 * Key generator for the authenticated resend-invitation operation. Scopes
 * each bucket to the acting tenant, the targeted user and the caller IP.
 * `req.tenantId` is populated by `tenantScoping` which runs before the
 * limiter on that route.
 */
export function inviteResendKeyGenerator(req: Request): string {
  const tenantHash = hashRateLimitValue(req.tenantId);
  const userHash = hashRateLimitValue(req.params?.id);
  const ipHash = hashRateLimitScope(
    ipKeyGenerator(req.ip ?? "unknown", 56),
  );
  return `${tenantHash}:${userHash}:${ipHash}`;
}

/** Build the effective Redis key for a limiter, mirroring rate-limit-redis. */
export function buildInviteRateLimitRedisKey(
  storePrefix: string,
  keyGenerator: (req: Request) => string,
  req: Request,
): string {
  return `${storePrefix}${keyGenerator(req)}`;
}

// ── Factories ──────────────────────────────────────────────────────────────

export type InviteRateLimiters = {
  validateInvite: RequestHandler;
  setPasswordFromInvite: RequestHandler;
  resendInvitation: RequestHandler;
};

/**
 * Create the three independent invitation rate limiters. A factory is exposed
 * so tests can build fresh instances (fresh in-memory buckets) without sharing
 * the module-level state; the production wiring uses `invitationRateLimiters`.
 *
 * In non-test environments `createRateLimiter` backs each limiter with its own
 * rate-limit-redis store using the operation-specific store prefix, so the
 * Redis keys cannot collide even though the key generators share a format.
 */
export function createInviteRateLimiters(): InviteRateLimiters {
  return {
    validateInvite: createRateLimiter({
      windowMs: INVITE_RATE_LIMIT_WINDOW_MS,
      max: INVITE_VALIDATE_MAX,
      message: INVITE_VALIDATE_MESSAGE,
      storePrefix: INVITE_VALIDATE_STORE_PREFIX,
      keyGenerator: inviteTokenKeyGenerator,
    }),
    setPasswordFromInvite: createRateLimiter({
      windowMs: INVITE_RATE_LIMIT_WINDOW_MS,
      max: INVITE_SET_PASSWORD_MAX,
      message: INVITE_SET_PASSWORD_MESSAGE,
      storePrefix: INVITE_SET_PASSWORD_STORE_PREFIX,
      keyGenerator: inviteTokenKeyGenerator,
    }),
    resendInvitation: createRateLimiter({
      windowMs: INVITE_RATE_LIMIT_WINDOW_MS,
      max: INVITE_RESEND_MAX,
      message: INVITE_RESEND_MESSAGE,
      storePrefix: INVITE_RESEND_STORE_PREFIX,
      keyGenerator: inviteResendKeyGenerator,
    }),
  };
}

/** Shared production instances used by the users routes. */
export const invitationRateLimiters = createInviteRateLimiters();
