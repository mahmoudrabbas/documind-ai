import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { UNAUTHORIZED } from "../errors/errorCodes.js";
import { config } from "../../config/index.js";
import { verifyJwt } from "../../modules/auth/jwtTokens.js";
import type { AuthTokenClaims } from "../../modules/auth/auth.types.js";

/**
 * Extracts the bearer token from the Authorization header.
 * Returns an empty string when the header is missing or malformed.
 */
function extractBearerToken(authorization: string | undefined): string {
  if (!authorization) return "";

  const trimmed = authorization.trim();

  if (!trimmed.toLowerCase().startsWith("bearer ")) return "";

  return trimmed.slice(7).trim();
}

/**
 * Express middleware that authenticates a request using a JWT access token
 * sent in the `Authorization: Bearer <token>` header.
 *
 * On success it populates `req.auth` with the decoded claims
 * (`userId`, `tenantId`, `role`, `email`) and calls `next()`.
 *
 * On failure it throws an `AppError` (401) which is handled by the
 * centralized error handler.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    }

    let claims: AuthTokenClaims;

    try {
      claims = verifyJwt<AuthTokenClaims>(token, config.JWT_SECRET);
    } catch {
      throw new AppError(401, UNAUTHORIZED, "Invalid or expired access token");
    }

    if (claims.type !== "access" || !claims.sub || !claims.tenantId) {
      throw new AppError(401, UNAUTHORIZED, "Invalid access token claims");
    }

    req.auth = {
      userId: claims.sub,
      tenantId: claims.tenantId,
      role: claims.role,
      email: claims.email,
    };

    next();
  } catch (error) {
    next(error);
  }
}
