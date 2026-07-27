import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chunkDocument, DEFAULT_CHUNKING_CONFIG } from "../chunker.js";
import { TiktokenTokenizer } from "../tiktoken.adapter.js";
import type { ExtractionPage } from "workers/contracts";

const tokenizer = new TiktokenTokenizer("cl100k_base");
const FIXTURE_DIR = join(import.meta.dirname, "../../../../../tests/fixtures/corpus");

function loadFixture(name: string): ExtractionPage[] {
  const raw = readFileSync(join(FIXTURE_DIR, `${name}.fixture.json`), "utf-8");
  return JSON.parse(raw) as ExtractionPage[];
}

interface GoldenExpected {
  totalChunks: number;
  expectedChunks?: Array<{
    sectionPath?: string[];
    contentType?: string;
    pageStart?: number;
    pageEnd?: number;
    partIndex?: number;
    partCount?: number;
  }>;
}

const goldenData: Record<string, GoldenExpected> = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "golden-expected.json"), "utf-8"),
);

describe("Golden chunking tests", () => {
  test("english contract matches golden expectations", () => {
    const pages = loadFixture("english-contract");
    const chunks = chunkDocument(pages, tokenizer);
    const golden = goldenData["english-contract"];

    expect(chunks.length).toBeGreaterThanOrEqual(golden.totalChunks - 1);

    for (const [i, expected] of (golden.expectedChunks ?? []).entries()) {
      if (i >= chunks.length) break;
      const chunk = chunks[i];
      if (expected.sectionPath) {
        expect(chunk.sectionPath).toEqual(expected.sectionPath);
      }
      if (expected.contentType) {
        expect(chunk.contentType).toBe(expected.contentType);
      }
      if (expected.pageStart !== undefined) {
        expect(chunk.pageStart).toBe(expected.pageStart);
      }
    }
  });

  test("arabic contract matches golden expectations", () => {
    const pages = loadFixture("arabic-contract");
    const chunks = chunkDocument(pages, tokenizer);
    const golden = goldenData["arabic-contract"];

    expect(chunks.length).toBeGreaterThanOrEqual(golden.totalChunks - 1);

    for (const chunk of chunks) {
      expect(["ar", "en", "mixed"]).toContain(chunk.language);
    }
  });

  test("mixed bilingual content produces mixed language chunks", () => {
    const pages = loadFixture("mixed-bilingual");
    const chunks = chunkDocument(pages, tokenizer);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.language === "mixed")).toBe(true);
  });

  test("table-heavy content produces table chunks", () => {
    const pages = loadFixture("table-heavy");
    const chunks = chunkDocument(pages, tokenizer);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.filter((c) => c.contentType === "table").length).toBeGreaterThanOrEqual(1);
  });

  test("heading-heavy content preserves nested section paths", () => {
    const pages = loadFixture("heading-heavy");
    const chunks = chunkDocument(pages, tokenizer);
    const golden = goldenData["heading-heavy"];

    expect(chunks.length).toBeGreaterThanOrEqual(golden.totalChunks - 1);

    const nestedChunks = chunks.filter((c) => c.sectionPath.length >= 2);
    expect(nestedChunks.length).toBeGreaterThanOrEqual(1);
  });

  test("oversized clause splits at sentence boundaries with partIndex/partCount", () => {
    const pages = loadFixture("oversized-clause");
    const config = { ...DEFAULT_CHUNKING_CONFIG, targetTokens: 50, hardCeiling: 100 };
    const chunks = chunkDocument(pages, tokenizer, config);

    const splitChunks = chunks.filter((c) => c.partIndex !== null && c.partCount !== null);
    expect(splitChunks.length).toBeGreaterThanOrEqual(1);

    for (const chunk of splitChunks) {
      expect(chunk.partCount).toBeGreaterThan(1);
      expect(chunk.partIndex).toBeGreaterThanOrEqual(0);
      expect(chunk.partIndex).toBeLessThan(chunk.partCount!);
    }
  });

  test("page break sections map pageStart/pageEnd correctly", () => {
    const pages = loadFixture("page-break-section");
    const chunks = chunkDocument(pages, tokenizer);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const pageStarts = chunks.map((c) => c.pageStart);
    expect(pageStarts).toContain(1);
    expect(pageStarts).toContain(2);
  });

  test("all chunks have valid structure", () => {
    for (const fixtureName of [
      "english-contract",
      "arabic-contract",
      "mixed-bilingual",
      "table-heavy",
      "heading-heavy",
      "page-break-section",
    ]) {
      const pages = loadFixture(fixtureName);
      const chunks = chunkDocument(pages, tokenizer);
      for (const chunk of chunks) {
        expect(typeof chunk.text).toBe("string");
        expect(chunk.text.length).toBeGreaterThan(0);
        expect(typeof chunk.tokenCount).toBe("number");
        expect(chunk.tokenCount).toBeGreaterThan(0);
        expect(["ar", "en", "mixed"]).toContain(chunk.language);
        expect(["paragraph", "heading", "table", "clause", "list"]).toContain(chunk.contentType);
        expect(Array.isArray(chunk.sectionPath)).toBe(true);
        expect(chunk.pageStart).toBeGreaterThanOrEqual(1);
        expect(chunk.pageEnd).toBeGreaterThanOrEqual(chunk.pageStart);
        expect(typeof chunk.offsetStart).toBe("number");
        expect(typeof chunk.offsetEnd).toBe("number");
        expect(chunk.offsetEnd).toBeGreaterThanOrEqual(chunk.offsetStart);
      }
    }
  });
});
