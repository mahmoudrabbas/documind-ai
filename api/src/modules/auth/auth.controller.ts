import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import {
  login,
  superAdminLogin,
  logout,
  logoutAll,
  refreshAccessToken,
  registerTenantAndAdmin,
  resendVerificationEmail,
  verifyEmail,
  getMe,
  forgotPassword,
  resetPassword,
  completeTrial,
  createTestVerificationToken,
} from "./auth.service.js";
import { config } from "../../config/index.js";
import { durationToMilliseconds } from "./jwtTokens.js";

const REFRESH_COOKIE_NAME = "documind_refresh_token";

function isSecureCookieAllowed() {
  if (config.NODE_ENV === "production") {
    return true;
  }

  try {
    const frontendUrl = new URL(config.APP_FRONTEND_URL);
    return ["localhost", "127.0.0.1"].includes(frontendUrl.hostname);
  } catch {
    return false;
  }
}

function refreshCookieOptions() {
  const secure = isSecureCookieAllowed();

  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/auth",
    maxAge: durationToMilliseconds(config.JWT_REFRESH_EXPIRES_IN),
  };
}

export async function registerController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await registerTenantAndAdmin(req.body);

    res.status(201).json({
      success: true,
      message:
        "Tenant and company admin created successfully. Please verify your email to activate the account.",
      data: result,
    });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

export async function verifyEmailController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await verifyEmail(req.body);

    res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now sign in.",
      data: result,
    });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

export async function resendVerificationEmailController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await resendVerificationEmail(req.body);

    res.status(200).json(result);
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

export async function completeTrialController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    const result = await completeTrial(req.auth);

    res.status(200).json({
      success: true,
      message: "Trial subscription activated successfully",
      data: result,
    });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await login(req.body, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
    const { refreshToken, ...publicTokens } = result.tokens;

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: result.user,
        tenant: result.tenant,
        tokens: publicTokens,
      },
    });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

export async function superAdminLoginController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await superAdminLogin(req.body, { ip: req.ip, userAgent: req.get("user-agent") });
    const { refreshToken, ...publicTokens } = result.tokens;
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    res.status(200).json({ success: true, message: "Login successful", data: { user: result.user, tenant: result.tenant, tokens: publicTokens } });
  } catch (error) { handleAuthError(error, res, next); }
}

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) return "";

  for (const entry of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = entry.trim().split("=");

    if (cookieName === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return "";
}

export async function meController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    const result = await getMe(req.auth);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

export async function refreshController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await refreshAccessToken(
      readCookie(req, REFRESH_COOKIE_NAME),
      {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
    );
    const { refreshToken, ...data } = result;

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    clearRefreshCookie(res);
    handleAuthError(error, res, next);
  }
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecureCookieAllowed(),
    sameSite: isSecureCookieAllowed() ? ("none" as const) : ("lax" as const),
    path: "/auth",
  });
}

export async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    await logout(readCookie(req, REFRESH_COOKIE_NAME), { ip: req.ip });
    clearRefreshCookie(res);
    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutAllController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    if (req.headers["x-confirm-logout-all"] !== "true") {
      res.status(409).json({
        success: false,
        error: "CONFIRMATION_REQUIRED",
        message: "Send X-Confirm-Logout-All: true header to revoke all sessions",
      });
      return;
    }

    const result = await logoutAll(req.auth, { ip: req.ip });
    clearRefreshCookie(res);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

export async function forgotPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await forgotPassword(req.body);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await resetPassword(req.body);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
}

function handleAuthError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: error.code,
      details: error.details ?? null,
    });
    return;
  }

  next(error);
}

export async function testVerificationTokenController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (config.NODE_ENV !== "test") {
    res.status(403).json({ success: false, message: "Not available" });
    return;
  }

  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const companySlug = typeof req.body?.companySlug === "string" ? req.body.companySlug.trim().toLowerCase() : "";

    if (!email || !companySlug) {
      res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "email and companySlug are required",
      });
      return;
    }

    const token = await createTestVerificationToken(email, companySlug);
    res.status(200).json({ success: true, data: { token } });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}
