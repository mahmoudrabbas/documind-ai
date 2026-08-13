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
    sources: [SOURCE],
    userMessage: "What is the protected value?",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Return JSON ONLY/);
  assert.match(messages[0].content, /"decision"/);
  assert.match(messages[0].content, /"answer"/);
  assert.match(messages[0].content, /"citedChunkIds"/);
  assert.match(messages[0].content, /grounded_answer/);

  assert.match(messages[0].content, /untrusted reference data/);
  const contextMsg = messages[1];
  assert.equal(contextMsg.role, "user");
  assert.match(contextMsg.content, /RAG_REQUEST_DATA_START/);
  assert.match(contextMsg.content, /"chunkId":"chunk-1"/);
  assert.match(contextMsg.content, /"documentId":"doc-1"/);
  assert.match(contextMsg.content, /The protected value is 42/);
  assert.match(contextMsg.content, /"currentQuestion":"What is the protected value\?"/);
});

test("Arabic language uses Arabic RAG system prompt and context instructions", () => {
  const messages = buildRagMessages({
    citationsEnabled: true,
    sources: [SOURCE],
    userMessage: "ما هي القيمة المحمية؟",
    language: "ar",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /أنت DocuMind AI/);
  assert.match(messages[0].content, /Return JSON ONLY/);
  assert.match(messages[0].content, /\{"decision","answer","citedChunkIds"\}/);
  assert.match(messages[0].content, /grounded_answer/);
  assert.match(messages[0].content, /قيمة answer بالكامل باللغة العربية/);
  assert.match(messages[0].content, /معرفات المقاطع المقدمة التي استُخدمت فعلياً/);

  assert.match(messages[0].content, /بيانات غير موثوقة/);
  const contextMsg = messages[1];
  assert.equal(contextMsg.role, "user");
  assert.match(contextMsg.content, /RAG_REQUEST_DATA_START/);
  assert.match(contextMsg.content, /"chunkId":"chunk-1"/);
  assert.match(contextMsg.content, /"currentQuestion":"ما هي القيمة المحمية؟"/);
});

test("Arabic language with citations disabled uses Arabic no-citations prompt", () => {
  const messages = buildRagMessages({
    citationsEnabled: false,
    sources: [SOURCE],
    userMessage: "ما هي القيمة المحمية؟",
    language: "ar",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Return JSON ONLY/);
  assert.match(messages[0].content, /\{"decision","answer","citedChunkIds"\}/);
  assert.match(messages[0].content, /لا تضع داخل قيمة answer أي استشهادات ظاهرة/);
  assert.match(messages[0].content, /citedChunkIds مطلوبة للتتبع الداخلي/);

  const contextMsg = messages[1];
  assert.equal(contextMsg.role, "user");
  assert.match(contextMsg.content, /RAG_REQUEST_DATA_START/);
  assert.match(contextMsg.content, /"chunkId":"chunk-1"/);
});

test("mixed language is treated as Arabic context", () => {
  const messages = buildRagMessages({
    citationsEnabled: true,
    sources: [SOURCE],
    userMessage: "ما هي سياسة vacation؟",
    language: "mixed",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /أنت DocuMind AI/);

  const contextMsg = messages[1];
  assert.equal(contextMsg.role, "user");
  assert.match(contextMsg.content, /"chunkId":"chunk-1"/);
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
    sources: [SOURCE],
    userMessage: "What is the protected value?",
  });

  assert.equal(messages[0].role, "system");
  assert.doesNotMatch(messages[0].content, /mention which document it came from/);
  assert.match(messages[0].content, /Return JSON ONLY/);
  assert.match(messages[0].content, /Do not put visible citations, source references, footnotes/);
  assert.match(messages[0].content, /citedChunkIds remains required for internal provenance/);

  const contextMsg = messages[1];
  assert.equal(contextMsg.role, "user");
  assert.match(contextMsg.content, /RAG_REQUEST_DATA_START/);

  assert.ok(messages[1].content.includes(SOURCE.text), "retrieved context is still provided");
});

test("Arabic document summaries keep the canonical structured contract and Arabic answer rule", () => {
  const messages = buildRagMessages({
    citationsEnabled: true,
    sources: [SOURCE],
    userMessage: "لخص المستند",
    task: "document_summary",
    language: "ar",
  });

  assert.match(messages[0].content, /Return JSON ONLY/);
  assert.match(messages[0].content, /\{"decision","answer","citedChunkIds"\}/);
  assert.match(messages[0].content, /ملخصاً منظماً/);
  assert.match(messages[0].content, /قيمة answer بالكامل باللغة العربية/);
});

test("answer generation contains only the current resolved user turn", () => {
  const messages = buildRagMessages({
    citationsEnabled: true,
    sources: [],
    userMessage: "Can a full-time employee use annual leave during probation?",
  });

  const userMessages = messages.filter((message) => message.role === "user");
  assert.equal(userMessages.length, 1);
  assert.match(
    userMessages[0]?.content ?? "",
    /"currentQuestion":"Can a full-time employee use annual leave during probation\?"/,
  );
  assert.equal(messages.some((message) => /EGP 7,500|Department Head/.test(message.content)), false);
});

test("no context block when no sources are retrieved", () => {
  const messages = buildRagMessages({
    citationsEnabled: false,
    sources: [],
    userMessage: "hello",
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.match(messages[1].content, /"currentQuestion":"hello"/);
  assert.match(messages[1].content, /"authorizedEvidence":\[\]/);
});
