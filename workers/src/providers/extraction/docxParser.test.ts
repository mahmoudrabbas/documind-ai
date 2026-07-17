import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DocxParser } from "./docxParser.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "api/src/providers/extraction/__fixtures__");

test("DocxParser - parses headings and paragraphs", async () => {
  const parser = new DocxParser();
  const buffer = await fs.readFile(path.join(FIXTURES_DIR, "sample-headings.docx"));

  const result = await parser.parse({
    buffer,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName: "sample-headings.docx",
    tenantId: "tenant-1",
    documentId: "doc-1",
    documentVersion: 1,
  });

  assert.equal(result.parserName, "mammoth");
  assert.ok(result.pages.length === 1);
  assert.ok(result.pages[0].blocks.length > 0);
  
  const paragraphBlock = result.pages[0].blocks.find(b => b.type === "paragraph");
  assert.ok(paragraphBlock);
  assert.ok(paragraphBlock.text.length > 0);
});

test("DocxParser - parses table format correctly", async () => {
  const parser = new DocxParser();
  const buffer = await fs.readFile(path.join(FIXTURES_DIR, "sample-tables.docx"));

  const result = await parser.parse({
    buffer,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileName: "sample-tables.docx",
    tenantId: "tenant-1",
    documentId: "doc-2",
    documentVersion: 1,
  });

  assert.equal(result.parserName, "mammoth");
  const tableBlock = result.pages[0].blocks.find(b => b.type === "table");
  assert.ok(tableBlock);
  assert.match(tableBlock.text, /\|/);
});
