import { describe, expect, it } from "vitest";
import { classifySourceFile } from "./source-preview";

describe("chat source preview classification", () => {
  it.each([
    ["application/pdf", "policy.pdf", "pdf"],
    ["application/octet-stream", "policy.pdf", "pdf"],
    ["text/plain", "policy.txt", "text"],
    ["application/octet-stream", "policy.txt", "text"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "policy.docx", "unsupported"],
    ["application/msword", "policy.doc", "unsupported"],
    ["application/octet-stream", "policy.bin", "unsupported"],
    ["", "policy", "unsupported"],
  ])("classifies %s/%s as %s", (mimeType, fileName, expected) => {
    expect(classifySourceFile(mimeType, fileName)).toBe(expected);
  });

  it("prefers authoritative MIME type while retaining safe extension compatibility", () => {
    expect(classifySourceFile("application/pdf", "file.txt")).toBe("pdf");
    expect(classifySourceFile("text/plain", "file.pdf")).toBe("text");
  });
});
