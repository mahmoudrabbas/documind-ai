import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { scanTrackedFiles } from "./check-committed-secrets.mjs";

test("rejects runtime secret paths without reading their values into output", () => {
  const root = mkdtempSync(join(tmpdir(), "documind-secret-scan-"));
  try {
    writeFileSync(join(root, "runtime.env"), "sensitive fixture", "utf8");
    assert.deepEqual(scanTrackedFiles(root, ["secrets/runtime.env"]), [
      { path: "secrets/runtime.env", rule: "forbidden-secret-path" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts sanitized examples and detects credential signatures by rule name", () => {
  const root = mkdtempSync(join(tmpdir(), "documind-secret-scan-"));
  try {
    writeFileSync(join(root, "safe.example"), "JWT_SECRET=replace-me", "utf8");
    writeFileSync(join(root, "unsafe.txt"), "-----BEGIN " + "PRIVATE KEY-----", "utf8");
    assert.deepEqual(scanTrackedFiles(root, ["safe.example"]), []);
    assert.deepEqual(scanTrackedFiles(root, ["unsafe.txt"]), [
      { path: "unsafe.txt", rule: "private-key" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
