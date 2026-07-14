import assert from "node:assert/strict";
import test from "node:test";
import { getSecretValue } from "./secretEnv.js";

test("prefers a mounted secret file over the plain environment variable", () => {
  process.env.JWT_SECRET = "from-env";
  process.env.JWT_SECRET_FILE = "/tmp/docsai-secret-test";

  assert.equal(getSecretValue("JWT_SECRET"), "from-file");
});

test("falls back to the plain environment variable when no secret file is provided", () => {
  delete process.env.JWT_SECRET_FILE;
  process.env.JWT_SECRET = "from-env";

  assert.equal(getSecretValue("JWT_SECRET"), "from-env");
});
