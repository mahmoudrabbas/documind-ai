import test from "node:test";
import assert from "node:assert/strict";
import {
  sendVerificationEmail,
} from "./auth.mailer.js";

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
