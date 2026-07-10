import { AppError } from "../../common/errors/AppError.js";
import { login, superAdminLogin, logout, refreshAccessToken, registerTenantAndAdmin, resendVerificationEmail, verifyEmail, getMe, } from "./auth.service.js";
import { config } from "../../config/index.js";
import { durationToMilliseconds } from "./jwtTokens.js";
const REFRESH_COOKIE_NAME = "documind_refresh_token";
function refreshCookieOptions() {
    return {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        path: "/auth",
        maxAge: durationToMilliseconds(config.JWT_REFRESH_EXPIRES_IN),
    };
}
export async function registerController(req, res, next) {
    try {
        const result = await registerTenantAndAdmin(req.body);
        res.status(201).json({
            success: true,
            message: "Tenant and company admin created successfully. Please verify your email to activate the account.",
            data: result,
        });
    }
    catch (error) {
        handleAuthError(error, res, next);
    }
}
export async function verifyEmailController(req, res, next) {
    try {
        const result = await verifyEmail(req.body);
        res.status(200).json({
            success: true,
            message: "Email verified successfully. You can now sign in.",
            data: result,
        });
    }
    catch (error) {
        handleAuthError(error, res, next);
    }
}
export async function resendVerificationEmailController(req, res, next) {
    try {
        const result = await resendVerificationEmail(req.body);
        res.status(200).json(result);
    }
    catch (error) {
        handleAuthError(error, res, next);
    }
}
export async function loginController(req, res, next) {
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
    }
    catch (error) {
        handleAuthError(error, res, next);
    }
}
export async function superAdminLoginController(req, res, next) {
    try {
        const result = await superAdminLogin(req.body, { ip: req.ip, userAgent: req.get("user-agent") });
        const { refreshToken, ...publicTokens } = result.tokens;
        res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
        res.status(200).json({ success: true, message: "Login successful", data: { user: result.user, tenant: result.tenant, tokens: publicTokens } });
    }
    catch (error) {
        handleAuthError(error, res, next);
    }
}
function readCookie(req, name) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader)
        return "";
    for (const entry of cookieHeader.split(";")) {
        const [cookieName, ...valueParts] = entry.trim().split("=");
        if (cookieName === name) {
            return decodeURIComponent(valueParts.join("="));
        }
    }
    return "";
}
export async function meController(req, res, next) {
    try {
        if (!req.auth) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const result = await getMe(req.auth);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        handleAuthError(error, res, next);
    }
}
export async function refreshController(req, res, next) {
    try {
        const result = await refreshAccessToken(readCookie(req, REFRESH_COOKIE_NAME), {
            ip: req.ip,
            userAgent: req.get("user-agent"),
        });
        const { refreshToken, ...data } = result;
        res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
        res.status(200).json({
            success: true,
            data,
        });
    }
    catch (error) {
        clearRefreshCookie(res);
        handleAuthError(error, res, next);
    }
}
function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        path: "/auth",
    });
}
export async function logoutController(req, res, next) {
    try {
        await logout(readCookie(req, REFRESH_COOKIE_NAME), { ip: req.ip });
        clearRefreshCookie(res);
        res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    }
    catch (error) {
        next(error);
    }
}
function handleAuthError(error, res, next) {
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
//# sourceMappingURL=auth.controller.js.map