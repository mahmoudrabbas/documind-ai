import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PdfParser } from "./pdfParser.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "src/providers/extraction/__fixtures__");

test("PdfParser - parses simple PDF successfully", async () => {
  const parser = new PdfParser();
  const buffer = await fs.readFile(path.join(FIXTURES_DIR, "sample-en.pdf"));
  
  const result = await parser.parse({
    buffer,
    mimeType: "application/pdf",
    fileName: "sample-en.pdf",
    tenantId: "tenant-1",
    documentId: "doc-1",
    documentVersion: 1,
  });

  assert.equal(result.parserName, "pdf-parse");
  assert.ok(result.pages.length > 0);
  assert.equal(result.pages[0].pageNumber, 1);
  assert.ok(result.pages[0].blocks.length > 0);
  assert.match(result.pages[0].blocks[0].text, /Hello World/);
  assert.equal(result.metadata.hasImageOnlyPages, false);
});

test("PdfParser - throws encrypted error for password-protected PDF", async () => {
  const parser = new PdfParser();
  const buffer = await fs.readFile(path.join(FIXTURES_DIR, "sample-encrypted.pdf"));

  const { PDFParse, PasswordException } = await import("pdf-parse");
  const originalGetText = PDFParse.prototype.getText;
  PDFParse.prototype.getText = async function () {
    throw new PasswordException("Password required");
  };

  try {
    await assert.rejects(
      async () => {
        await parser.parse({
          buffer,
          mimeType: "application/pdf",
          fileName: "normal-report.pdf",
          tenantId: "tenant-1",
          documentId: "doc-2",
          documentVersion: 1,
        });
      },
      (err: unknown) => err instanceof Error && err.message === "encrypted"
    );
  } finally {
    PDFParse.prototype.getText = originalGetText;
  }
});

test("PdfParser - throws error for malformed PDF", async () => {
  const parser = new PdfParser();
  const buffer = await fs.readFile(path.join(FIXTURES_DIR, "sample-malformed.pdf"));

  await assert.rejects(
    async () => {
      await parser.parse({
        buffer,
        mimeType: "application/pdf",
        fileName: "sample-malformed.pdf",
        tenantId: "tenant-1",
        documentId: "doc-3",
        documentVersion: 1,
      });
    }
  );
});
