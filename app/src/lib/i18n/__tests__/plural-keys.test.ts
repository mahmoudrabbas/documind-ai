import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import dictionaries from "../translations";
import { SUPPORTED_LOCALES } from "../i18n.config";
import type { Locale } from "../i18n.types";

/**
 * Guards plural key resolution.
 *
 * `tPlural` resolves `<key>.<category>` and falls back to `<key>.other`.
 * `t()` returns the key itself on a miss, so a plural key stored under a
 * different separator — the i18next-style `key_one` / `key_other` — makes
 * both lookups miss and renders the raw dotted key on screen. Nothing
 * throws, and the parity test still passes because both locales carry the
 * same wrong keys.
 *
 * That is exactly how `documents.rulesInDraft` shipped broken, so these
 * tests pin the separator and the required categories.
 */

const SRC_ROOT = join(__dirname, "..", "..", "..");
const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"];

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

/** Every `tPlural("some.key", …)` literal used anywhere in `src`. */
function collectPluralKeys(): string[] {
  const keys = new Set<string>();
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\btPlural\(\s*["']([^"']+)["']/g)) {
      keys.add(match[1]);
    }
  }
  return [...keys];
}

/** Categories `Intl.PluralRules` can actually select for `locale`. */
function categoriesFor(locale: Locale): string[] {
  return new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
}

describe("plural key separator", () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`"${locale}" stores plural forms under ".category", not "_category"`, () => {
      const suffixed = new RegExp(`_(${PLURAL_CATEGORIES.join("|")})$`);
      const offenders = Object.keys(dictionaries[locale]).filter((key) =>
        suffixed.test(key),
      );

      expect(
        offenders,
        `tPlural looks up "<key>.<category>". Rename these to use a dot ` +
          `or they resolve to a raw key on screen:\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }
});

describe("tPlural call sites", () => {
  const pluralKeys = collectPluralKeys();

  it("finds the tPlural call sites to check", () => {
    expect(pluralKeys.length).toBeGreaterThan(0);
  });

  for (const locale of SUPPORTED_LOCALES) {
    it(`"${locale}" defines the ".other" fallback for every plural key`, () => {
      const missing = pluralKeys.filter(
        (key) => dictionaries[locale][`${key}.other`] === undefined,
      );

      expect(
        missing,
        `"<key>.other" is the fallback every locale must define — without ` +
          `it the raw key renders:\n${missing.join("\n")}`,
      ).toEqual([]);
    });

    it(`"${locale}" defines every plural category it can select`, () => {
      const missing: string[] = [];

      for (const key of pluralKeys) {
        for (const category of categoriesFor(locale)) {
          if (dictionaries[locale][`${key}.${category}`] === undefined) {
            missing.push(`${key}.${category}`);
          }
        }
      }

      expect(
        missing,
        `Arabic selects six categories, so a missing one silently falls ` +
          `back to ".other" and reads ungrammatically:\n${missing.join("\n")}`,
      ).toEqual([]);
    });
  }
});
