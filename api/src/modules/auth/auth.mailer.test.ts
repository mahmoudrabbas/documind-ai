import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../../config/index.js";
import {
  buildInvitationTemplate,
  sendVerificationEmail,
} from "./auth.mailer.js";

test("sendVerificationEmail resolves when SMTP configuration is missing in development", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalConfig = { ...config };

  try {
    process.env.NODE_ENV = "development";
    config.SEND_EMAILS = true;
    config.SMTP_HOST = "";
    config.SMTP_USER = "";
    config.SMTP_PASS = "";
    config.SMTP_FROM = "";

    await sendVerificationEmail({
      to: "test@example.com",
      adminName: "Test Admin",
      companyName: "Test Company",
      verificationUrl: "http://localhost:3000/verify-email?token=test-token",
    });
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    Object.assign(config, originalConfig);
  }
});

test("invitation email clearly identifies company, inviter, role, and expiry", () => {
  const token = "sensitive-invite-token";
  const url = `http://localhost:3000/set-password-from-invite?token=${token}`;
  const template = buildInvitationTemplate({
    companyName: "Acme & Partners",
    inviterName: "Sarah <Admin>",
    inviterEmail: "sarah@acme.test",
    role: "COMPANY_ADMIN",
    invitationUrl: url,
    expiryDate: new Date("2030-01-02T03:04:05.000Z"),
  });
  assert.match(template.subject, /Acme & Partners/);
  assert.match(template.text, /Sarah <Admin> \(sarah@acme.test\)/);
  assert.match(template.text, /company admin/);
  assert.match(template.text, /2030/);
  assert.equal(template.text.split(url).length - 1, 1);
  assert.equal(template.html.includes("Sarah &lt;Admin&gt;"), true);
  assert.equal(template.html.includes("Acme &amp; Partners"), true);
  assert.equal(template.html.includes(`>${token}<`), false);
  assert.equal((template.html.match(/Accept invitation/g) ?? []).length, 1);
});
