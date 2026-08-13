import { describe, it, expect } from "vitest";
import { codeLabel, humanizeCode } from "../code-label";
import { t as translate } from "../i18n.utils";
import dictionaries from "../translations";

/** Mirrors how components call `t` — bound to one locale's dictionary. */
function tFor(locale: "en" | "ar") {
  return (key: string) => translate(dictionaries[locale], key);
}

describe("humanizeCode", () => {
  it("title-cases SCREAMING_SNAKE codes", () => {
    expect(humanizeCode("PAST_DUE")).toBe("Past Due");
    expect(humanizeCode("CANCEL_AT_PERIOD_END")).toBe("Cancel At Period End");
    expect(humanizeCode("ACTIVE")).toBe("Active");
  });

  it("handles already-lowercase codes", () => {
    expect(humanizeCode("foo_bar")).toBe("Foo Bar");
  });

  it("returns an empty string unchanged rather than throwing", () => {
    expect(() => humanizeCode("")).not.toThrow();
    expect(humanizeCode("")).toBe("");
  });
});

describe("codeLabel", () => {
  const t = tFor("en");

  it("resolves a mapped code to its translation", () => {
    expect(codeLabel(t, "billing.subscriptionStatus", "PAST_DUE")).toBe("Past Due");
    expect(codeLabel(t, "billing.subscriptionStatus", "TRIALING")).toBe("Trial");
  });

  it("is case-insensitive on the incoming code", () => {
    expect(codeLabel(t, "billing.subscriptionStatus", "active")).toBe("Active");
    expect(codeLabel(t, "billing.subscriptionStatus", "ACTIVE")).toBe("Active");
  });

  it("translates the same code into Arabic", () => {
    expect(codeLabel(tFor("ar"), "billing.subscriptionStatus", "ACTIVE")).toBe("نشط");
  });

  /* The safety property: an unmapped code must degrade to the English the
     UI rendered before translations existed — never blank, and never a
     raw dotted key leaking on screen. */
  it("falls back to humanized English for an unmapped code", () => {
    expect(codeLabel(t, "billing.subscriptionStatus", "SOME_NEW_CODE")).toBe(
      "Some New Code",
    );
  });

  it("falls back for an entirely unknown namespace", () => {
    expect(codeLabel(t, "not.a.namespace", "PAST_DUE")).toBe("Past Due");
  });

  it("never returns a dotted translation key", () => {
    for (const code of ["ACTIVE", "UNKNOWN_CODE", "x"]) {
      expect(codeLabel(t, "billing.subscriptionStatus", code)).not.toContain(".");
    }
  });
});
