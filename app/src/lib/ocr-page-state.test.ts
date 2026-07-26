import { describe, expect, it } from "vitest";
import { getRetryableOcrPageNumbers } from "./ocr-page-state";

describe("OCR page retry eligibility", () => {
  it("includes only failed and explicitly retryable pages", () => {
    expect(
      getRetryableOcrPageNumbers([
        { pageNumber: 1, status: "completed" },
        { pageNumber: 2, status: "failed" },
        { pageNumber: 3, status: "retry" },
        { pageNumber: 4, status: "processing" },
        { pageNumber: 5, status: "pending" },
      ]),
    ).toEqual([2, 3]);
  });

  it("does not treat a completed page as retryable", () => {
    expect(
      getRetryableOcrPageNumbers([
        { pageNumber: 1, status: "completed" },
      ]),
    ).toEqual([]);
  });
});

