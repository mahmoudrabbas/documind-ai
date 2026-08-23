import test from "node:test";
import assert from "node:assert/strict";
import { humanizeToolFailure } from "../action/resolveActionTarget.js";

test("humanizeToolFailure: entitlement exceeded with upgrade guidance", () => {
  const result = humanizeToolFailure(
    {
      code: "ENTITLEMENT_EXCEEDED",
      message: "Quota exceeded for employees: 5/5",
      details: { dimension: "employees", current: 5, limit: 5, canUpgrade: true },
    },
    "user.invite",
  );
  assert.equal(result.code, "ENTITLEMENT_EXCEEDED");
  assert.match(result.message, /plan's limit of 5 team members/);
  assert.match(result.message, /Upgrade your plan/);
});

test("humanizeToolFailure: entitlement exceeded without upgrade permission", () => {
  const result = humanizeToolFailure(
    {
      code: "ENTITLEMENT_EXCEEDED",
      message: "Quota exceeded for employees: 3/3",
      details: { limit: 3, canUpgrade: false },
    },
    "user.invite",
  );
  assert.match(result.message, /Ask a company admin to upgrade/);
  assert.doesNotMatch(result.message, /Upgrade your plan to invite/);
});

test("humanizeToolFailure: entitlement exceeded without details falls back to the message", () => {
  const result = humanizeToolFailure(
    { code: "ENTITLEMENT_EXCEEDED", message: "Quota exceeded for employees: 2/2" },
    "user.invite",
  );
  assert.match(result.message, /plan's limit of 2 team members/);
});

test("humanizeToolFailure: missing document is friendly", () => {
  const result = humanizeToolFailure(
    { code: "DOCUMENT_NOT_FOUND", message: "Document not found" },
    "document.softDelete",
  );
  assert.match(result.message, /document was not found/);
  assert.doesNotMatch(result.message, /Document not found/);
});

test("humanizeToolFailure: soft-delete requirement explains the auto-soft-delete", () => {
  const result = humanizeToolFailure(
    { code: "DOCUMENT_NOT_SOFT_DELETED", message: "must be soft deleted" },
    "document.permanentDelete",
  );
  assert.match(result.message, /moved to trash automatically/);
});

test("humanizeToolFailure: duplicate email is friendly", () => {
  const result = humanizeToolFailure(
    { code: "EMAIL_ALREADY_EXISTS", message: "Email already exists in this tenant" },
    "user.invite",
  );
  assert.match(result.message, /already exists in your company/);
});

test("humanizeToolFailure: permission denial steers to an admin", () => {
  const result = humanizeToolFailure(
    { code: "PERMISSION_DENIED", message: "denied" },
    "settings.update",
  );
  assert.match(result.message, /Ask a company admin/);
});

test("humanizeToolFailure: missing target field keeps the guidance copy", () => {
  const result = humanizeToolFailure(
    { code: "INVALID_TOOL_INPUT", message: "documentId is required" },
    "document.archive",
  );
  assert.equal(result.code, "TARGET_NOT_FOUND");
  assert.match(result.message, /name the document/);
});

test("humanizeToolFailure: unknown failures return generic message", () => {
  const result = humanizeToolFailure(
    { code: "RUN_FAILED", message: "Something exploded" },
    "document.search",
  );
  assert.match(result.message, /Something went wrong/);
});

test("humanizeToolFailure: privilege escalation steers to delegable permissions", () => {
  const result = humanizeToolFailure(
    { code: "PRIVILEGE_ESCALATION", message: "Permission is not delegable by tenant administrators" },
    "roles.create",
  );
  assert.match(result.message, /can't be delegated/);
  assert.match(result.message, /Remove those permissions/);
});

test("humanizeToolFailure: unknown permission explains the offending grant", () => {
  const result = humanizeToolFailure(
    {
      code: "UNKNOWN_PERMISSION",
      message: "Unknown, deprecated, or inactive permission identifier",
    },
    "roles.create",
  );
  assert.match(result.message, /doesn't exist/);
});

test("humanizeToolFailure: roles.create validation surfaces scope details", () => {
  const result = humanizeToolFailure(
    {
      code: "VALIDATION_ERROR",
      message: "Invalid permission grant",
      details: {
        grants: [
          { field: "grants", message: "empty grant scopes are ambiguous; omit scopes for unrestricted access" },
        ],
      },
    },
    "roles.create",
  );
  assert.match(result.message, /couldn't be saved/);
  assert.match(result.message, /empty grant scopes/);
});

test("humanizeToolFailure: non-role validation errors return generic message", () => {
  const result = humanizeToolFailure(
    {
      code: "VALIDATION_ERROR",
      message: "Invalid permission grant",
      details: {
        grants: [{ field: "grants", message: "empty grant scopes are ambiguous" }],
      },
    },
    "user.invite",
  );
  assert.match(result.message, /Something went wrong/);
});

test("humanizeToolFailure: NOT_FOUND with user target shows user message", () => {
  const result = humanizeToolFailure(
    { code: "NOT_FOUND", message: "Target user not found" },
    "user.delete",
  );
  assert.match(result.message, /user was not found/);
  assert.doesNotMatch(result.message, /document was not found/);
});

test("humanizeToolFailure: NOT_FOUND with document target shows document message", () => {
  const result = humanizeToolFailure(
    { code: "NOT_FOUND", message: "Target document not found" },
    "document.softDelete",
  );
  assert.match(result.message, /document was not found/);
  assert.doesNotMatch(result.message, /user was not found/);
});