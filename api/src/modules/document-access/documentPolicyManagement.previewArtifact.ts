import crypto from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_POLICY_PREVIEW_EXPIRED, DOCUMENT_POLICY_PREVIEW_INVALID } from "../../common/errors/errorCodes.js";
import { config } from "../../config/index.js";
import type { PreviewArtifactPayload } from "./documentPolicyManagement.types.js";

export function createPolicyPreviewArtifact(payload: Omit<PreviewArtifactPayload, "exp">, now = Date.now()) {
  const complete: PreviewArtifactPayload = { ...payload, exp: Math.floor((now + 10 * 60_000) / 1000) };
  const body = Buffer.from(JSON.stringify(complete)).toString("base64url");
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(complete.exp * 1000).toISOString() };
}

export function verifyPolicyPreviewArtifact(token: string, now = Date.now()): PreviewArtifactPayload {
  try {
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra !== undefined || !safeEqual(signature, sign(body))) invalid();
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!validPayload(parsed)) invalid();
    if (parsed.exp <= Math.floor(now / 1000)) throw new AppError(409, DOCUMENT_POLICY_PREVIEW_EXPIRED, "Policy preview expired");
    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    invalid();
  }
}

function validPayload(value: unknown): value is PreviewArtifactPayload {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (item.purpose === "document_policy_preview" || item.purpose === "document_policy_batch_preview") &&
    typeof item.tenantId === "string" && typeof item.actorId === "string" && typeof item.exp === "number" &&
    Array.isArray(item.entries) && item.entries.length >= 1 && item.entries.length <= 50 && item.entries.every((entry) => {
      if (!entry || typeof entry !== "object") return false; const e = entry as Record<string, unknown>;
      return typeof e.documentId === "string" && typeof e.policyId === "string" && Number.isSafeInteger(e.policyVersion) &&
        typeof e.draftFingerprint === "string" && typeof e.semanticFingerprint === "string" && typeof e.sensitive === "boolean" && typeof e.materializedEffectiveFrom === "string";
    });
}
function sign(value: string) { return crypto.createHmac("sha256", config.JWT_SECRET).update(`document-policy-preview-v1:${value}`).digest("base64url"); }
function safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function invalid(): never { throw new AppError(400, DOCUMENT_POLICY_PREVIEW_INVALID, "Invalid policy preview artifact"); }
