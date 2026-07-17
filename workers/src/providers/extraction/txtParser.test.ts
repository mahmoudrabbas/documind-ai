import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TxtParser } from "./txtParser.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "src/providers/extraction/__fixtures__");

test("TxtParser - parses plain text and splits into paragraphs", async () => {
  const parser = new TxtParser();
  const buffer = await fs.readFile(path.join(FIXTURES_DIR, "sample-plain.txt"));

  const result = await parser.parse({
    buffer,
    mimeType: "text/plain",
    fileName: "sample-plain.txt",
    tenantId: "tenant-1",
    documentId: "doc-1",
    documentVersion: 1,
  });

  assert.equal(result.parserName, "txt-parser");
  assert.equal(result.pages.length, 1);
  assert.ok(result.pages[0].blocks.length > 0);
  assert.equal(result.pages[0].blocks[0].text, "Hello World!");
  assert.equal(result.pages[0].blocks[1].text, "This is a plain text file for parsing tests.");
});

test("TxtParser - parses Arabic text", async () => {
  const parser = new TxtParser();
  const buffer = await fs.readFile(path.join(FIXTURES_DIR, "sample-arabic.txt"));

  const result = await parser.parse({
    buffer,
    mimeType: "text/plain",
    fileName: "sample-arabic.txt",
    tenantId: "tenant-1",
    documentId: "doc-2",
    documentVersion: 1,
  });

  assert.equal(result.parserName, "txt-parser");
  assert.ok(result.pages[0].blocks.length > 0);
  assert.match(result.pages[0].blocks[0].text, /مرحبا/);
});
