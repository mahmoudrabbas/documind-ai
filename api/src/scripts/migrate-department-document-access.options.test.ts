import assert from "node:assert/strict";
import test from "node:test";
import { parseDepartmentAccessArguments } from "./migrate-department-document-access.js";

const tenantId = "64a000000000000000000001";

test("department access migration requires an explicit tenant and defaults to dry-run", () => {
  assert.throws(() => parseDepartmentAccessArguments([]), /--tenant-id is required/);
  assert.deepEqual(parseDepartmentAccessArguments(["--tenant-id", tenantId]), {
    apply: false, tenantId, afterId: undefined, batchSize: 50, limit: 10_000,
  });
});

test("only --apply enables writes and bounds batch options", () => {
  assert.equal(parseDepartmentAccessArguments(["--tenant-id", tenantId, "--apply"]).apply, true);
  assert.throws(() => parseDepartmentAccessArguments(["--tenant-id", tenantId, "--batch-size", "251"]), /--batch-size/);
  assert.throws(() => parseDepartmentAccessArguments(["--tenant-id", tenantId, "--apply", "--dry-run"]), /only one migration mode/);
});
