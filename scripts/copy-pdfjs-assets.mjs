// Copies pdfjs-dist runtime assets (cmaps + standard fonts) from node_modules
// into app/public/pdfjs/, where the PDF viewer serves them at runtime
// (see app/src/components/documents/PdfViewerModal.tsx).
//
// These are third-party binaries; they are deliberately not committed to git
// (see .gitignore) and are restored by this script via `predev`/`prebuild`
// hooks in app/package.json.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pdfjsRoot = resolve(root, "app", "node_modules", "pdfjs-dist");
const destRoot = resolve(root, "app", "public", "pdfjs");

const assets = [
  { source: "cmaps", target: "cmaps" },
  { source: "standard_fonts", target: "standard_fonts" },
];

for (const { source, target } of assets) {
  const src = resolve(pdfjsRoot, source);
  const dest = resolve(destRoot, target);

  if (!existsSync(src)) {
    console.error(
      `[copy-pdfjs-assets] Missing source ${src}. ` +
        "Run `npm ci` in the app workspace first.",
    );
    process.exit(1);
  }

  mkdirSync(destRoot, { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`[copy-pdfjs-assets] ${src} -> ${dest}`);
}

console.log("[copy-pdfjs-assets] pdfjs assets ready.");
