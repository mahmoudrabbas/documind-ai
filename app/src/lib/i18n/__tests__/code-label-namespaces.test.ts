import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import dictionaries from "../translations";
import { SUPPORTED_LOCALES } from "../i18n.config";

/**
 * Guards `codeLabel` namespace resolution.
 *
 * `codeLabel(t, namespace, code)` looks up `<namespace>.<code.toLowerCase()>`
 * and falls back to `humanizeCode(code)` when that misses. The fallback
 * produces title-cased English — so a namespace whose dictionary keys are
 * stored UPPERCASE, or missing entirely, renders correct-looking English
 * while every Arabic translation is silently unreachable.
 *
 * That is exactly how `documents.indexStatus.BUILDING`,
 * `documents.qualityStatus.READY`, `documents.status.*`, and
 * `documents.scanResult.*` shipped broken: English looked perfect, Arabic
 * showed English, and nothing failed.
 *
 * The existing `code-label.test.ts` only exercises
 * `billing.subscriptionStatus`, whose keys happen to be lowercase, so it
 * passed throughout. These tests cover every namespace actually used.
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

/** Every `codeLabel(t, "some.namespace", …)` literal used anywhere in `src`. */
function collectNamespaces(): string[] {
  const namespaces = new Set<string>();
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /\bcodeLabel\(\s*\w+\s*,\s*["']([^"']+)["']/g,
    )) {
      namespaces.add(match[1]);
    }
  }
  return [...namespaces].sort();
}

/** Keys in `locale` that sit directly under `namespace.`, minus the prefix. */
function suffixesUnder(locale: (typeof SUPPORTED_LOCALES)[number], namespace: string) {
  const prefix = `${namespace}.`;
  return Object.keys(dictionaries[locale])
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

describe("codeLabel namespaces", () => {
  const namespaces = collectNamespaces();

  it("finds the codeLabel call sites to check", () => {
    expect(namespaces.length).toBeGreaterThan(0);
  });

  for (const locale of SUPPORTED_LOCALES) {
    it(`"${locale}" defines at least one key for every namespace in use`, () => {
      const empty = namespaces.filter(
        (namespace) => suffixesUnder(locale, namespace).length === 0,
      );

      expect(
        empty,
        `These namespaces resolve to nothing, so every code falls back to ` +
          `humanized English and the locale is silently ignored:\n${empty.join("\n")}`,
      ).toEqual([]);
    });

    it(`"${locale}" stores every code key lowercase so codeLabel can reach it`, () => {
      const unreachable: string[] = [];

      for (const namespace of namespaces) {
        for (const suffix of suffixesUnder(locale, namespace)) {
          if (suffix !== suffix.toLowerCase()) {
            unreachable.push(`${namespace}.${suffix}`);
          }
        }
      }

      expect(
        unreachable,
        `codeLabel lowercases the incoming code before lookup, so an ` +
          `uppercase key can never be hit. Rename these to lowercase:\n` +
          unreachable.join("\n"),
      ).toEqual([]);
    });
  }

  it("resolves identically-named codes in both locales", () => {
    for (const namespace of namespaces) {
      expect(
        suffixesUnder("ar", namespace).sort(),
        `"${namespace}" must offer the same codes in both locales`,
      ).toEqual(suffixesUnder("en", namespace).sort());
    }
  });
});
