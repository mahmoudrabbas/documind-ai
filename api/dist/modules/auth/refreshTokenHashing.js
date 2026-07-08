import { createHmac } from "node:crypto";
import { config } from "../../config/index.js";
function hmac(value) {
    return createHmac("sha256", config.JWT_REFRESH_SECRET)
        .update(value)
        .digest("hex");
}
export function hashRefreshToken(token) {
    return hmac(`token:${token}`);
}
export function hashRefreshTokenJti(jti) {
    return hmac(`jti:${jti}`);
}
//# sourceMappingURL=refreshTokenHashing.js.map