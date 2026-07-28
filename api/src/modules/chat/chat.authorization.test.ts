import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { asRetrievalUnavailable, insufficientAuthorizedEvidenceResponse, safeHistoryForRag } from "./chat.service.js";

test("no authorized evidence produces a refusal without citations", () => {
  assert.deepEqual(insufficientAuthorizedEvidenceResponse("conversation-1"), {
    answer: "I don't have sufficient authorized evidence to answer that question.",
    sources: [],
    conversationId: "conversation-1",
  });
});

test("cached evidence-derived assistant answers are not replayed into new LLM context", () => {
  const history = safeHistoryForRag([
    { role: "user", content: "What is the protected value?", sources: [] },
    { role: "assistant", content: "Leaked protected value", sources: [{ documentId: "restricted" }] },
    { role: "assistant", content: "Please clarify.", sources: [] },
  ]);
  assert.deepEqual(history, [
    { role: "user", content: "What is the protected value?" },
    { role: "assistant", content: "Please clarify." },
  ]);
});

test("backend failure remains RETRIEVAL_UNAVAILABLE instead of an authorization refusal", () => {
  const original = new AppError(503, "RETRIEVAL_UNAVAILABLE", "All search backends unavailable");
  assert.equal(asRetrievalUnavailable(original), original);

  const normalized = asRetrievalUnavailable(new Error("Atlas unavailable"));
  assert.equal(normalized.statusCode, 503);
  assert.equal(normalized.code, "RETRIEVAL_UNAVAILABLE");
  assert.notEqual(normalized.message, "I don't have sufficient authorized evidence to answer that question.");
});
