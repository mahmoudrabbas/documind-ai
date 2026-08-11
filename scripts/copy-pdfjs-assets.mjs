import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");
const appRoot = resolve(root, "app");
const destRoot = resolve(appRoot, "public", "pdfjs");
const markerName = ".asset-version.json";
const assets = ["cmaps", "standard_fonts"];

function installedPdfjsRoot() {
  const appRequire = createRequire(resolve(appRoot, "package.json"));
  return dirname(appRequire.resolve("pdfjs-dist/package.json"));
}

function readVersion(pdfjsRoot) {
  const packageJson = JSON.parse(
    readFileSync(resolve(pdfjsRoot, "package.json"), "utf8"),
  );

  if (typeof packageJson.version !== "string" || packageJson.version === "") {
    throw new Error(`Invalid pdfjs-dist package metadata at ${pdfjsRoot}`);
  }

  return packageJson.version;
}

function markerMatches(targetRoot, version) {
  const markerPath = resolve(targetRoot, markerName);
  if (!existsSync(markerPath) || assets.some((asset) => !existsSync(resolve(targetRoot, asset)))) {
    return false;
  }

  try {
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    return marker.version === version;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return false;
    }
    throw error;
  }
}

export function syncPdfjsAssets({ pdfjsRoot, destRoot: targetRoot }) {
  const version = readVersion(pdfjsRoot);
  if (markerMatches(targetRoot, version)) {
    return { skipped: true, version };
  }

  mkdirSync(targetRoot, { recursive: true });
  for (const asset of assets) {
    const source = resolve(pdfjsRoot, asset);
    const target = resolve(targetRoot, asset);
    if (!existsSync(source)) {
      throw new Error(`Missing pdfjs-dist asset directory: ${source}`);
    }

    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
  }

  const markerPath = resolve(targetRoot, markerName);
  const temporaryMarkerPath = `${markerPath}.tmp`;
  writeFileSync(temporaryMarkerPath, `${JSON.stringify({ version })}\n`);
  renameSync(temporaryMarkerPath, markerPath);
  return { skipped: false, version };
}

function main() {
  const result = syncPdfjsAssets({
    pdfjsRoot: installedPdfjsRoot(),
    destRoot,
  });
  const action = result.skipped ? "already current" : "copied";
  console.log(`[copy-pdfjs-assets] pdfjs-dist ${result.version} assets ${action}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main();
}
