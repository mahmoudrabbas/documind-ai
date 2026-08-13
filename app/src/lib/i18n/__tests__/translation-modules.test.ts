import { describe, it, expect } from "vitest";
import { localeModules } from "../translations";
import { SUPPORTED_LOCALES } from "../i18n.config";

/**
 * The per-locale dictionary is assembled by spreading several module
 * objects together, so a key defined in two modules silently resolves to
 * whichever spread came last. That is invisible at runtime — the wrong
 * string just appears. These tests make it a build failure instead.
 */
describe("translation module composition", () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`"${locale}" defines every key in exactly one module`, () => {
      const seen = new Map<string, number>();
      const duplicates: string[] = [];

      localeModules[locale].forEach((mod, index) => {
        for (const key of Object.keys(mod)) {
          const previous = seen.get(key);
          if (previous !== undefined) {
            duplicates.push(`"${key}" in modules ${previous} and ${index}`);
          } else {
            seen.set(key, index);
          }
        }
      });

      expect(duplicates, duplicates.join("\n")).toEqual([]);
    });

    it(`"${locale}" modules use flat dot-namespaced keys`, () => {
      for (const mod of localeModules[locale]) {
        for (const key of Object.keys(mod)) {
          expect(key, `"${key}" should be a flat namespaced key`).toMatch(
            /^[a-zA-Z][\w]*(\.[\w-]+)+$/,
          );
        }
      }
    });
  }
});
