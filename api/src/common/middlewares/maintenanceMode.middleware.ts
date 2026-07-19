import type { NextFunction, Request, Response } from "express";
import { getGlobalSettings } from "../../modules/platform/global-settings.js";
import { AppError } from "../errors/AppError.js";
import { MAINTENANCE_MODE } from "../errors/errorCodes.js";
import { config } from "../../config/index.js";
import { verifyJwt } from "../../modules/auth/jwtTokens.js";
import type { AuthTokenClaims } from "../../modules/auth/auth.types.js";

function extractSuperAdminRole(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (!auth) return undefined;

  const trimmed = auth.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return undefined;

  const token = trimmed.slice(7).trim();
  if (!token) return undefined;

  try {
    const claims = verifyJwt<AuthTokenClaims>(token, config.JWT_SECRET);
    if (claims.type === "access" && claims.role) {
      return claims.role;
    }
  } catch {
    // Token invalid or expired — not a problem here, we only care about SUPER_ADMIN bypass.
  }

  return undefined;
}

export async function maintenanceModeGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const settings = await getGlobalSettings();

    if (!settings.maintenanceMode) {
      next();
      return;
    }

    const role = extractSuperAdminRole(req);

    if (role === "SUPER_ADMIN") {
      next();
      return;
    }

    next(
      new AppError(
        503,
        MAINTENANCE_MODE,
        "The platform is currently undergoing scheduled maintenance. Please try again later.",
      ),
    );
  } catch (error) {
    next(error);
  }
}
