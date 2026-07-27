import { describe, test, expect } from "vitest";
import { detectLanguage } from "../languageDetector.js";

describe("detectLanguage", () => {
  test("identifies English text", () => {
    expect(detectLanguage("This is an English sentence.")).toBe("en");
  });

  test("identifies Arabic text", () => {
    expect(detectLanguage("هذه جملة عربية.")).toBe("ar");
  });

  test("identifies mixed language", () => {
    expect(detectLanguage("Hello مرحبا World عالم")).toBe("mixed");
  });

  test("defaults to English for empty text", () => {
    expect(detectLanguage("")).toBe("en");
  });

  test("identifies predominantly Arabic text as Arabic", () => {
    const text = "هذا نص عربي طويل يحتوي على بعض الكلمات الإنجليزية few words";
    expect(detectLanguage(text)).toBe("ar");
  });

  test("identifies predominantly English text as English", () => {
    const text = "This is predominantly English text with a few Arabic words ع";
    expect(detectLanguage(text)).toBe("en");
  });
});
