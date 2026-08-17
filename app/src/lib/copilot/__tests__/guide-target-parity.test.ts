/**
 * Parity test (guider.md §16 / "No AI-guessed UI targets"): every
 * `data-guide-id` anchor wired into the app source must be registered in the
 * client-side Guide Target Registry (`guide-targets.ts`), which mirrors the
 * backend registry. An unregistered id is a bug by construction — the overlay
 * would render nothing and log a dev warning.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";
import {
  GUIDE_TARGET_IDS,
  isKnownGuideTarget,
} from "@/lib/copilot/guide-targets";

const SRC_ROOT = join(__dirname, "..", "..", "..");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "__tests__")
      continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Extract quoted data-guide-id / guideId literals from a source file. */
function extractGuideIds(source: string): string[] {
  const ids: string[] = [];
  const patterns = [/data-guide-id="([a-z0-9-]+)"/g, /guideId="([a-z0-9-]+)"/g];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      ids.push(match[1]);
    }
  }
  return ids;
}

describe("guide target parity (registry ⇄ app anchors)", () => {
  const files = listSourceFiles(SRC_ROOT).filter((file) =>
    /src\/(app|components|lib)\//.test(file.replaceAll("\\", "/")),
  );
  const occurrences: Array<{ file: string; ids: string[] }> = [];
  for (const file of files) {
    const ids = extractGuideIds(readFileSync(file, "utf8"));
    if (ids.length > 0)
      occurrences.push({
        file: relative(SRC_ROOT, file).replaceAll("\\", "/"),
        ids,
      });
  }

  it("every data-guide-id used in the app is registered", () => {
    const unregistered = new Map<string, string[]>();
    for (const { file, ids } of occurrences) {
      for (const id of new Set(ids)) {
        if (!isKnownGuideTarget(id)) {
          unregistered.set(id, [...(unregistered.get(id) ?? []), file]);
        }
      }
    }
    expect([...unregistered.entries()]).toEqual([]);
  });

  it("every registered target has at least one anchor in the app", () => {
    const used = new Set<string>();
    for (const { ids } of occurrences) {
      for (const id of ids) used.add(id);
    }
    // nav-* anchors resolve dynamically from hrefs via getNavGuideTargetId
    // (itself derived from this registry), so they are asserted separately.
    const missing = [...GUIDE_TARGET_IDS]
      .filter((id) => !id.startsWith("nav-"))
      .filter((id) => !used.has(id));
    expect(missing).toEqual([]);
  });

  it("anchors live on the route they declare", () => {
    const guideTargets = occurrences.flatMap(({ file, ids }) =>
      ids.map((id) => ({ file, id })),
    );
    const byId = new Map<string, string[]>();
    for (const { file, id } of guideTargets) {
      byId.set(id, [...(byId.get(id) ?? []), file]);
    }
    // Nav anchors resolve dynamically from hrefs; their files are the shared
    // navigation shells, not route pages — skip route assertion for nav-*.
    for (const [id, files] of byId) {
      if (id.startsWith("nav-")) continue;
      for (const file of files) {
        expect(
          file.startsWith("app/") || file.startsWith("components/"),
          `${id} anchor (${file}) should live on a dashboard route or shared component`,
        ).toBe(true);
      }
    }
  });
});
