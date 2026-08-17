import { AppError } from "../../common/errors/AppError.js";
import {
  FILE_SIGNATURE_MISMATCH,
  FILE_SIZE_LIMIT_EXCEEDED,
  FILE_ZERO_BYTES,
  UNSUPPORTED_FILE_TYPE,
} from "../../common/errors/errorCodes.js";

/**
 * Authoritative document file validation.
 *
 * The client-supplied MIME type is never trusted: the file extension is
 * validated against a canonical allowlist and the first bytes are checked
 * against the expected content signature before a document is stored.
 */

/** The canonical document file extensions this module knows how to validate. */
export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** Canonical extension (without a dot) for each supported document MIME type. */
export const DOCUMENT_MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

/** Canonical MIME type for each supported file extension (no leading dot). */
export const DOCUMENT_EXTENSION_MIME_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(DOCUMENT_MIME_TYPE_EXTENSIONS).map(([mime, extension]) => [
    extension,
    mime,
  ]),
);

export const DOCUMENT_ALLOWED_FILE_EXTENSIONS = Object.values(
  DOCUMENT_MIME_TYPE_EXTENSIONS,
).map((extension) => `.${extension}`);

const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Keep aligned with {@link LocalFileSignatureScanner}. */
const TEXT_PRINTABLE_RATIO_THRESHOLD = 0.7;

export interface DocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface DocumentFileValidationOptions {
  allowedMimeTypes?: readonly string[];
  maxSizeBytes?: number;
}

export interface DocumentFileValidationResult {
  extension: string;
  mimeType: string;
}

/** Lower-cased file extension without the leading dot. */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

/** Resolve the extension list for a set of allowed MIME types. */
export function getFileExtensionsForMimeTypes(
  mimeTypes: readonly string[],
): string[] {
  return Array.from(
    new Set(
      mimeTypes
        .map((mime) => DOCUMENT_MIME_TYPE_EXTENSIONS[mime])
        .filter((extension): extension is string => Boolean(extension)),
    ),
  );
}

/** A PDF file starts with the `%PDF-` header. */
export function hasPdfSignature(buffer: Buffer): boolean {
  const header = Buffer.from("%PDF-");
  return buffer.length >= header.length && buffer.subarray(0, header.length).equals(header);
}

/** A ZIP container starts with the `PK\x03\x04` local header. */
export function isZipSignature(buffer: Buffer): boolean {
  const signature = Buffer.from("PK\x03\x04");
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

/**
 * Read the entry names from a ZIP archive by parsing its central directory.
 * No decompression is performed — only header metadata is inspected, so the
 * content is never expanded.
 */
export function readZipEntryNames(buffer: Buffer): string[] {
  const names: string[] = [];

  if (buffer.length < 22) return names;

  const eocdSignature = Buffer.from("PK\x05\x06");
  let eocdOffset = -1;
  const eocdSearchStart = buffer.length - 22;
  const eocdSearchEnd = Math.max(0, buffer.length - 22 - 65_535);
  for (let i = eocdSearchStart; i >= eocdSearchEnd; i--) {
    if (buffer.subarray(i, i + 4).equals(eocdSignature)) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return names;

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (centralDirectoryOffset + centralDirectorySize > buffer.length) {
    return names;
  }

  const centralSignature = Buffer.from("PK\x01\x02");
  let cursor = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > buffer.length) break;
    if (!buffer.subarray(cursor, cursor + 4).equals(centralSignature)) break;

    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nameStart = cursor + 46;

    if (nameStart + nameLength > buffer.length) break;

    names.push(
      buffer.subarray(nameStart, nameStart + nameLength).toString("utf-8"),
    );

    cursor = nameStart + nameLength + extraLength + commentLength;
  }

  return names;
}

/** A DOCX must be a ZIP containing both `[Content_Types].xml` and `word/document.xml`. */
export function isDocxContent(buffer: Buffer): boolean {
  if (!isZipSignature(buffer)) return false;

  const names = readZipEntryNames(buffer);
  return names.includes("[Content_Types].xml") && names.includes("word/document.xml");
}

/**
 * A plain-text file must be mostly printable. Counts control bytes and NUL
 * bytes as non-printable so binary content renamed to `.txt` is rejected.
 */
export function isTextLike(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;

  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let printable = 0;

  for (const byte of sample) {
    if (
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte <= 126) ||
      byte >= 160
    ) {
      printable++;
    }
  }

  return printable / sample.length >= TEXT_PRINTABLE_RATIO_THRESHOLD;
}

function signatureMismatch(): AppError {
  return new AppError(
    400,
    FILE_SIGNATURE_MISMATCH,
    "File contents do not match the declared file type",
  );
}

/**
 * Validate an uploaded document file. Throws an {@link AppError} describing
 * the first failing rule. On success returns the canonical extension and MIME
 * type to persist (never the client-supplied values).
 */
export function validateDocumentFile(
  file: DocumentFile,
  options: DocumentFileValidationOptions = {},
): DocumentFileValidationResult {
  const allowedMimeTypes = options.allowedMimeTypes ?? DOCUMENT_ALLOWED_MIME_TYPES;
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  if (file.size === 0) {
    throw new AppError(400, FILE_ZERO_BYTES, "File is empty (zero bytes)");
  }

  if (file.size > maxSizeBytes) {
    throw new AppError(
      413,
      FILE_SIZE_LIMIT_EXCEEDED,
      "File size exceeds the maximum allowed limit",
    );
  }

  const extension = getFileExtension(file.originalname);

  if (!getFileExtensionsForMimeTypes(allowedMimeTypes).includes(extension)) {
    throw new AppError(
      400,
      UNSUPPORTED_FILE_TYPE,
      `File type .${extension} is not supported`,
    );
  }

  const expectedMimeType = DOCUMENT_EXTENSION_MIME_TYPES[extension];
  const providedMimeType = file.mimetype.trim().toLowerCase();

  // A declared MIME type is never trusted. It is only enforced when it is an
  // explicit, non-generic value; the content-signature check below is the real
  // gate. The following values mean "type not really specified" and fall back
  // to content sniffing:
  //   - ""                       — empty header
  //   - "application/octet-stream" — generic fallback used by many HTTP stacks
  //   - "text/plain"             — busboy's default when a part omits
  //                                `Content-Type:`
  const isMimeUnspecified = [
    "",
    "application/octet-stream",
    "text/plain",
  ].includes(providedMimeType);

  if (!isMimeUnspecified && providedMimeType !== expectedMimeType) {
    throw signatureMismatch();
  }

  switch (extension) {
    case "pdf":
      if (!hasPdfSignature(file.buffer)) throw signatureMismatch();
      break;
    case "docx":
      if (!isDocxContent(file.buffer)) throw signatureMismatch();
      break;
    case "txt":
      if (!isTextLike(file.buffer)) throw signatureMismatch();
      break;
    default:
      throw new AppError(
        400,
        UNSUPPORTED_FILE_TYPE,
        `File type .${extension} is not supported`,
      );
  }

  return { extension, mimeType: expectedMimeType };
}
