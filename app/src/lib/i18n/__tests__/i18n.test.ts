import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_COOKIE_NAME,
  LOCALE_CONFIGS,
  getDirection,
  isValidLocale,
} from "../i18n.config";
import { t, getLocaleFromCookie, setLocaleCookie } from "../i18n.utils";
import dictionaries from "../translations";
import type { Locale, TranslationDictionary } from "../i18n.types";

/* ── getDirection() ───────────────────────────────────────────────── */

describe("getDirection", () => {
  it('returns "ltr" for English', () => {
    expect(getDirection("en")).toBe("ltr");
  });

  it('returns "rtl" for Arabic', () => {
    expect(getDirection("ar")).toBe("rtl");
  });

  it("returns a valid direction for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const dir = getDirection(locale);
      expect(["ltr", "rtl"]).toContain(dir);
    }
  });
});

/* ── isValidLocale() ──────────────────────────────────────────────── */

describe("isValidLocale", () => {
  it("returns true for all supported locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(isValidLocale(locale)).toBe(true);
    }
  });

  it("returns false for unsupported locale strings", () => {
    expect(isValidLocale("fr")).toBe(false);
    expect(isValidLocale("de")).toBe(false);
    expect(isValidLocale("EN")).toBe(false);
    expect(isValidLocale("")).toBe(false);
  });

  it("returns false for non-string types", () => {
    expect(isValidLocale(null)).toBe(false);
    expect(isValidLocale(undefined)).toBe(false);
    expect(isValidLocale(42)).toBe(false);
    expect(isValidLocale(true)).toBe(false);
    expect(isValidLocale({})).toBe(false);
  });
});

/* ── t() — translation lookup ─────────────────────────────────────── */

describe("t", () => {
  const dict: TranslationDictionary = {
    "common.hello": "Hello",
    "common.greeting": "Hello, {{name}}!",
    "common.multi": "{{a}} and {{b}}",
    "common.repeat": "{{x}} {{x}}",
  };

  it("returns the translated value for a known key", () => {
    expect(t(dict, "common.hello")).toBe("Hello");
  });

  it("returns the key itself when the key is missing", () => {
    expect(t(dict, "missing.key")).toBe("missing.key");
  });

  it("interpolates a single {{param}}", () => {
    expect(t(dict, "common.greeting", { name: "Ali" })).toBe("Hello, Ali!");
  });

  it("interpolates multiple distinct params", () => {
    expect(t(dict, "common.multi", { a: "X", b: "Y" })).toBe("X and Y");
  });

  it("replaces all occurrences of the same param", () => {
    expect(t(dict, "common.repeat", { x: "Z" })).toBe("Z Z");
  });

  it("leaves {{param}} in place when no matching param is provided", () => {
    expect(t(dict, "common.greeting")).toBe("Hello, {{name}}!");
  });

  it("handles an empty params object gracefully", () => {
    expect(t(dict, "common.greeting", {})).toBe("Hello, {{name}}!");
  });
});

/* ── Cookie helpers ───────────────────────────────────────────────── */

describe("getLocaleFromCookie", () => {
  const originalDocument = globalThis.document;

  afterEach(() => {
    // Restore original document (or lack thereof).
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      writable: true,
      configurable: true,
    });
  });

  it("returns DEFAULT_LOCALE when document is undefined (SSR)", () => {
    Object.defineProperty(globalThis, "document", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(getLocaleFromCookie()).toBe(DEFAULT_LOCALE);
  });

  it("returns DEFAULT_LOCALE when the cookie is missing", () => {
    Object.defineProperty(globalThis, "document", {
      value: { cookie: "" },
      writable: true,
      configurable: true,
    });
    expect(getLocaleFromCookie()).toBe(DEFAULT_LOCALE);
  });

  it("returns the locale from a valid cookie", () => {
    Object.defineProperty(globalThis, "document", {
      value: { cookie: `${LOCALE_COOKIE_NAME}=ar; other=val` },
      writable: true,
      configurable: true,
    });
    expect(getLocaleFromCookie()).toBe("ar");
  });

  it("returns DEFAULT_LOCALE for an invalid cookie value", () => {
    Object.defineProperty(globalThis, "document", {
      value: { cookie: `${LOCALE_COOKIE_NAME}=fr` },
      writable: true,
      configurable: true,
    });
    expect(getLocaleFromCookie()).toBe(DEFAULT_LOCALE);
  });
});

describe("setLocaleCookie", () => {
  it("does not throw when document is undefined (SSR)", () => {
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => setLocaleCookie("ar")).not.toThrow();
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      writable: true,
      configurable: true,
    });
  });

  it("sets the cookie string on document.cookie", () => {
    let cookieValue = "";
    const fakeDoc = {
      get cookie() {
        return cookieValue;
      },
      set cookie(v: string) {
        cookieValue = v;
      },
    };
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      value: fakeDoc,
      writable: true,
      configurable: true,
    });

    setLocaleCookie("ar");
    expect(cookieValue).toContain(`${LOCALE_COOKIE_NAME}=ar`);
    expect(cookieValue).toContain("path=/");
    expect(cookieValue).toContain("SameSite=Lax");

    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      writable: true,
      configurable: true,
    });
  });
});

/* ── Translation dictionary parity ────────────────────────────────── */

describe("translation dictionaries", () => {
  const locales = Object.keys(dictionaries) as Locale[];
  const referenceLocale: Locale = "en";
  const referenceKeys = Object.keys(dictionaries[referenceLocale]).sort();

  it("has a dictionary for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(dictionaries[locale]).toBeDefined();
    }
  });

  for (const locale of locales) {
    if (locale === referenceLocale) continue;

    it(`"${locale}" has the exact same keys as "${referenceLocale}"`, () => {
      const localeKeys = Object.keys(dictionaries[locale]).sort();
      expect(localeKeys).toEqual(referenceKeys);
    });

    it(`"${locale}" has no empty-string values`, () => {
      const dict = dictionaries[locale];
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `Key "${key}" in "${locale}" is empty`).not.toBe("");
      }
    });
  }

  it(`"${referenceLocale}" has no empty-string values`, () => {
    const dict = dictionaries[referenceLocale];
    for (const [key, value] of Object.entries(dict)) {
      expect(value.trim(), `Key "${key}" in "${referenceLocale}" is empty`).not.toBe("");
    }
  });
});

/* ── LOCALE_CONFIGS sanity ────────────────────────────────────────── */

describe("LOCALE_CONFIGS", () => {
  it("has a config entry for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const config = LOCALE_CONFIGS[locale];
      expect(config).toBeDefined();
      expect(config.direction).toBeDefined();
      expect(config.nativeLabel).toBeTruthy();
      expect(config.englishLabel).toBeTruthy();
    }
  });
});
