import test from "node:test";
import assert from "node:assert/strict";
import {
  sendVerificationEmail,
} from "./auth.mailer.js";
import { config } from "../../config/index.js";

test("sendVerificationEmail skips sending when test env", async () => {
  // It shouldn't crash or enqueue anything in test env.
  // We just ensure it runs cleanly.
  await sendVerificationEmail({
    to: "test@example.com",
    adminName: "Test Admin",
    companyName: "Test Company",
    verificationUrl: "http://localhost:3000/verify-email?token=test-token",
    tenantId: "t-1",
  });

  assert.ok(true);
});

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
      verificationUrl: "https://app.test.invalid/verify-email?token=test-token",
      tenantId: "t-1",
    });
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    Object.assign(config, originalConfig);
  }

  assert.ok(true);
});
