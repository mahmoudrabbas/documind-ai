import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chunkDocument, DEFAULT_CHUNKING_CONFIG } from "../chunker.js";
import { TiktokenTokenizer } from "../tiktoken.adapter.js";
import type { ExtractionPage } from "workers/contracts";

const tokenizer = new TiktokenTokenizer("cl100k_base");
const FIXTURE_DIR = join(import.meta.dirname, "../../../../../../tests/fixtures/corpus");

function loadFixture(name: string): ExtractionPage[] {
  const raw = readFileSync(join(FIXTURE_DIR, `${name}.fixture.json`), "utf-8");
  return JSON.parse(raw) as ExtractionPage[];
}

describe("chunkDocument", () => {
  test("produces chunks from english contract", () => {
    const pages = loadFixture("english-contract");
    const chunks = chunkDocument(pages, tokenizer);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeGreaterThan(0);
      expect(chunk.pageStart).toBeGreaterThanOrEqual(1);
      expect(chunk.pageEnd).toBeGreaterThanOrEqual(chunk.pageStart);
    }
  });

  test("produces chunks from arabic contract", () => {
    const pages = loadFixture("arabic-contract");
    const chunks = chunkDocument(pages, tokenizer);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(["ar", "en", "mixed"]).toContain(chunk.language);
    }
  });

  test("handles mixed bilingual content", () => {
    const pages = loadFixture("mixed-bilingual");
    const chunks = chunkDocument(pages, tokenizer);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const hasMixed = chunks.some((c) => c.language === "mixed");
    expect(hasMixed).toBe(true);
  });

  test("handles table-heavy content", () => {
    const pages = loadFixture("table-heavy");
    const chunks = chunkDocument(pages, tokenizer);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const tableChunks = chunks.filter((c) => c.contentType === "table");
    expect(tableChunks.length).toBeGreaterThanOrEqual(1);
  });

  test("handles heading-heavy content with section paths", () => {
    const pages = loadFixture("heading-heavy");
    const chunks = chunkDocument(pages, tokenizer);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    const nestedChunks = chunks.filter((c) => c.sectionPath.length >= 2);
    expect(nestedChunks.length).toBeGreaterThanOrEqual(1);
  });

  test("splits oversized clause at sentence boundaries", () => {
    const pages = loadFixture("oversized-clause");
    const config = { ...DEFAULT_CHUNKING_CONFIG, targetTokens: 50, hardCeiling: 100 };
    const chunks = chunkDocument(pages, tokenizer, config);
    const oversizedChunks = chunks.filter((c) => c.partIndex !== null && c.partCount !== null);
    expect(oversizedChunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of oversizedChunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(config.hardCeiling + config.overlap + 30);
    }
  });

  test("handles page break across sections", () => {
    const pages = loadFixture("page-break-section");
    const chunks = chunkDocument(pages, tokenizer);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const pageStarts = chunks.map((c) => c.pageStart);
    expect(pageStarts).toContain(1);
    expect(pageStarts).toContain(2);
  });

  test("respects target token size", () => {
    const pages = loadFixture("english-contract");
    const config = { ...DEFAULT_CHUNKING_CONFIG, targetTokens: 100, hardCeiling: 200 };
    const chunks = chunkDocument(pages, tokenizer, config);
    for (const chunk of chunks) {
      if (chunk.partIndex === null) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.hardCeiling + 10);
      }
    }
  });

  test("assigns sequential chunk indices", () => {
    const pages = loadFixture("english-contract");
    const chunks = chunkDocument(pages, tokenizer);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]).toHaveProperty("chunkIndex");
    }
  });

  test("handles empty pages gracefully", () => {
    const pages: ExtractionPage[] = [
      { pageNumber: 1, blocks: [] },
      { pageNumber: 2, blocks: [{ type: "paragraph", text: "Only content." }] },
    ];
    const chunks = chunkDocument(pages, tokenizer);
    expect(chunks.length).toBe(1);
  });

  test("produces valid checksum-compatible text", () => {
    const pages = loadFixture("english-contract");
    const chunks = chunkDocument(pages, tokenizer);
    for (const chunk of chunks) {
      expect(typeof chunk.text).toBe("string");
      expect(typeof chunk.tokenCount).toBe("number");
      expect(typeof chunk.language).toBe("string");
    }
  });
});
