import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { asRetrievalUnavailable, buildRagMessages, insufficientAuthorizedEvidenceResponse, safeHistoryForRag } from "./chat.service.js";

const SOURCE = {
  chunkId: "chunk-1",
  documentId: "doc-1",
  text: "The protected value is 42.",
  pageNumber: 3,
  sectionTitle: "Protected Values",
  score: 0.95,
  documentTitle: "Company Handbook",
};

test("no authorized evidence produces a refusal without citations", () => {
  assert.deepEqual(insufficientAuthorizedEvidenceResponse("conversation-1"), {
    answer: "I don't have sufficient authorized evidence to answer that question.",
    sources: [],
    conversationId: "conversation-1",
  });
});

test("no authorized evidence produces an Arabic refusal when language is ar", () => {
  assert.deepEqual(insufficientAuthorizedEvidenceResponse("conversation-1", "ar"), {
    answer: "عذراً، لم أتمكن من العثور على معلومات كافية في المستندات المتاحة للإجابة على سؤالك. يرجى التأكد من رفع المستندات ذات الصلة أو إعادة صياغة سؤالك.",
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

test("source-less history strips hidden reasoning before replay", () => {
  const history = safeHistoryForRag([
    { role: "assistant", content: "<think>private reasoning</think>Please clarify.", sources: [] },
  ]);
  assert.deepEqual(history, [{ role: "assistant", content: "Please clarify." }]);
});

test("backend failure remains RETRIEVAL_UNAVAILABLE instead of an authorization refusal", () => {
  const original = new AppError(503, "RETRIEVAL_UNAVAILABLE", "All search backends unavailable");
  assert.equal(asRetrievalUnavailable(original), original);

  const normalized = asRetrievalUnavailable(new Error("Atlas unavailable"));
  assert.equal(normalized.statusCode, 503);
  assert.equal(normalized.code, "RETRIEVAL_UNAVAILABLE");
  assert.notEqual(normalized.message, "I don't have sufficient authorized evidence to answer that question.");
});

test("citations enabled uses the citing system prompt and instructs to always cite", () => {
  const messages = buildRagMessages({
    citationsEnabled: true,
    historyFromDb: [],
    sources: [SOURCE],
    userMessage: "What is the protected value?",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Return JSON ONLY/);
  assert.match(messages[0].content, /"decision"/);
  assert.match(messages[0].content, /"answer"/);
  assert.match(messages[0].content, /"citedChunkIds"/);
  assert.match(messages[0].content, /grounded_answer/);

  const contextMsg = messages[1];
  assert.equal(contextMsg.role, "system");
  assert.match(contextMsg.content, /Always cite your sources/);
  assert.match(contextMsg.content, /Context:/);
  assert.match(
    contextMsg.content,
    /\[Source 1: id:[^\s\]]+ doc:[^\s\]]+ title:Company Handbook — Protected Values \(p\.3\)\]/,
  );
  assert.match(contextMsg.content, /The protected value is 42/);

  assert.deepEqual(messages[messages.length - 1], {
    role: "user",
    content: "What is the protected value?",
  });
});

test("Arabic language uses Arabic RAG system prompt and context instructions", () => {
  const messages = buildRagMessages({
    citationsEnabled: true,
    historyFromDb: [],
    sources: [SOURCE],
    userMessage: "ما هي القيمة المحمية؟",
    language: "ar",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /أنت DocuMind AI/);
  assert.match(messages[0].content, /اذكر المستند الذي جاءت منه/);

  const contextMsg = messages[1];
  assert.equal(contextMsg.role, "system");
  assert.match(contextMsg.content, /اذكر دائماً مصادرك/);
  assert.match(contextMsg.content, /السياق:/);
  assert.match(
    contextMsg.content,
    /\[المصدر 1: id:chunk-1 doc:doc-1 العنوان:Company Handbook — Protected Values \(صفحة 3\)\]/,
  );

  assert.deepEqual(messages[messages.length - 1], {
    role: "user",
    content: "ما هي القيمة المحمية؟",
  });
});

test("Arabic language with citations disabled uses Arabic no-citations prompt", () => {
  const messages = buildRagMessages({
    citationsEnabled: false,
    historyFromDb: [],
    sources: [SOURCE],
    userMessage: "ما هي القيمة المحمية؟",
    language: "ar",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /لا تضمن أي استشهادات/);

  const contextMsg = messages[1];
  assert.match(contextMsg.content, /لا تذكر أو تستشهد بمصادرك/);
});

test("mixed language is treated as Arabic context", () => {
  const messages = buildRagMessages({
    citationsEnabled: true,
    historyFromDb: [],
    sources: [SOURCE],
    userMessage: "ما هي سياسة vacation؟",
    language: "mixed",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /أنت DocuMind AI/);

  const contextMsg = messages[1];
  assert.match(contextMsg.content, /\[المصدر 1:/);
});

test("mixed language insufficient evidence returns Arabic response", () => {
  assert.deepEqual(insufficientAuthorizedEvidenceResponse("conversation-1", "mixed"), {
    answer: "عذراً، لم أتمكن من العثور على معلومات كافية في المستندات المتاحة للإجابة على سؤالك. يرجى التأكد من رفع المستندات ذات الصلة أو إعادة صياغة سؤالك.",
    sources: [],
    conversationId: "conversation-1",
  });
});

test("citations disabled uses the non-citing system prompt and forbids source mentions", () => {
  const messages = buildRagMessages({
    citationsEnabled: false,
    historyFromDb: [],
    sources: [SOURCE],
    userMessage: "What is the protected value?",
  });

  assert.equal(messages[0].role, "system");
  assert.doesNotMatch(messages[0].content, /mention which document it came from/);
  assert.match(messages[0].content, /Do not include any citations, source references, footnotes/);

  const contextMsg = messages[1];
  assert.match(contextMsg.content, /Do not mention or cite your sources/);
  assert.doesNotMatch(contextMsg.content, /Always cite your sources/);

  assert.ok(messages[1].content.includes(SOURCE.text), "retrieved context is still provided");
});

test("conversation history is replayed into the prompt (last 10 only)", () => {
  const history = Array.from({ length: 12 }, (_, i) => ({
    role: "user" as const,
    content: `message-${i}`,
  }));
  const messages = buildRagMessages({
    citationsEnabled: true,
    historyFromDb: history,
    sources: [],
    userMessage: "next",
  });

  const historyContents = messages
    .map((m) => m.content)
    .filter((c) => c.startsWith("message-"));
  assert.equal(historyContents.length, 10);
  assert.equal(historyContents[0], "message-2");
  assert.equal(historyContents[historyContents.length - 1], "message-11");
});

test("no context block when no sources are retrieved", () => {
  const messages = buildRagMessages({
    citationsEnabled: false,
    historyFromDb: [],
    sources: [],
    userMessage: "hello",
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.deepEqual(messages[1], { role: "user", content: "hello" });
});
