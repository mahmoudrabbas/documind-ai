import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { syncPdfjsAssets } from "./copy-pdfjs-assets.mjs";

function createFixture(version = "4.10.38") {
  const root = mkdtempSync(join(tmpdir(), "pdfjs-assets-"));
  const pdfjsRoot = join(root, "node_modules", "pdfjs-dist");
  const destRoot = join(root, "public", "pdfjs");

  mkdirSync(join(pdfjsRoot, "cmaps"), { recursive: true });
  mkdirSync(join(pdfjsRoot, "standard_fonts"), { recursive: true });
  writeFileSync(join(pdfjsRoot, "package.json"), JSON.stringify({ version }));
  writeFileSync(join(pdfjsRoot, "cmaps", "H.bcmap"), "cmap-v1");
  writeFileSync(join(pdfjsRoot, "standard_fonts", "Font.pfb"), "font-v1");

  return { root, pdfjsRoot, destRoot };
}

test("copies assets on first sync and skips an unchanged version", () => {
  const fixture = createFixture();

  try {
    const first = syncPdfjsAssets(fixture);
    const copied = join(fixture.destRoot, "cmaps", "H.bcmap");
    const firstMtime = statSync(copied).mtimeMs;

    const second = syncPdfjsAssets(fixture);

    assert.deepEqual(first, { skipped: false, version: "4.10.38" });
    assert.deepEqual(second, { skipped: true, version: "4.10.38" });
    assert.equal(readFileSync(copied, "utf8"), "cmap-v1");
    assert.equal(statSync(copied).mtimeMs, firstMtime);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("resyncs on a version change and removes stale destination files", () => {
  const fixture = createFixture();

  try {
    syncPdfjsAssets(fixture);
    const stale = join(fixture.destRoot, "cmaps", "stale.bcmap");
    writeFileSync(stale, "stale");
    writeFileSync(
      join(fixture.pdfjsRoot, "package.json"),
      JSON.stringify({ version: "4.10.39" }),
    );
    writeFileSync(join(fixture.pdfjsRoot, "cmaps", "H.bcmap"), "cmap-v2");

    const result = syncPdfjsAssets(fixture);

    assert.deepEqual(result, { skipped: false, version: "4.10.39" });
    assert.equal(readFileSync(join(fixture.destRoot, "cmaps", "H.bcmap"), "utf8"), "cmap-v2");
    assert.throws(() => statSync(stale), { code: "ENOENT" });
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("keeps Docker lifecycle inputs available without sending generated assets", () => {
  const dockerfile = readFileSync("app/Dockerfile", "utf8");
  const dockerignore = readFileSync(".dockerignore", "utf8");

  assert.match(
    dockerfile,
    /COPY scripts\/copy-pdfjs-assets\.mjs scripts\/copy-pdfjs-assets\.mjs/,
  );
  assert.match(dockerignore, /^app\/public\/pdfjs$/m);
});
