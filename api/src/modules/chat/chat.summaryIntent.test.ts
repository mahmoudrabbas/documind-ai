import assert from "node:assert/strict";
import test from "node:test";
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";
import { boundSummaryContext, detectAnswerTask } from "./chat.service.js";

function candidate(
  chunkId: string,
  pageNumber: number,
  text: string,
): RetrievalCandidate {
  return {
    chunkId,
    documentId: "document-a",
    documentVersionId: "version-a",
    tenantId: "tenant-a",
    text,
    score: 0.9,
    pageNumber,
    retrievalMethod: "hybrid",
  };
}

test("detectAnswerTask classifies summary requests deterministically", () => {
  assert.equal(detectAnswerTask(null, "لخص ملف civic ops"), "document_summary");
  assert.equal(
    detectAnswerTask(
      { detectedIntent: "knowledge_question" },
      "لخص ملف civic ops بالتفصيل واذكر أهم النقاط",
    ),
    "document_summary",
  );
  assert.equal(
    detectAnswerTask({ detectedIntent: "summarization" }, "anything at all"),
    "document_summary",
  );
  assert.equal(
    detectAnswerTask(null, "summarize the Employee Handbook"),
    "document_summary",
  );
  assert.equal(
    detectAnswerTask(null, "What is the remote work policy?"),
    "direct_question",
  );
});

test("boundSummaryContext dedupes pages and caps chunks and context", () => {
  assert.deepEqual(boundSummaryContext([]), []);
  assert.deepEqual(
    boundSummaryContext([
      candidate("c1", 1, "Alpha"),
      candidate("c2", 1, "Beta"),
      candidate("c3", 2, "Gamma"),
    ]).map(({ chunkId }) => chunkId),
    ["c1", "c3"],
  );

  const many = Array.from({ length: 20 }, (_, index) =>
    candidate(`m${index}`, index + 1, "x"),
  );
  assert.ok(boundSummaryContext(many).length <= 8);
  assert.equal(
    boundSummaryContext([candidate("big", 1, "y".repeat(25_000))]).length,
    1,
  );
});
