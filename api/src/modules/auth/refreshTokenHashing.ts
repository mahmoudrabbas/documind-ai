import { createHmac } from "node:crypto";
import { config } from "../../config/index.js";

function hmac(value: string) {
  return createHmac("sha256", config.JWT_REFRESH_SECRET)
    .update(value)
    .digest("hex");
}

export function hashRefreshToken(token: string) {
  return hmac(`token:${token}`);
}

export function hashRefreshTokenJti(jti: string) {
  return hmac(`jti:${jti}`);
}
