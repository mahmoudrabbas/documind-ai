import { AppError } from "../errors/AppError.js";
import { UNAUTHORIZED } from "../errors/errorCodes.js";
import { config } from "../../config/index.js";
import { verifyJwt } from "../../modules/auth/jwtTokens.js";
/**
 * Extracts the bearer token from the Authorization header.
 * Returns an empty string when the header is missing or malformed.
 */
function extractBearerToken(authorization) {
    if (!authorization)
        return "";
    const trimmed = authorization.trim();
    if (!trimmed.toLowerCase().startsWith("bearer "))
        return "";
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
export function authenticate(req, _res, next) {
    try {
        const token = extractBearerToken(req.headers.authorization);
        if (!token) {
            throw new AppError(401, UNAUTHORIZED, "Authentication required");
        }
        let claims;
        try {
            claims = verifyJwt(token, config.JWT_SECRET);
        }
        catch {
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
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=authenticate.middleware.js.map