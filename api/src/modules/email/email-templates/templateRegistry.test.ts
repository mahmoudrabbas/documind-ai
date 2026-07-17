import test from "node:test";
import assert from "node:assert/strict";
import { getTemplate } from "./templateRegistry.js";

test("EmailVerification template renders correctly in English", () => {
  const result = getTemplate(
    "email_verification",
    "en",
    {
      adminName: "Alice",
      companyName: "Acme Corp",
      verificationUrl: "https://example.com/verify",
      expiryLabel: "24 hours",
    },
    { accentColor: "#ff0000" },
  );

  assert.equal(result.subject, "Verify your DocuMind AI account");
  assert.ok(result.html.includes("Acme Corp"));
  assert.ok(result.html.includes("https://example.com/verify"));
  assert.ok(result.html.includes("#ff0000")); // uses the accent color
});

test("EmailVerification template renders correctly in Arabic", () => {
  const result = getTemplate(
    "email_verification",
    "ar",
    {
      adminName: "Alice",
      companyName: "Acme Corp",
      verificationUrl: "https://example.com/verify",
      expiryLabel: "24 hours",
    },
    { accentColor: "#ff0000" },
  );

  assert.ok(result.html.includes('dir="rtl"'));
  assert.ok(result.html.includes("مرحباً Alice"));
  assert.ok(result.html.includes("Acme Corp"));
});

test("UserInvitation template renders correctly", () => {
  const result = getTemplate(
    "user_invitation",
    "en",
    {
      companyName: "Acme Corp",
      inviterName: "Bob",
      role: "COMPANY_ADMIN",
      invitationUrl: "https://example.com/invite",
      expiryDate: "2024-01-01T00:00:00Z",
    },
  );

  assert.equal(result.subject, "You have been invited to join Acme Corp on DocuMind AI");
  assert.ok(result.html.includes("company admin"));
});

test("HTML characters are properly escaped", () => {
  const result = getTemplate(
    "email_verification",
    "en",
    {
      adminName: '<script>alert("xss")</script>',
      companyName: "Acme & Corp",
      verificationUrl: "https://example.com/verify?a=1&b=2",
      expiryLabel: "24 hours",
    },
  );

  assert.ok(!result.html.includes("<script>"));
  assert.ok(result.html.includes("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"));
  assert.ok(result.html.includes("Acme &amp; Corp"));
});
