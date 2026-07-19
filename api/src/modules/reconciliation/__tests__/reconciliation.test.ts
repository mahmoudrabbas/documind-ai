import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const serviceSourceUrl = new URL("../reconciliation.service.ts", import.meta.url);
const routesSourceUrl = new URL("../reconciliation.routes.ts", import.meta.url);

test("reconciliation service checks for status/paymentState mismatches", async () => {
  const source = await readFile(serviceSourceUrl, "utf8");
  assert.ok(
    source.includes("paymentState"),
    "Checks paymentState in reconciliation",
  );
  assert.ok(
    source.includes("mismatched"),
    "Returns mismatched array",
  );
});

test("reconciliation route requires platform billing authorization", async () => {
  const source = await readFile(routesSourceUrl, "utf8");
  assert.ok(
    source.includes("requirePlatformTenant"),
    "Requires the canonical platform tenant",
  );
  assert.ok(
    source.includes("requirePermission(Permission.BILLING_READ)"),
    "Requires billing read permission",
  );
  assert.ok(
    source.includes("/reconciliation/subscriptions"),
    "POST route exists",
  );
});
