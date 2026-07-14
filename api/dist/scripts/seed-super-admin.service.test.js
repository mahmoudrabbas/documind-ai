import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSeedInput } from "./seed-super-admin.service.js";
const valid = {
    platformName: " DocuMind AI ",
    platformSlug: " DocuMind AI ",
    name: " Platform Admin ",
    email: " ADMIN@EXAMPLE.COM ",
    password: "long-secret-password",
};
test("normalizes Super Admin seed identity values", () => {
    assert.deepEqual(normalizeSeedInput(valid), {
        platformName: "DocuMind AI",
        platformSlug: "documind-ai",
        name: "Platform Admin",
        email: "admin@example.com",
        password: "long-secret-password",
    });
});
test("fails clearly when a required seed value is missing", () => {
    assert.throws(() => normalizeSeedInput({ ...valid, email: "" }), /Missing required Super Admin seed values: email/);
});
test("rejects unsafe seed passwords", () => {
    assert.throws(() => normalizeSeedInput({ ...valid, password: "short" }), /at least 12 characters/);
});
//# sourceMappingURL=seed-super-admin.service.test.js.map