import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditLogModel from "./auditLog.model.js";

function buildAuditLog(
  overrides: Record<string, unknown> = {},
) {
  return new AuditLogModel({
    tenantId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    resourceType: "User",
    resourceId: "resource-1",
    action: "AUTH_LOGIN_SUCCESS",
    actorId: new mongoose.Types.ObjectId(),
    actorEmail: "actor@example.com",
    actorRole: "COMPANY_ADMIN",
    actorKind: "USER",
    changes: {},
    ...overrides,
  });
}

test("authenticated SUPER_ADMIN audit records validate", async () => {
  await assert.doesNotReject(
    buildAuditLog({ actorRole: "SUPER_ADMIN" }).validate(),
  );
});

test("authenticated COMPANY_ADMIN audit records validate", async () => {
  await assert.doesNotReject(
    buildAuditLog({ actorRole: "COMPANY_ADMIN" }).validate(),
  );
});

test("authenticated EMPLOYEE audit records validate", async () => {
  await assert.doesNotReject(
    buildAuditLog({ actorRole: "EMPLOYEE" }).validate(),
  );
});

test("system audit records validate with null actorRole", async () => {
  await assert.doesNotReject(
    buildAuditLog({
      tenantId: "system",
      userId: "system",
      actorId: "system",
      actorEmail: "system@documind.ai",
      actorRole: null,
      actorKind: "SYSTEM",
      action: "SYSTEM_STARTUP",
      resourceType: "System",
      resourceId: "startup",
    }).validate(),
  );
});

test("unauthenticated login audit records validate with null actorRole", async () => {
  await assert.doesNotReject(
    buildAuditLog({
      tenantId: new mongoose.Types.ObjectId(),
      userId: "system",
      actorId: "system",
      actorEmail: "missing-user@example.com",
      actorRole: null,
      actorKind: "UNAUTHENTICATED",
      action: "AUTH_LOGIN_FAILURE",
      outcome: "DENIED",
    }).validate(),
  );
});

test("empty string actorRole is rejected", async () => {
  await assert.rejects(
    buildAuditLog({ actorRole: "" }).validate(),
    (error: unknown) =>
      error instanceof mongoose.Error.ValidationError &&
      Boolean(error.errors.actorRole),
  );
});

test("UNKNOWN actorRole is rejected", async () => {
  await assert.rejects(
    buildAuditLog({ actorRole: "UNKNOWN" }).validate(),
    (error: unknown) =>
      error instanceof mongoose.Error.ValidationError &&
      Boolean(error.errors.actorRole),
  );
});

test("arbitrary actorRole is rejected", async () => {
  await assert.rejects(
    buildAuditLog({ actorRole: "ARBITRARY_ROLE" }).validate(),
    (error: unknown) =>
      error instanceof mongoose.Error.ValidationError &&
      Boolean(error.errors.actorRole),
  );
});
