import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { validateBootstrapInput } from "./bootstrap.validator.js";

test("bootstrap input normalizes safe fields", () => {
  assert.deepEqual(validateBootstrapInput({ name: " Platform Admin ", email: "ADMIN@EXAMPLE.COM ", password: "StrongPassword1" }), { name: "Platform Admin", email: "admin@example.com", password: "StrongPassword1" });
});
test("bootstrap input rejects weak passwords and privileged fields", () => {
  assert.throws(() => validateBootstrapInput({ name: "Platform Admin", email: "admin@example.com", password: "weak", role: "SUPER_ADMIN" }), AppError);
  assert.throws(() => validateBootstrapInput({ name: "Platform Admin", email: "admin@example.com", password: "StrongPassword1", tenantId: "controlled" }), AppError);
});
