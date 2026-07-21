import test from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, normalizeArabic } from "../intentQuery.languageDetector.js";

test("Language Detector utility", async (t) => {
  await t.test("should detect pure English query", () => {
    const lang = detectLanguage("What is the probation period length?");
    assert.equal(lang, "en");
  });

  await t.test("should detect pure Arabic query", () => {
    const lang = detectLanguage("ما هي سياسة الإجازات السنوية؟");
    assert.equal(lang, "ar");
  });

  await t.test("should detect mixed language query", () => {
    const lang = detectLanguage("عايز اقدم على sick leave من فضلك");
    assert.equal(lang, "mixed");
  });

  await t.test("should fall back to English on numbers/empty strings", () => {
    assert.equal(detectLanguage("12345"), "en");
    assert.equal(detectLanguage(""), "en");
  });
});

test("Arabic Normalizer utility", async (t) => {
  await t.test("should normalize Alifs, Taa Marbuta and Ya Maqsoora", () => {
    const text = "أنا إجازة فى المكتبة ى";
    const normalized = normalizeArabic(text);
    // أ -> ا, إ -> ا, ة -> ه, ى -> ي
    assert.equal(normalized, "انا اجازه في المكتبه ي");
  });

  await t.test("should remove diacritics and tatweel", () => {
    const text = "كِتَــــابٌ";
    const normalized = normalizeArabic(text);
    assert.equal(normalized, "كتاب");
  });
});
