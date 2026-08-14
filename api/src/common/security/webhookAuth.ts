import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { resolveCorsOrigin } from "../cors/corsOrigins.js";

/**
 * Constant-time string comparison to avoid leaking the secret length/content
 * via timing side channels.
 */
export function safeStringEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Requires a shared-secret header (`x-webhook-secret`) on the request.
 * Webhooks are server-to-server and carry no browser session, so a bearer
 * secret is the only meaningful authorization; without it anyone on the
 * internet could POST forged delivery/suppression events.
 */
export function requireWebhookSecret(getSecret: () => string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = req.header("x-webhook-secret");
    const expected = getSecret();
    if (!provided || !expected || !safeStringEqual(provided, expected)) {
      res.status(401).json({ error: "Unauthorized webhook request" });
      return;
    }
    next();
  };
}

/**
 * Defense-in-depth origin check: if the request carries an `Origin` header it
 * must be allowlisted (same policy as CORS). Server-to-server callers usually
 * send no Origin and are allowed, matching resolveCorsOrigin semantics.
 */
export function rejectForbiddenOrigin(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.header("origin");
    if (origin && !resolveCorsOrigin(origin)) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    next();
  };
}
