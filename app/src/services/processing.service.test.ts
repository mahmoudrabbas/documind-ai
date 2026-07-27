import { afterEach, describe, expect, it, vi } from "vitest";
import {
  retryOcrPages,
  triggerOcrProcessing,
} from "./processing.service";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("processing OCR endpoints", () => {
  it("Run OCR posts the selected page and language to the trigger endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ message: "queued", jobId: "job-1", idempotencyKey: "key-1" }, 202),
    );
    vi.stubGlobal("fetch", fetchMock);

    await triggerOcrProcessing("6a65ee5e8280c4374a34faff", {
      version: 1,
      language: "ar+en",
      pageNumbers: [1],
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /\/documents\/6a65ee5e8280c4374a34faff\/ocr\/trigger$/,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      documentId: "6a65ee5e8280c4374a34faff",
      version: 1,
      language: "ar+en",
      pageNumbers: [1],
    });
  });

  it("Retry posts only caller-selected retryable pages to the retry endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ message: "queued", jobId: "job-2", idempotencyKey: "key-2" }, 202),
    );
    vi.stubGlobal("fetch", fetchMock);

    await retryOcrPages("document-1", {
      version: 1,
      pageNumbers: [2, 3],
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /\/documents\/document-1\/ocr\/retry$/,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      version: 1,
      pageNumbers: [2, 3],
    });
  });
});

