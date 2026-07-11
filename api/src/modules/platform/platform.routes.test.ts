import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("./platform.routes.ts", import.meta.url);

test("every platform control-center route is protected by Super Admin authorization", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(
    source,
    /router\.use\(authenticate, authorize\("SUPER_ADMIN"\)\)/,
  );
  for (const route of [
    "/overview",
    "/packages",
    "/subscriptions",
    "/users",
    "/usage",
    "/jobs",
    "/system-health",
    "/audit",
    "/ai-configuration",
    "/settings",
  ]) {
    assert.ok(source.includes(`"${route}`), `missing protected route ${route}`);
  }
});
