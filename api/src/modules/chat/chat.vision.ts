import { AppError } from "../../common/errors/AppError.js";
import {
  FILE_SIGNATURE_MISMATCH,
  FILE_SIZE_LIMIT_EXCEEDED,
  FILE_ZERO_BYTES,
  UNSUPPORTED_FILE_TYPE,
} from "../../common/errors/errorCodes.js";
import { config } from "../../config/index.js";

export const ALLOWED_VISION_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type VisionMimeType = (typeof ALLOWED_VISION_MIME_TYPES)[number];

const MIME_BY_EXTENSION: Record<string, VisionMimeType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Magic byte signatures that must match the declared MIME type. */
const MAGIC_SIGNATURES: Record<VisionMimeType, Uint8Array> = {
  "image/jpeg": new Uint8Array([0xff, 0xd8, 0xff]),
  "image/png": new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": new Uint8Array([0x52, 0x49, 0x46, 0x46]), // "RIFF"; WEBP marker checked separately
};

const WEBP_RIFF_TYPE = "WEBP";

function bytesEqual(buffer: Buffer, signature: Uint8Array, offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[offset + i] !== signature[i]) return false;
  }
  return true;
}

function isWebp(buffer: Buffer): boolean {
  // RIFF size WEBP
  return (
    bytesEqual(buffer, MAGIC_SIGNATURES["image/webp"]) &&
    buffer.length >= 12 &&
    buffer.toString("latin1", 8, 12) === WEBP_RIFF_TYPE
  );
}

/**
 * Returns the vision MIME type for a file based on its extension, or null
 * when the extension is not one of the supported image types.
 */
export function getVisionMimeType(originalName: string): VisionMimeType | null {
  const ext = originalName.slice(originalName.lastIndexOf(".")).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? null;
}

export interface VisionFileValidationResult {
  mimeType: VisionMimeType;
  sizeBytes: number;
}

/**
 * Validates an uploaded image for the vision flow:
 * 1. extension/declared MIME must be in the allowed set;
 * 2. the buffer must not be empty;
 * 3. the buffer must not exceed the size limit;
 * 4. magic bytes must match the declared MIME type.
 *
 * Throws an AppError with a specific code for each rejection class so the
 * client can surface a clear message.
 */
export function validateVisionFile(
  buffer: Buffer,
  originalName: string,
  declaredMimeType?: string,
  options: { maxFileSizeBytes?: number } = {},
): VisionFileValidationResult {
  const maxFileSizeBytes =
    options.maxFileSizeBytes ?? config.VISION_MAX_FILE_SIZE_BYTES;

  if (buffer.length === 0) {
    throw new AppError(400, FILE_ZERO_BYTES, "Uploaded image is empty");
  }

  const byExtension = getVisionMimeType(originalName);
  const allowed =
    declaredMimeType &&
    (ALLOWED_VISION_MIME_TYPES as readonly string[]).includes(declaredMimeType)
      ? declaredMimeType
      : null;

  const mimeType = byExtension ?? (allowed as VisionMimeType | null);
  if (!mimeType) {
    throw new AppError(
      400,
      UNSUPPORTED_FILE_TYPE,
      "Only JPG, PNG and WebP images are supported for image analysis",
    );
  }

  if (byExtension && declaredMimeType && byExtension !== declaredMimeType) {
    throw new AppError(
      400,
      UNSUPPORTED_FILE_TYPE,
      `MIME type ${declaredMimeType} does not match the file extension`,
    );
  }

  if (buffer.length > maxFileSizeBytes) {
    throw new AppError(
      400,
      FILE_SIZE_LIMIT_EXCEEDED,
      `Image exceeds the maximum allowed size of ${maxFileSizeBytes} bytes`,
    );
  }

  if (mimeType === "image/webp") {
    if (!isWebp(buffer)) {
      throw new AppError(400, FILE_SIGNATURE_MISMATCH, "File is not a valid WebP image");
    }
  } else if (!bytesEqual(buffer, MAGIC_SIGNATURES[mimeType])) {
    throw new AppError(400, FILE_SIGNATURE_MISMATCH, "File content does not match the declared image type");
  }

  return { mimeType, sizeBytes: buffer.length };
}

/**
 * Reads the currently configured vision size limit so controllers can apply
 * the same limit to multer.
 */
export function getVisionMaxFileSizeBytes(): number {
  return config.VISION_MAX_FILE_SIZE_BYTES;
}

export function isAllowedVisionMimeType(mimeType: string): boolean {
  return (ALLOWED_VISION_MIME_TYPES as readonly string[]).includes(mimeType);
}
