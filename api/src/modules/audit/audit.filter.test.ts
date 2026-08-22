import test from "node:test";
import assert from "node:assert/strict";
import { buildTenantAuditFilter } from "./audit.repository.js";

test("audit action filters accept safe partial input without query operators", () => {
  const query = buildTenantAuditFilter("507f1f77bcf86cd799439011", { action: "policy" });
  assert.deepEqual(query.action, { $regex: "policy", $options: "i" });
});

test("audit action filter escapes regex metacharacters", () => {
  const query = buildTenantAuditFilter("507f1f77bcf86cd799439011", { action: "policy.*" });
  assert.deepEqual(query.action, { $regex: "policy\\.\\*", $options: "i" });
});
