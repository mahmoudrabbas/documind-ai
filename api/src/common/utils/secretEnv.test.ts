import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getSecretValue } from "./secretEnv.js";

test("prefers a mounted secret file over the plain environment variable", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "docsai-secret-"));
  const secretFile = join(tempDir, "jwt-secret");

  try {
    writeFileSync(secretFile, "from-file\n", "utf8");

    process.env.JWT_SECRET = "from-env";
    process.env.JWT_SECRET_FILE = secretFile;

    assert.equal(getSecretValue("JWT_SECRET"), "from-file");
  } finally {
    delete process.env.JWT_SECRET_FILE;
    delete process.env.JWT_SECRET;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("falls back to the plain environment variable when no secret file is provided", () => {
  delete process.env.JWT_SECRET_FILE;
  process.env.JWT_SECRET = "from-env";

  assert.equal(getSecretValue("JWT_SECRET"), "from-env");
  delete process.env.JWT_SECRET;
});

test("a configured missing secret file fails without exposing fallback content", () => {
  process.env.JWT_SECRET_FILE = "/does-not-exist/documind-secret";
  process.env.JWT_SECRET = "fallback-must-not-be-used";
  try {
    assert.throws(
      () => getSecretValue("JWT_SECRET"),
      (error: unknown) => error instanceof Error && error.message === "Unable to load configured secret: JWT_SECRET_FILE" && !error.message.includes("fallback-must-not-be-used"),
    );
  } finally {
    delete process.env.JWT_SECRET_FILE;
    delete process.env.JWT_SECRET;
  }
});
