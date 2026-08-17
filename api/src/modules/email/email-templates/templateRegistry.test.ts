import test from "node:test";
import assert from "node:assert/strict";
import { getTemplate } from "./templateRegistry.js";

const INVITATION_URL = "https://app.documind.ai/accept?token=inv-token-123";
const VERIFICATION_URL = "https://app.documind.ai/verify?token=ver-token-123";
const RESET_URL = "https://app.documind.ai/reset?token=reset-token-123";
const EXPIRY = "Thu, 15 Aug 2026 00:00:00 GMT";

const invitationVars = {
  companyName: "Acme Corp",
  inviterName: "Bob",
  inviterEmail: "bob@acme.example",
  role: "COMPANY_ADMIN",
  invitationUrl: INVITATION_URL,
  expiryDate: EXPIRY,
};

// ─── Invitation ───────────────────────────────────────────────────────────────

test("invitation renders company name and title", () => {
  const result = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(result.html.includes("Acme Corp"));
  assert.ok(result.html.includes("You're invited to join Acme Corp"));
});

test("invitation renders inviter when available", () => {
  const result = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(result.html.includes("invited you to join Acme Corp"));
  assert.ok(result.html.includes("bob@acme.example"));
});

test("invitation falls back to a default inviter label when absent", () => {
  const { inviterName: _inviterName, inviterEmail: _inviterEmail, ...withoutInviter } = invitationVars;
  const result = getTemplate("user_invitation", "en", withoutInviter);
  assert.ok(result.html.includes("A company administrator"));
  assert.ok(result.html.includes("Accept Invitation"));
});

test("invitation renders CTA button with the correct URL", () => {
  const result = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(result.html.includes("Accept Invitation"));
  assert.ok(result.html.includes(`href="${INVITATION_URL}"`));
  assert.ok(result.text.includes(`Accept invitation:\n${INVITATION_URL}`));
});

test("invitation preserves the fallback URL in a muted section", () => {
  const result = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(result.html.includes("If the button doesn't work, copy and paste this link into your browser:"));
  assert.ok(result.html.includes(INVITATION_URL));
});

test("invitation renders tenant logo when a safe logoUrl is provided", () => {
  const result = getTemplate("user_invitation", "en", invitationVars, {
    logoUrl: "https://cdn.documind.ai/tenants/acme/logo.png",
  });
  assert.ok(result.html.includes('src="https://cdn.documind.ai/tenants/acme/logo.png"'));
  assert.ok(result.html.includes('alt="Acme Corp"'));
});

test("invitation falls back to DocuMind AI wordmark when no logo is provided", () => {
  const result = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(result.html.includes("DocuMind"));
  assert.ok(!result.html.includes("<img"));
});

test("invitation renders expiry note", () => {
  const result = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(result.html.includes("This invitation expires"));
  assert.ok(result.html.includes(EXPIRY));
});

// ─── Verification ─────────────────────────────────────────────────────────────

test("verification renders CTA with the correct URL", () => {
  const result = getTemplate("email_verification", "en", {
    adminName: "Alice",
    companyName: "Acme Corp",
    verificationUrl: VERIFICATION_URL,
    expiryLabel: "24 hours",
  });
  assert.equal(result.subject, "Verify your DocuMind AI account");
  assert.ok(result.html.includes("Verify Email"));
  assert.ok(result.html.includes(`href="${VERIFICATION_URL}"`));
  assert.ok(result.text.includes(`Verify your email:\n${VERIFICATION_URL}`));
});

test("verification preserves the fallback URL in a muted section", () => {
  const result = getTemplate("email_verification", "en", {
    adminName: "Alice",
    companyName: "Acme Corp",
    verificationUrl: VERIFICATION_URL,
    expiryLabel: "24 hours",
  });
  assert.ok(result.html.includes("If the button doesn't work, copy and paste this link into your browser:"));
  assert.ok(result.html.includes(VERIFICATION_URL));
});

// ─── Password reset ───────────────────────────────────────────────────────────

test("password reset renders CTA, URL and security warning", () => {
  const result = getTemplate("password_reset", "en", {
    userName: "Carol",
    companyName: "Acme Corp",
    resetUrl: RESET_URL,
    expiryLabel: "15 minutes",
  });
  assert.ok(result.html.includes("Reset Password"));
  assert.ok(result.html.includes(`href="${RESET_URL}"`));
  assert.ok(result.html.includes("If you did not request a password reset, you can safely ignore this email."));
  assert.ok(result.text.includes(`Reset your password:\n${RESET_URL}`));
});

test("password reset preserves the fallback URL in a muted section", () => {
  const result = getTemplate("password_reset", "en", {
    userName: "Carol",
    companyName: "Acme Corp",
    resetUrl: RESET_URL,
    expiryLabel: "15 minutes",
  });
  assert.ok(result.html.includes("If the button doesn't work, copy and paste this link into your browser:"));
  assert.ok(result.html.includes(RESET_URL));
});

// ─── Localization / RTL ───────────────────────────────────────────────────────

test("English renders LTR with English copy", () => {
  const result = getTemplate("user_invitation", "en", invitationVars);
  assert.ok(result.html.includes('lang="en" dir="ltr"'));
  assert.ok(result.html.includes("Accept Invitation"));
});

