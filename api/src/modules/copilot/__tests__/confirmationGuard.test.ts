import { describe, it, expect } from "vitest";
import { buildConfirmationRequest, requiresConfirmation } from "../guards/confirmationGuard.js";

describe("buildConfirmationRequest", () => {
  it("returns null for safe level", () => {
    const result = buildConfirmationRequest(0, "searchDocuments", { query: "test" }, "safe", "Search");
    expect(result).toBeNull();
  });

  it("returns null when toolName is null", () => {
    const result = buildConfirmationRequest(0, null, null, "medium", "Navigate");
    expect(result).toBeNull();
  });

  it("builds a confirmation request for medium level", () => {
    const result = buildConfirmationRequest(1, "uploadDocument", { filename: "doc.pdf" }, "medium", "Upload a document");
    expect(result).not.toBeNull();
    expect(result!.stepIndex).toBe(1);
    expect(result!.toolName).toBe("uploadDocument");
    expect(result!.confirmationLevel).toBe("medium");
    expect(result!.description).toBe("Upload a document");
    expect(result!.impact).toContain("modify data");
  });

  it("builds a confirmation request for high level", () => {
    const result = buildConfirmationRequest(2, "deleteDocument", { documentId: "123" }, "high", "Delete document");
    expect(result).not.toBeNull();
    expect(result!.stepIndex).toBe(2);
    expect(result!.confirmationLevel).toBe("high");
    expect(result!.impact).toContain("cannot be undone");
  });

  it("uses empty object when parameters is null", () => {
    const result = buildConfirmationRequest(0, "runImport", null, "medium", "Run import");
    expect(result).not.toBeNull();
    expect(result!.parameters).toEqual({});
  });
});

describe("requiresConfirmation", () => {
  it("returns false for safe level", () => {
    expect(requiresConfirmation("safe")).toBe(false);
  });

  it("returns true for medium level", () => {
    expect(requiresConfirmation("medium")).toBe(true);
  });

  it("returns true for high level", () => {
    expect(requiresConfirmation("high")).toBe(true);
  });
});
