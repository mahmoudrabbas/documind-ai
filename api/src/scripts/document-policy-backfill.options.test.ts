import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../common/errors/AppError.js";
import { parseDocumentPolicyBackfillOptions } from "./document-policy-backfill.options.js";

const tenant = "64a000000000000000000001";
test("CLI defaults to dry-run and accepts inline or separated bounded options", () => {
  assert.deepEqual(parseDocumentPolicyBackfillOptions([`--tenant-id=${tenant}`, "--batch-size", "25", "--limit=100"]),
    { apply: false, tenantId: tenant, batchSize: 25, limit: 100 });
});
test("--apply is the only way to enable writes", () => { assert.equal(parseDocumentPolicyBackfillOptions(["--tenant-id", tenant, "--apply"]).apply, true); });
test("invalid options and excessive batch size fail synchronously", () => {
  for (const arguments_ of [[], ["--tenant-id", tenant, "--batch-size", "251"], ["--tenant-id", tenant, "--unknown"]]) {
    assert.throws(() => parseDocumentPolicyBackfillOptions(arguments_), (error) => error instanceof AppError);
  }
});
test("checkpoint and after-id are valid but mutually exclusive", () => {
  assert.throws(() => parseDocumentPolicyBackfillOptions(["--tenant-id", tenant, "--checkpoint", tenant, "--after-id", tenant]), AppError);
});
