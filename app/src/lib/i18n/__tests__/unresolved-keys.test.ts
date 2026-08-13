import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import dictionaries from "../translations";
import { SUPPORTED_LOCALES } from "../i18n.config";

/**
 * Guardrail test for unresolved translation keys.
 *
 * `t()` returns the key string itself on a dictionary miss instead of throwing.
 * This test scans all source files for `t("static.key")` literals and asserts
 * that every key exists in both English and Arabic dictionaries.
 */

const SRC_ROOT = join(__dirname, "..", "..", "..");

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

function collectTKeys(): { key: string; file: string }[] {
  const results: { key: string; file: string }[] = [];
  const regex = /\bt\(\s*["']([^"']+)["']/g;

  for (const file of collectSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(regex)) {
      const key = match[1];
      if (key && !key.includes("${")) {
        results.push({ key, file: file.replace(SRC_ROOT, "src") });
      }
    }
  }
  return results;
}

describe("Unresolved translation keys", () => {
  const callSites = collectTKeys();

  it("finds t(...) call sites to verify", () => {
    expect(callSites.length).toBeGreaterThan(0);
  });

  for (const locale of SUPPORTED_LOCALES) {
    it(`all literal t(...) keys resolve in "${locale}" dictionary`, () => {
      const missing: string[] = [];

      for (const { key, file } of callSites) {
        if (dictionaries[locale][key] === undefined) {
          missing.push(`${key} (${file})`);
        }
      }

      expect(
        missing,
        `The following t("...") keys are missing from "${locale}" dictionary:\n${missing.join("\n")}`,
      ).toEqual([]);
    });
  }
});
