import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalStorageProvider } from "./index.js";

test("LocalStorageProvider uses forward slashes for logical storage keys", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "documind-storage-test-"));
  try {
    const provider = new LocalStorageProvider(baseDir);
    const key = await provider.saveFile(Buffer.from("logo"), "logo.png", "tenant-1");

    assert.match(
      key,
      /^tenant-1\/[a-f0-9-]{36}\.png$/u,
    );
    assert.equal(key.includes("\\"), false);
    assert.deepEqual(await provider.getFileBuffer(key), Buffer.from("logo"));
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});
