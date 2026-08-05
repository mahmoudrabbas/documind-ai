import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../common/errors/AppError.js";
import {
  FILE_SIGNATURE_MISMATCH,
  FILE_SIZE_LIMIT_EXCEEDED,
  FILE_ZERO_BYTES,
  UNSUPPORTED_FILE_TYPE,
} from "../../common/errors/errorCodes.js";
import {
  ALLOWED_VISION_MIME_TYPES,
  getVisionMimeType,
  isAllowedVisionMimeType,
  validateVisionFile,
} from "./chat.vision.js";

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "latin1"),
  Buffer.alloc(64),
]);

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  throw new Error("Expected validateVisionFile to throw");
}

describe("getVisionMimeType", () => {
  it("detects supported image extensions", () => {
    assert.equal(getVisionMimeType("photo.jpg"), "image/jpeg");
    assert.equal(getVisionMimeType("photo.jpeg"), "image/jpeg");
    assert.equal(getVisionMimeType("photo.png"), "image/png");
    assert.equal(getVisionMimeType("photo.webp"), "image/webp");
    assert.equal(getVisionMimeType("PHOTO.JPG"), "image/jpeg");
  });

  it("returns null for unsupported extensions", () => {
    assert.equal(getVisionMimeType("photo.gif"), null);
    assert.equal(getVisionMimeType("photo.txt"), null);
    assert.equal(getVisionMimeType("photo"), null);
    assert.equal(getVisionMimeType("photo.pdf"), null);
  });
});

describe("isAllowedVisionMimeType", () => {
  it("only allows jpeg, png and webp", () => {
    assert.deepEqual(
      [...ALLOWED_VISION_MIME_TYPES].sort(),
      ["image/jpeg", "image/png", "image/webp"],
    );
    assert.equal(isAllowedVisionMimeType("image/jpeg"), true);
    assert.equal(isAllowedVisionMimeType("image/png"), true);
    assert.equal(isAllowedVisionMimeType("image/webp"), true);
    assert.equal(isAllowedVisionMimeType("image/gif"), false);
    assert.equal(isAllowedVisionMimeType("application/pdf"), false);
    assert.equal(isAllowedVisionMimeType(""), false);
  });
});

describe("validateVisionFile", () => {
  it("accepts a valid JPEG with matching extension and mime", () => {
    const result = validateVisionFile(JPEG, "photo.jpg", "image/jpeg");
    assert.equal(result.mimeType, "image/jpeg");
    assert.equal(result.sizeBytes, JPEG.length);
  });

  it("accepts a valid PNG", () => {
    const result = validateVisionFile(PNG, "photo.png", "image/png");
    assert.equal(result.mimeType, "image/png");
  });

  it("accepts a valid WebP", () => {
    const result = validateVisionFile(WEBP, "photo.webp", "image/webp");
    assert.equal(result.mimeType, "image/webp");
  });

  it("rejects an empty file", () => {
    assert.equal(
      codeOf(() => validateVisionFile(Buffer.alloc(0), "photo.jpg", "image/jpeg")),
      FILE_ZERO_BYTES,
    );
  });

  it("rejects unsupported file types", () => {
    assert.equal(
      codeOf(() => validateVisionFile(JPEG, "photo.txt", "text/plain")),
      UNSUPPORTED_FILE_TYPE,
    );
    assert.equal(
      codeOf(() => validateVisionFile(Buffer.alloc(10), "photo.gif", "image/gif")),
      UNSUPPORTED_FILE_TYPE,
    );
    assert.equal(
      codeOf(() => validateVisionFile(JPEG, "photo", undefined)),
      UNSUPPORTED_FILE_TYPE,
    );
  });

  it("rejects a MIME type that does not match the extension", () => {
    assert.equal(
      codeOf(() => validateVisionFile(JPEG, "photo.png", "image/jpeg")),
      UNSUPPORTED_FILE_TYPE,
    );
  });

  it("rejects files larger than the configured size limit", () => {
    assert.equal(
      codeOf(() =>
        validateVisionFile(JPEG, "photo.jpg", "image/jpeg", {
          maxFileSizeBytes: 16,
        }),
      ),
      FILE_SIZE_LIMIT_EXCEEDED,
    );
  });

  it("rejects content whose magic bytes do not match the declared type", () => {
    assert.equal(
      codeOf(() => validateVisionFile(Buffer.alloc(64), "photo.jpg", "image/jpeg")),
      FILE_SIGNATURE_MISMATCH,
    );
    assert.equal(
      codeOf(() => validateVisionFile(JPEG, "photo.png", "image/png")),
      FILE_SIGNATURE_MISMATCH,
    );
  });

  it("rejects a WebP candidate that is not a RIFF/WEBP container", () => {
    const fakeWebp = Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.from([0x20, 0x00, 0x00, 0x00]),
      Buffer.from("XXXX", "latin1"),
      Buffer.alloc(10),
    ]);
    assert.equal(
      codeOf(() => validateVisionFile(fakeWebp, "photo.webp", "image/webp")),
      FILE_SIGNATURE_MISMATCH,
    );
    assert.equal(
      codeOf(() =>
        validateVisionFile(Buffer.alloc(4, 0), "photo.webp", "image/webp"),
      ),
      FILE_SIGNATURE_MISMATCH,
    );
  });
});
