import { AppError } from "../../common/errors/AppError.js";
import { login, refreshAccessToken, registerTenantAndAdmin, resendVerificationEmail, verifyEmail, } from "./auth.service.js";
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
        const result = await login(req.body);
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
export async function refreshController(req, res, next) {
    try {
        const result = await refreshAccessToken(readCookie(req, REFRESH_COOKIE_NAME));
        res.status(200).json({
            success: true,
            message: "Access token refreshed",
            data: result,
        });
    }
    catch (error) {
        handleAuthError(error, res, next);
    }
}
export function logoutController(_req, res) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        path: "/auth",
    });
    res.status(200).json({ success: true, message: "Logout successful" });
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