import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { t as translateKey } from "@/lib/i18n/i18n.utils";
import en from "@/lib/i18n/translations/en";
import { getDocumentUploadErrorKey } from "@/lib/document-upload-errors";

describe("document upload error mapping", () => {
  it.each([
    ["UNSUPPORTED_FILE_TYPE", "documents.fileTypeNotSupported"],
    ["FILE_ZERO_BYTES", "documents.fileEmpty"],
    ["FILE_SIGNATURE_MISMATCH", "documents.fileContentsMismatch"],
  ] as const)("maps %s to a localized key", (code, key) => {
    expect(getDocumentUploadErrorKey(new ApiError({ status: 400, code, message: "raw" }))).toBe(key);
    expect(translateKey(en, key)).not.toBe(key);
  });

  it("keeps FILE_SIZE_LIMIT_EXCEEDED verbatim so the tenant-specific limit is shown", () => {
    expect(getDocumentUploadErrorKey(new ApiError({ status: 413, code: "FILE_SIZE_LIMIT_EXCEEDED", message: "File size 3.0MB exceeds the maximum allowed size of 2MB" }))).toBeNull();
  });

  it("returns null for non-ApiError errors", () => {
    expect(getDocumentUploadErrorKey(new Error("boom"))).toBeNull();
    expect(getDocumentUploadErrorKey(null)).toBeNull();
    expect(getDocumentUploadErrorKey("string")).toBeNull();
  });
});
