import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// The token is signed with the API-shared secret via the config singleton, so
// it must be set before the module (and its config import) is evaluated.
process.env.EMAIL_VERIFICATION_JWT_SECRET =
  "test-worker-email-verification-secret";

const { USER_INVITATION_PURPOSE, createUserInvitationToken, hashVerificationJti } =
  await import("./userInvitationToken.js");

test("createUserInvitationToken produces an API-verifiable HS256 token", () => {
  const result = createUserInvitationToken({
    userId: "64b1c2d3e4f5a6b7c8d9e0f1",
    tenantId: "64b1c2d3e4f5a6b7c8d9e0f2",
    email: "alice@test.com",
    expiresIn: "24h",
  });

  const [encodedHeader, encodedPayload, signature] = result.token.split(".");

  assert.ok(encodedHeader);
  assert.ok(encodedPayload);
  assert.ok(signature);

  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  assert.deepEqual(header, { alg: "HS256", typ: "JWT" });

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  );
  assert.equal(payload.sub, "64b1c2d3e4f5a6b7c8d9e0f1");
  assert.equal(payload.tenantId, "64b1c2d3e4f5a6b7c8d9e0f2");
  assert.equal(payload.email, "alice@test.com");
  assert.equal(payload.purpose, USER_INVITATION_PURPOSE);
  assert.equal(payload.jti, result.jti);
  assert.equal(payload.exp, Math.floor(result.expiresAt.getTime() / 1000));

  const expectedSignature = crypto
    .createHmac("sha256", process.env.EMAIL_VERIFICATION_JWT_SECRET!)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  assert.equal(signature, expectedSignature);

  assert.equal(result.tokenHash, hashVerificationJti(result.jti));
  assert.equal(result.tokenHash.length, 64);
  assert.ok(result.expiresAt.getTime() > Date.now());
});

test("default expiry falls back to EMAIL_VERIFICATION_JWT_EXPIRES_IN when unset", () => {
  const result = createUserInvitationToken({
    userId: "u1",
    tenantId: "t1",
    email: "bob@test.com",
  });
  assert.ok(result.expiresAt.getTime() > Date.now());
});