test("Arabic renders RTL with localized CTA copy", () => {
  const result = getTemplate("user_invitation", "ar", invitationVars);
  assert.ok(result.html.includes('lang="ar" dir="rtl"'));
  assert.ok(result.html.includes("قبول الدعوة"));
  assert.ok(result.html.includes("أنت مدعو للانضمام إلى Acme Corp"));
});

test("Arabic verification and reset copy is localized", () => {
  const verification = getTemplate("email_verification", "ar", {
    adminName: "Alice",
    companyName: "Acme Corp",
    verificationUrl: VERIFICATION_URL,
    expiryLabel: "24 hours",
  });
  assert.ok(verification.html.includes("تأكيد البريد الإلكتروني"));

  const reset = getTemplate("password_reset", "ar", {
    userName: "Carol",
    companyName: "Acme Corp",
    resetUrl: RESET_URL,
    expiryLabel: "15 minutes",
  });
  assert.ok(reset.html.includes("إعادة تعيين كلمة المرور"));
});

// ─── Security ─────────────────────────────────────────────────────────────────

test("HTML characters are properly escaped", () => {
  const result = getTemplate("email_verification", "en", {
    adminName: '<script>alert("xss")</script>',
    companyName: "Acme & Corp",
    verificationUrl: "https://example.com/verify?a=1&b=2",
    expiryLabel: "24 hours",
  });

  assert.ok(!result.html.includes("<script>"));
  assert.ok(result.html.includes("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"));
  assert.ok(result.html.includes("Acme &amp; Corp"));
});

test("token URLs are not altered by the template layer", () => {
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.some-signed-payload";
  const url = `https://app.documind.ai/accept?token=${token}`;
  const result = getTemplate("user_invitation", "en", {
    ...invitationVars,
    invitationUrl: url,
  });
  assert.ok(result.text.includes(url));
  assert.ok(result.html.includes(`href="https://app.documind.ai/accept?token=${token}"`));
  assert.ok(result.html.includes(url));
});

test("raw HTML URLs never contain unescaped ampersands", () => {
  const result = getTemplate("email_verification", "en", {
    adminName: "Alice",
    companyName: "Acme Corp",
    verificationUrl: "https://example.com/verify?a=1&b=2",
    expiryLabel: "24 hours",
  });
  assert.ok(!result.html.includes('href="https://example.com/verify?a=1&b=2"'));
  assert.ok(result.html.includes('href="https://example.com/verify?a=1&amp;b=2"'));
});

// ─── Company lifecycle notices ─────────────────────────────────────────────────

const lifecycleVars = {
  companyName: "Acme Corp",
  effectiveDate: "Mon, 17 Aug 2026 12:00:00 GMT",
  reason: "Policy violation investigation",
};

test("suspended template names the company and states access is restricted", () => {
  const result = getTemplate("company_suspended", "en", lifecycleVars);
  assert.equal(
    result.subject,
    "DocuMind AI — Your organization has been suspended",
  );
  assert.ok(result.html.includes("Acme Corp"));
  assert.ok(result.html.includes("has been suspended"));
  assert.ok(result.html.includes("currently unavailable"));
});

test("suspended template discloses the reason when provided", () => {
  const result = getTemplate("company_suspended", "en", lifecycleVars);
  assert.ok(result.html.includes("Reason:"));
  assert.ok(result.html.includes("Policy violation investigation"));
  assert.ok(result.text.includes("Reason: Policy violation investigation"));
});

test("suspended template omits reason when absent", () => {
  const result = getTemplate("company_suspended", "en", {
    companyName: "Acme Corp",
  });
  assert.ok(!result.html.includes("Reason:"));
  assert.ok(result.html.includes("If you believe this is in error"));
});

test("reactivated template names the company and restores access", () => {
  const result = getTemplate("company_reactivated", "en", lifecycleVars);
  assert.equal(
    result.subject,
    "DocuMind AI — Your organization has been reactivated",
  );
  assert.ok(result.html.includes("Acme Corp"));
  assert.ok(result.html.includes("has been reactivated"));
  assert.ok(result.html.includes("Users may access DocuMind AI again"));
});

test("reactivated template does not promise access for disabled accounts", () => {
  const result = getTemplate("company_reactivated", "en", lifecycleVars);
  assert.ok(result.html.includes("subject to their own account status"));
});

test("lifecycle notices render localized Arabic copy", () => {
  const suspended = getTemplate("company_suspended", "ar", lifecycleVars);
  assert.ok(suspended.html.includes('lang="ar" dir="rtl"'));
  assert.ok(suspended.html.includes("تم إيقاف مؤسستك"));
  assert.ok(suspended.html.includes("Acme Corp"));
  assert.ok(suspended.html.includes("السبب:"));

  const reactivated = getTemplate("company_reactivated", "ar", lifecycleVars);
  assert.ok(reactivated.html.includes("تمت إعادة تنشيط مؤسستك"));
  assert.ok(reactivated.html.includes("Acme Corp"));
});

test("lifecycle notices escape dynamic values", () => {
  const result = getTemplate("company_suspended", "en", {
    companyName: "Acme & Sons",
    reason: '<script>alert("x")</script>',
  });
  assert.ok(result.html.includes("Acme &amp; Sons"));
  assert.ok(!result.html.includes("<script>"));
  assert.ok(!result.html.includes("&lt;script&gt;&lt;/script&gt;"));
});
