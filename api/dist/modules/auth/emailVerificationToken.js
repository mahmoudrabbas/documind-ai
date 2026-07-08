import crypto from "node:crypto";
import { config } from "../../config/index.js";
const EMAIL_VERIFICATION_PURPOSE = "email_verification";
export function createEmailVerificationToken(input) {
    const jti = crypto.randomUUID();
    const expiresInSeconds = parseDurationSeconds(input.expiresIn ?? config.EMAIL_VERIFICATION_JWT_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const payload = {
        sub: input.userId,
        tenantId: input.tenantId,
        email: input.email,
        purpose: input.purpose ?? EMAIL_VERIFICATION_PURPOSE,
        jti,
        exp: Math.floor(expiresAt.getTime() / 1000),
    };
    const token = signJwt(payload);
    return {
        token,
        jti,
        expiresAt,
        tokenHash: hashVerificationJti(jti),
    };
}
export function verifyEmailVerificationToken(token) {
    const payload = verifyJwt(token);
    if (!isEmailVerificationTokenPayload(payload)) {
        throw new Error("Invalid email verification token payload");
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new Error("Expired email verification token");
    }
    return payload;
}
export function hashVerificationJti(jti) {
    return crypto.createHash("sha256").update(jti).digest("hex");
}
function signJwt(payload) {
    const encodedHeader = base64UrlEncode(JSON.stringify({
        alg: "HS256",
        typ: "JWT",
    }));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(`${encodedHeader}.${encodedPayload}`);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}
function verifyJwt(token) {
    const [encodedHeader, encodedPayload, signature, extra] = token.split(".");
    if (!encodedHeader || !encodedPayload || !signature || extra !== undefined) {
        throw new Error("Invalid JWT shape");
    }
    const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`);
    if (!timingSafeEqual(signature, expectedSignature)) {
        throw new Error("Invalid JWT signature");
    }
    const header = parseBase64UrlJson(encodedHeader);
    if (header.alg !== "HS256" || header.typ !== "JWT") {
        throw new Error("Invalid JWT header");
    }
    return parseBase64UrlJson(encodedPayload);
}
function sign(value) {
    return crypto
        .createHmac("sha256", config.EMAIL_VERIFICATION_JWT_SECRET)
        .update(value)
        .digest("base64url");
}
function timingSafeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
function base64UrlEncode(value) {
    return Buffer.from(value).toString("base64url");
}
function parseBase64UrlJson(value) {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}
function isEmailVerificationTokenPayload(value) {
    return (typeof value.sub === "string" &&
        typeof value.tenantId === "string" &&
        typeof value.email === "string" &&
        typeof value.purpose === "string" &&
        typeof value.jti === "string" &&
        typeof value.exp === "number");
}
function parseDurationSeconds(value) {
    const match = /^(\d+)([smhd])?$/.exec(value.trim());
    if (!match) {
        return 24 * 60 * 60;
    }
    const amount = Number(match[1]);
    const unit = match[2] ?? "s";
    switch (unit) {
        case "s":
            return amount;
        case "m":
            return amount * 60;
        case "h":
            return amount * 60 * 60;
        case "d":
            return amount * 24 * 60 * 60;
        default:
            return 24 * 60 * 60;
    }
}
//# sourceMappingURL=emailVerificationToken.js.map