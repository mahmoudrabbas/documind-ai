import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../common/errors/AppError.js";
import {
  DOCUMENT_ALLOWED_FILE_EXTENSIONS,
  DOCUMENT_ALLOWED_MIME_TYPES,
  getFileExtension,
  isDocxContent,
  isTextLike,
  readZipEntryNames,
  validateDocumentFile,
  type DocumentFile,
} from "./documentFileValidator.js";

/* ── Minimal stored-ZIP builder (no compression, no external deps) ── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildStoredZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name, "utf-8");
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x21, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x21, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += 30 + nameBuffer.length + data.length;
  }

  const localSize = localParts.reduce((sum, part) => sum + part.length, 0);
  const centralBuffer = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(localSize, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

function buildDocx(): Buffer {
  return buildStoredZip([
    {
      name: "[Content_Types].xml",
      data: Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    },
    {
      name: "word/document.xml",
      data: Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>'),
    },
  ]);
}

function buildXlsx(): Buffer {
  return buildStoredZip([
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "xl/workbook.xml", data: Buffer.from("<workbook/>") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from("<worksheet/>") },
  ]);
}

const PDF_BUFFER = Buffer.from("%PDF-1.4 test document content", "utf-8");
const TXT_BUFFER = Buffer.from("Hello, this is a plain text file.\nSecond line.\n", "utf-8");

function makeFile(overrides: Partial<DocumentFile>): DocumentFile {
  return {
    originalname: "file.pdf",
    mimetype: "application/pdf",
    size: PDF_BUFFER.length,
    buffer: PDF_BUFFER,
    ...overrides,
  };
}

function assertThrowsCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof AppError, `expected AppError, got ${String(error)}`);
    assert.equal((error as AppError).code, code);
    return;
  }
  assert.fail(`expected error code ${code}`);
}

test("DOCUMENT_ALLOWED_MIME_TYPES matches the narrowed PDF/DOCX/TXT allowlist", () => {
  assert.deepEqual([...DOCUMENT_ALLOWED_MIME_TYPES], [
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  assert.deepEqual(DOCUMENT_ALLOWED_FILE_EXTENSIONS, [".pdf", ".txt", ".docx"]);
});

test("getFileExtension extracts the lower-cased extension", () => {
  assert.equal(getFileExtension("report.pdf"), "pdf");
  assert.equal(getFileExtension("REPORT.PDF"), "pdf");
  assert.equal(getFileExtension("notes.txt"), "txt");
  assert.equal(getFileExtension("archive"), "");
  assert.equal(getFileExtension(".hidden"), "");
  assert.equal(getFileExtension("a.b.c.docx"), "docx");
});

test("readZipEntryNames returns the entries from a real zip", () => {
  const zip = buildStoredZip([
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "word/document.xml", data: Buffer.from("<w/>") },
  ]);
  assert.deepEqual(readZipEntryNames(zip), ["[Content_Types].xml", "word/document.xml"]);
  assert.deepEqual(readZipEntryNames(Buffer.from("not a zip at all")), []);
});

test("isDocxContent requires the DOCX structure", () => {
  assert.equal(isDocxContent(buildDocx()), true);
  assert.equal(isDocxContent(buildXlsx()), false);
  assert.equal(isDocxContent(PDF_BUFFER), false);
});

test("isTextLike rejects binary content", () => {
  assert.equal(isTextLike(TXT_BUFFER), true);
  assert.equal(isTextLike(Buffer.from("MZ\x00\x00binary\x00\x00\x00\x01\x02\x03\x04\xff\xfe\xfd")), false);
});

test("accepts a valid PDF with the correct MIME type", () => {
  const result = validateDocumentFile(makeFile({}));
  assert.deepEqual(result, { extension: "pdf", mimeType: "application/pdf" });
});

test("accepts a valid DOCX with the correct MIME type", () => {
  const docx = buildDocx();
  const result = validateDocumentFile(
    makeFile({
      originalname: "notes.docx",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: docx.length,
      buffer: docx,
    }),
  );
  assert.deepEqual(result, {
    extension: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
});

test("accepts a valid TXT with the correct MIME type", () => {
  const result = validateDocumentFile(
    makeFile({ originalname: "notes.txt", mimetype: "text/plain", size: TXT_BUFFER.length, buffer: TXT_BUFFER }),
  );
  assert.deepEqual(result, { extension: "txt", mimeType: "text/plain" });
});

test("accepts a valid file when the client sends an empty MIME type", () => {
  const result = validateDocumentFile(makeFile({ mimetype: "" }));
  assert.equal(result.mimeType, "application/pdf");
});

test("content-sniffs generic MIME fallbacks instead of trusting them", () => {
  const result = validateDocumentFile(makeFile({ mimetype: "text/plain" }));
  assert.equal(result.mimeType, "application/pdf");

  const octet = validateDocumentFile(makeFile({ mimetype: "application/octet-stream" }));
  assert.equal(octet.mimeType, "application/pdf");

  const txtFallback = validateDocumentFile(
    makeFile({ originalname: "notes.txt", mimetype: "text/plain", buffer: TXT_BUFFER }),
  );
  assert.equal(txtFallback.mimeType, "text/plain");
});

test("rejects zero-byte files with FILE_ZERO_BYTES", () => {
  assertThrowsCode(() => validateDocumentFile(makeFile({ size: 0, buffer: Buffer.alloc(0) })), "FILE_ZERO_BYTES");
});

test("rejects oversized files with FILE_SIZE_LIMIT_EXCEEDED", () => {
  const big = Buffer.alloc(1024, 0x41);
  assertThrowsCode(
    () => validateDocumentFile(makeFile({ size: big.length, buffer: big }), { maxSizeBytes: 512 }),
    "FILE_SIZE_LIMIT_EXCEEDED",
  );
});

test("rejects unsupported extensions with UNSUPPORTED_FILE_TYPE", () => {
  assertThrowsCode(() => validateDocumentFile(makeFile({ originalname: "notes.md" })), "UNSUPPORTED_FILE_TYPE");
  assertThrowsCode(() => validateDocumentFile(makeFile({ originalname: "old.doc" })), "UNSUPPORTED_FILE_TYPE");
  assertThrowsCode(() => validateDocumentFile(makeFile({ originalname: "sheet.xlsx" })), "UNSUPPORTED_FILE_TYPE");
  assertThrowsCode(() => validateDocumentFile(makeFile({ originalname: "app.exe" })), "UNSUPPORTED_FILE_TYPE");
  assertThrowsCode(() => validateDocumentFile(makeFile({ originalname: "archive" })), "UNSUPPORTED_FILE_TYPE");
});

test("honors an allowedMimeTypes override for the extension allowlist", () => {
  assertThrowsCode(
    () => validateDocumentFile(makeFile({ originalname: "notes.docx", mimetype: "", buffer: buildDocx() }), {
      allowedMimeTypes: ["application/pdf"],
    }),
    "UNSUPPORTED_FILE_TYPE",
  );
});

test("rejects a MIME type that does not match the extension", () => {
  assertThrowsCode(
    () => validateDocumentFile(makeFile({ mimetype: "image/png" })),
    "FILE_SIGNATURE_MISMATCH",
  );
  assertThrowsCode(
    () => validateDocumentFile(makeFile({ mimetype: "application/x-msdownload" })),
    "FILE_SIGNATURE_MISMATCH",
  );
  assertThrowsCode(
    () => validateDocumentFile(makeFile({ originalname: "notes.txt", mimetype: "application/pdf", buffer: TXT_BUFFER })),
    "FILE_SIGNATURE_MISMATCH",
  );
});

test("rejects content that does not match the declared extension", () => {
  // Image bytes renamed to PDF.
  const image = Buffer.from("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "binary");
  assertThrowsCode(() => validateDocumentFile(makeFile({ buffer: image })), "FILE_SIGNATURE_MISMATCH");

  // A ZIP renamed to PDF.
  assertThrowsCode(
    () => validateDocumentFile(makeFile({ buffer: buildXlsx() })),
    "FILE_SIGNATURE_MISMATCH",
  );

  // A DOCX renamed to PDF.
  assertThrowsCode(
    () => validateDocumentFile(makeFile({ buffer: buildDocx() })),
    "FILE_SIGNATURE_MISMATCH",
  );

  // A XLSX renamed to DOCX (zip without the DOCX structure).
  assertThrowsCode(
    () =>
      validateDocumentFile(
        makeFile({
          originalname: "sheet.docx",
          mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: buildXlsx(),
        }),
      ),
    "FILE_SIGNATURE_MISMATCH",
  );

  // A generic zip renamed to DOCX.
  assertThrowsCode(
    () =>
      validateDocumentFile(
        makeFile({
          originalname: "bundle.docx",
          mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: buildStoredZip([{ name: "random.bin", data: Buffer.from("hello") }]),
        }),
      ),
    "FILE_SIGNATURE_MISMATCH",
  );

  // Binary content renamed to TXT.
  const binary = Buffer.concat([Buffer.alloc(32, 0x00), Buffer.from("MZ")]);
  assertThrowsCode(
    () => validateDocumentFile(makeFile({ originalname: "notes.txt", mimetype: "text/plain", buffer: binary })),
    "FILE_SIGNATURE_MISMATCH",
  );
});
