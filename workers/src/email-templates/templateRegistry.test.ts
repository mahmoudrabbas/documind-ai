import test from "node:test";
import assert from "node:assert/strict";
import { getTemplate } from "./templateRegistry.js";

const INVITATION_URL = "https://app.documind.ai/accept?token=inv-token-123";
const VERIFICATION_URL = "https://app.documind.ai/verify?token=ver-token-123";
const RESET_URL = "https://app.documind.ai/reset?token=reset-token-123";

const invitationVars = {
  companyName: "Acme Corp",
  inviterName: "Bob",
  role: "COMPANY_ADMIN",
  invitationUrl: INVITATION_URL,
  expiryDate: "Thu, 15 Aug 2026 00:00:00 GMT",
};

test("worker invitation renders company, CTA and URLs", () => {
  const result = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(result.html.includes("Acme Corp"));
  assert.ok(result.html.includes("Bob invited you to join"));
  assert.ok(result.html.includes("Accept Invitation"));
  assert.ok(result.html.includes(`href="${INVITATION_URL}"`));
  assert.ok(result.text.includes(INVITATION_URL));
});

test("worker invitation keeps the fallback URL in a muted section", () => {
  const result = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(result.html.includes("If the button doesn't work, copy and paste this link into your browser:"));
  assert.ok(result.html.includes(INVITATION_URL));
});

test("worker invitation uses tenant logo when provided, else DocuMind wordmark", () => {
  const withLogo = getTemplate("user_invitation", "en", invitationVars, {
    logoUrl: "https://cdn.documind.ai/tenants/acme/logo.png",
  });
  assert.ok(withLogo.html.includes('src="https://cdn.documind.ai/tenants/acme/logo.png"'));

  const withoutLogo = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(withoutLogo.html.includes("DocuMind"));
  assert.ok(!withoutLogo.html.includes("<img"));
});

test("worker verification renders CTA, URL and fallback", () => {
  const result = getTemplate("email_verification", "en", {
    adminName: "Alice",
    companyName: "Acme Corp",
    verificationUrl: VERIFICATION_URL,
    expiryLabel: "24 hours",
  });
  assert.ok(result.html.includes("Verify Email"));
  assert.ok(result.html.includes(`href="${VERIFICATION_URL}"`));
  assert.ok(result.html.includes("If the button doesn't work, copy and paste this link into your browser:"));
});

test("worker password reset renders CTA, URL and security warning", () => {
  const result = getTemplate("password_reset", "en", {
    userName: "Carol",
    companyName: "Acme Corp",
    resetUrl: RESET_URL,
    expiryLabel: "15 minutes",
  });
  assert.ok(result.html.includes("Reset Password"));
  assert.ok(result.html.includes(`href="${RESET_URL}"`));
  assert.ok(result.html.includes("If you did not request a password reset, you can safely ignore this email."));
  assert.ok(result.text.includes(RESET_URL));
});

test("worker renders Arabic RTL with localized CTA", () => {
  const result = getTemplate("user_invitation", "ar", invitationVars);
  assert.ok(result.html.includes('lang="ar" dir="rtl"'));
  assert.ok(result.html.includes("قبول الدعوة"));
  assert.ok(result.html.includes("أنت مدعو للانضمام إلى Acme Corp"));
});

test("worker escapes dynamic values and preserves token URLs", () => {
  const result = getTemplate("email_verification", "en", {
    adminName: '<script>alert("xss")</script>',
    companyName: "Acme & Corp",
    verificationUrl: VERIFICATION_URL,
    expiryLabel: "24 hours",
  });
  assert.ok(!result.html.includes("<script>"));
  assert.ok(result.html.includes("&lt;script&gt;"));
  assert.ok(result.html.includes(`href="${VERIFICATION_URL}"`));
});
