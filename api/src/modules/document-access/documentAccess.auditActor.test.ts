import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuditActorKind } from "../../common/observability/auditEvents.js";
import { buildDocumentAccessDeniedAuditEvent } from "./documentAccess.authorization.service.js";

const documentId = "507f1f77bcf86cd799439099";
const tenantA = "507f1f77bcf86cd799439011";
const tenantB = "507f1f77bcf86cd799439012";

test("authenticated custom-role denial retains safe actor attribution", () => {
  const event = buildDocumentAccessDeniedAuditEvent(
    { tenantId: tenantA, actorId: "507f1f77bcf86cd799439013" },
    documentId,
    "use_in_ai",
    "EXPLICIT_DENY",
    { tenantId: tenantA, actorId: "507f1f77bcf86cd799439013", actorEmail: "hr@example.test", baseRole: "EMPLOYEE", customRoleId: "507f1f77bcf86cd799439014" },
  );
  assert.equal(event.actorKind, "USER");
  assert.equal(event.actorEmail, "hr@example.test");
  assert.equal(event.actorRole, "EMPLOYEE");
  assert.equal(event.tenantId, tenantA);
  assert.equal(event.resourceId, documentId);
  assert.deepEqual(event.metadata, { documentId, action: "use_in_ai", reasonCode: "EXPLICIT_DENY", customRoleId: "507f1f77bcf86cd799439014" });
});

test("anonymous denial is explicitly unauthenticated", () => {
  const event = buildDocumentAccessDeniedAuditEvent({ tenantId: tenantA, actorId: "" }, documentId, "read", "MALFORMED_AUTHORIZATION_CONTEXT", null);
  assert.equal(event.actorKind, "UNAUTHENTICATED");
  assert.equal(event.actorId, undefined);
  assert.equal(event.actorEmail, null);
  assert.equal(event.actorRole, null);
});

test("system processing attribution remains SYSTEM", () => {
  assert.equal(resolveAuditActorKind({ actorId: "system" }), "SYSTEM");
});

test("cross-tenant attribution retains actor safely without target content", () => {
  const event = buildDocumentAccessDeniedAuditEvent(
    { tenantId: tenantB, actorId: "507f1f77bcf86cd799439013" },
    documentId,
    "read",
    "MALFORMED_AUTHORIZATION_CONTEXT",
    { tenantId: tenantA, actorId: "507f1f77bcf86cd799439013", actorEmail: "hr@example.test", baseRole: "EMPLOYEE", customRoleId: null },
  );
  assert.equal(event.actorKind, "USER");
  assert.equal(event.actorId, "507f1f77bcf86cd799439013");
  assert.equal(event.tenantId, tenantB);
  assert.equal((event.metadata as Record<string, unknown>).actorTenantId, tenantA);
  assert.equal(Object.prototype.hasOwnProperty.call(event.metadata, "content"), false);
});
