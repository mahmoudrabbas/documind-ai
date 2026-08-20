import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  localizeNotification,
  notificationsBadgeColor,
  resolveNotificationActionHref,
  toNotificationText,
} from "../notification-utils";

describe("decodeHtmlEntities", () => {
  it("undoes the legacy apostrophe escaping (the reported symptom)", () => {
    expect(
      decodeHtmlEntities(
        `A new knowledge gap was created: "the company&#39;s security code".`,
      ),
    ).toBe(`A new knowledge gap was created: "the company's security code".`);
  });

  it("undoes the other four legacy escapes", () => {
    expect(decodeHtmlEntities("&quot;quoted&quot;")).toBe('"quoted"');
    expect(decodeHtmlEntities("R&amp;D")).toBe("R&D");
    expect(decodeHtmlEntities("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe(
      "<script>alert(1)</script>",
    );
  });

  it("leaves text that was never escaped byte-identical", () => {
    const plain = `the company's R&D "budget" <team> — 100% ready`;
    expect(decodeHtmlEntities(plain)).toBe(plain);
  });

  it("does not double decode", () => {
    // `&amp;lt;` is what the old escaper produced for the literal text
    // `&lt;`: one pass must stop at the user's own characters.
    expect(decodeHtmlEntities("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    expect(decodeHtmlEntities("&amp;amp;")).toBe("&amp;");
    expect(decodeHtmlEntities("&amp;#39;")).toBe("&#39;");
  });

  it("never invents characters from entities the escaper could not produce", () => {
    // Literal text a user may type; decoding these would corrupt their words.
    for (const literal of ["&apos;", "&#x27;", "&#x2F;", "&#x60;", "&#1587;", "&nbsp;", "&"]) {
      expect(decodeHtmlEntities(literal)).toBe(literal);
    }
  });

  it("keeps Arabic and mixed Arabic/English text unchanged", () => {
    const arabic = `تم إنشاء فجوة معرفية جديدة: "سياسة العمل عن بُعد".`;
    expect(decodeHtmlEntities(arabic)).toBe(arabic);
    const arabizi = "كام يوم remote مسموح؟ momken 2 days fel week?";
    expect(decodeHtmlEntities(arabizi)).toBe(arabizi);
    // Arabic body carrying a legacy-escaped English topic still decodes.
    expect(decodeHtmlEntities(`معاينة: "company&#39;s code"`)).toBe(
      `معاينة: "company's code"`,
    );
  });

  it("handles empty text", () => {
    expect(decodeHtmlEntities("")).toBe("");
  });
});

describe("localizeNotification", () => {
  it("decodes the active locale and falls back to en", () => {
    expect(
      localizeNotification({ en: "company&#39;s code", ar: "كود الشركة" }, "en"),
    ).toBe("company's code");
    expect(
      localizeNotification({ en: "company&#39;s code", ar: "كود الشركة" }, "ar"),
    ).toBe("كود الشركة");
    expect(localizeNotification({ en: "only en", ar: "" }, "ar")).toBe("only en");
    expect(localizeNotification({ en: "", ar: "" }, "en")).toBe("");
  });
});

describe("toNotificationText", () => {
  it("accepts socket plain strings and REST localized text", () => {
    expect(toNotificationText("company&#39;s code", "en")).toBe("company's code");
    expect(toNotificationText({ en: "R&amp;D", ar: "بحث" }, "en")).toBe("R&D");
  });
});

describe("resolveNotificationActionHref", () => {
  it("maps document API routes to their permission-checked frontend pages", () => {
    expect(resolveNotificationActionHref("/documents/abc/ocr/retry")).toBe(
      "/dashboard/processing-failed",
    );
    expect(resolveNotificationActionHref("/documents/abc")).toBe("/dashboard/documents");
    expect(resolveNotificationActionHref("/dashboard/knowledge-gaps")).toBe(
      "/dashboard/knowledge-gaps",
    );
  });
});

describe("notificationsBadgeColor", () => {
  it("picks the highest unread priority and hides when nothing is unread", () => {
    expect(notificationsBadgeColor({ critical: 1, high: 5, normal: 2, low: 3 })).toBe("bg-error");
    expect(notificationsBadgeColor({ critical: 0, high: 5, normal: 2, low: 3 })).toBe("bg-warning");
    expect(notificationsBadgeColor({ critical: 0, high: 0, normal: 2, low: 3 })).toBe("bg-info");
    expect(notificationsBadgeColor({ critical: 0, high: 0, normal: 0, low: 3 })).toBe(
      "bg-on-surface-variant",
    );
    expect(notificationsBadgeColor({ critical: 0, high: 0, normal: 0, low: 0 })).toBeNull();
  });
});
