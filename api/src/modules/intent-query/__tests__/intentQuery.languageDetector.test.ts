import test from "node:test";
import assert from "node:assert/strict";
import {
  detectLanguage,
  isLikelyArabizi,
  normalizeArabic,
} from "../intentQuery.languageDetector.js";

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

  await t.test("should detect Arabizi (Arabic written in Latin script) as Arabic", () => {
    assert.equal(detectLanguage("el remote work momken kam yom fel week?"), "ar");
    assert.equal(detectLanguage("kam yom fe el week"), "ar");
    assert.equal(detectLanguage("ezay momken el vacation policy?"), "ar");
  });

  await t.test("should not misclassify ordinary English as Arabizi", () => {
    assert.equal(isLikelyArabizi("What is the remote work policy?"), false);
    assert.equal(isLikelyArabizi("Kam is meeting with the team today"), false);
    assert.equal(isLikelyArabizi("The policy allows two days per week"), false);
    assert.equal(detectLanguage("What is the remote work policy?"), "en");
  });

  await t.test("should treat a single transliterated word as English by default", () => {
    assert.equal(detectLanguage("What does momken mean?"), "en");
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
