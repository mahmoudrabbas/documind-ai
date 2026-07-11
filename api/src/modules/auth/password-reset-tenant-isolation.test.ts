import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import RefreshTokenModel from "../../db/models/refreshToken.model.js";
import { forgotPassword, resetPassword } from "./auth.service.js";
import { createPasswordResetToken } from "./passwordResetToken.js";
import { verifyPassword } from "./passwordHashing.js";

let mongoServer: MongoMemoryServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "6.0.20" },
  });
  await mongoose.connect(mongoServer.getUri(), { dbName: "password-reset-isolation" });
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Promise.all([
    TenantModel.deleteMany({}),
    UserModel.deleteMany({}),
    RefreshTokenModel.deleteMany({}),
  ]);
});

async function seedSameEmailAccounts() {
  const [tenantA, tenantB] = await TenantModel.create([
    { name: "Alpha Company", slug: "alpha-company", status: "active", plan: "free" },
    { name: "Beta Company", slug: "beta-company", status: "active", plan: "free" },
  ]);
  const [userA, userB] = await UserModel.create([
    { tenantId: tenantA._id, name: "Marco A", email: "marco@example.com", passwordHash: "password-A", role: "EMPLOYEE", status: "active", emailVerified: true },
    { tenantId: tenantB._id, name: "Marco B", email: "marco@example.com", passwordHash: "password-B", role: "EMPLOYEE", status: "active", emailVerified: true },
  ]);
  return { tenantA, tenantB, userA, userB };
}

async function installResetToken(tenantId: string, userId: string) {
  const token = createPasswordResetToken({ tenantId, userId });
  await UserModel.updateOne(
    { _id: userId, tenantId },
    { $set: { passwordResetTokenHash: token.tokenHash, passwordResetExpiresAt: token.expiresAt } },
  );
  return token;
}

test("forgot password only creates a token for the matching tenant account", async () => {
  const { userA, userB } = await seedSameEmailAccounts();
  const result = await forgotPassword({ email: " MARCO@example.com ", slug: " ALPHA-COMPANY " });
  const [storedA, storedB] = await Promise.all([
    UserModel.findById(userA.id).select("+passwordResetTokenHash +passwordResetExpiresAt"),
    UserModel.findById(userB.id).select("+passwordResetTokenHash +passwordResetExpiresAt"),
  ]);
  assert.equal(result.success, true);
  assert.ok(storedA?.passwordResetTokenHash);
  assert.equal(storedB?.passwordResetTokenHash, null);
  assert.equal(storedB?.passwordResetExpiresAt, null);
});

test("reset changes and revokes only the selected tenant account", async () => {
  const { tenantA, tenantB, userA, userB } = await seedSameEmailAccounts();
  const tokenA = await installResetToken(tenantA._id.toString(), userA._id.toString());
  const tokenB = await installResetToken(tenantB._id.toString(), userB._id.toString());
  await RefreshTokenModel.create([
    { tenantId: tenantA._id, userId: userA._id, tokenHash: "a".repeat(64), jtiHash: "b".repeat(64), familyId: "family-a", expiresAt: new Date(Date.now() + 60_000) },
    { tenantId: tenantB._id, userId: userB._id, tokenHash: "c".repeat(64), jtiHash: "d".repeat(64), familyId: "family-b", expiresAt: new Date(Date.now() + 60_000) },
  ]);

  await resetPassword({ token: tokenA.token, slug: "alpha-company", password: "newPassword1", confirmPassword: "newPassword1" });

  const [storedA, storedB, sessionA, sessionB] = await Promise.all([
    UserModel.findById(userA.id).select("+passwordHash +passwordResetTokenHash"),
    UserModel.findById(userB.id).select("+passwordHash +passwordResetTokenHash"),
    RefreshTokenModel.findOne({ tenantId: tenantA._id, userId: userA._id }),
    RefreshTokenModel.findOne({ tenantId: tenantB._id, userId: userB._id }),
  ]);
  assert.equal(await verifyPassword(storedA!.passwordHash, "newPassword1"), true);
  assert.equal(storedB?.passwordHash, "password-B");
  assert.equal(storedA?.passwordResetTokenHash, null);
  assert.equal(storedB?.passwordResetTokenHash, tokenB.tokenHash);
  assert.ok(sessionA?.revokedAt);
  assert.equal(sessionB?.revokedAt, null);
});

test("a token cannot be used with another tenant slug and is not consumed", async () => {
  const { tenantA, userA, userB } = await seedSameEmailAccounts();
  const tokenA = await installResetToken(tenantA._id.toString(), userA._id.toString());
  await assert.rejects(
    resetPassword({ token: tokenA.token, slug: "beta-company", password: "newPassword1", confirmPassword: "newPassword1" }),
    /Invalid or expired password reset token/,
  );
  const [storedA, storedB] = await Promise.all([
    UserModel.findById(userA.id).select("+passwordHash +passwordResetTokenHash"),
    UserModel.findById(userB.id).select("+passwordHash"),
  ]);
  assert.equal(storedA?.passwordHash, "password-A");
  assert.equal(storedB?.passwordHash, "password-B");
  assert.equal(storedA?.passwordResetTokenHash, tokenA.tokenHash);
});

test("an unknown slug receives the same generic forgot-password success", async () => {
  const result = await forgotPassword({ email: "marco@example.com", slug: "unknown-company" });
  assert.deepEqual(result, {
    success: true,
    message: "If an account matches the provided company and email, password reset instructions will be sent.",
  });
});
