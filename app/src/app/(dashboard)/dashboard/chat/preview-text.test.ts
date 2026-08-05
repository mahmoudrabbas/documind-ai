import { describe, expect, it } from "vitest";
import { previewText } from "./preview-text";

describe("previewText", () => {
  it("strips markdown headings like ##", () => {
    const text = previewText("## Summary\n\nKey insight here.");
    expect(text).not.toContain("##");
    expect(text).toContain("Summary");
    expect(text).toContain("Key insight here.");
  });

  it("strips **bold** markers", () => {
    const text = previewText("This is **important** work.");
    expect(text).not.toContain("**");
    expect(text).toContain("This is important work.");
  });

  it("strips code fences and table pipes appropriately", () => {
    const text = previewText(
      "```ts\nconst x = 1;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
    );
    expect(text).not.toContain("```");
    expect(text).not.toContain("|");
    expect(text).toContain("const x = 1;");
    expect(text).toContain("A B");
    expect(text).toContain("1 2");
  });

  it("keeps historical assistant previews as plain text", () => {
    const text = previewText(
      "<think>hidden reasoning</think>## Result\n\n**score:** 42\n\n- a\n- b",
    );
    expect(text).not.toContain("##");
    expect(text).not.toContain("**");
    expect(text).not.toContain("hidden reasoning");
    expect(text).toContain("Result");
    expect(text).toContain("score: 42");
    expect(text).toContain("a b");
  });

  it("leaves plain user-style text readable and unchanged in meaning", () => {
    const text = previewText("What is the revenue for Q3?");
    expect(text).toBe("What is the revenue for Q3?");
  });

  it("collapses excessive whitespace", () => {
    const text = previewText("line one\n\n\n   line   two\t  three");
    expect(text).toBe("line one line two three");
  });

  it("returns a short safe excerpt for long content", () => {
    const long = "word ".repeat(60);
    const text = previewText(long, 50);
    expect(text.length).toBeLessThanOrEqual(51);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeGreaterThan(0);
  });

  it("returns an empty string for empty or invalid input", () => {
    expect(previewText("")).toBe("");
    expect(previewText("   ")).toBe("");
    expect(previewText(null as unknown as string)).toBe("");
  });
});
