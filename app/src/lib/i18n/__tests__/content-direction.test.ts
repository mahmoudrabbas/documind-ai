import { describe, it, expect } from "vitest";
import { getContentDirection } from "../content-direction";

describe("getContentDirection", () => {
  it("returns rtl/ar for purely Arabic content", () => {
    expect(getContentDirection("مرحبا بالعالم")).toEqual({
      dir: "rtl",
      lang: "ar",
    });
  });

  it("returns rtl/ar when Arabic script appears mid-text", () => {
    expect(getContentDirection("يستخدم CivicOps تقنيات Node.js و PostgreSQL")).toEqual({
      dir: "rtl",
      lang: "ar",
    });
  });

  it("returns ltr/en for purely English content", () => {
    expect(getContentDirection("Hello from the assistant.")).toEqual({
      dir: "ltr",
      lang: "en",
    });
  });

  it("returns ltr/en for English technical text", () => {
    expect(getContentDirection("Node.js and PostgreSQL are used by CivicOps.")).toEqual({
      dir: "ltr",
      lang: "en",
    });
  });

  it("returns ltr/en for empty or non-string input", () => {
    expect(getContentDirection("")).toEqual({ dir: "ltr", lang: "en" });
    expect(getContentDirection(undefined)).toEqual({ dir: "ltr", lang: "en" });
    expect(getContentDirection(null)).toEqual({ dir: "ltr", lang: "en" });
  });

  it("does not treat Latin-only 'Islamic' or transliterated text as RTL", () => {
    expect(getContentDirection("The Islamic calendar begins in 622 CE.")).toEqual({
      dir: "ltr",
      lang: "en",
    });
  });
});
