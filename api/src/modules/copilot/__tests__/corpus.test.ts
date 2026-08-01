import { describe, it, expect } from "vitest";
import { COPILOT_KNOWLEDGE_CORPUS } from "../knowledge/corpus.js";

describe("Copilot knowledge corpus", () => {
  it("contains entries with unique ids", () => {
    const ids = COPILOT_KNOWLEDGE_CORPUS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has a title, tags, and non-empty content", () => {
    for (const entry of COPILOT_KNOWLEDGE_CORPUS) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.content.length).toBeGreaterThan(100);
    }
  });

  it("covers core features (documents, search, users, imports, OCR)", () => {
    const allContent = COPILOT_KNOWLEDGE_CORPUS
      .flatMap((entry) => [entry.title, ...entry.tags, entry.content])
      .join(" ")
      .toLowerCase();

    for (const keyword of ["documents", "search", "users", "imports", "ocr"]) {
      expect(allContent).toContain(keyword);
    }
  });

  it("describes the three roles", () => {
    const allContent = COPILOT_KNOWLEDGE_CORPUS.join(" ") + JSON.stringify(COPILOT_KNOWLEDGE_CORPUS);
    expect(allContent).toContain("SUPER_ADMIN");
    expect(allContent).toContain("COMPANY_ADMIN");
    expect(allContent).toContain("EMPLOYEE");
  });
});
