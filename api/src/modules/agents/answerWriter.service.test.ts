import test from "node:test";
import assert from "node:assert/strict";
import {
  AnswerWriterService,
  buildRagMessages,
  insufficientEvidenceMessage,
  type AnswerWriterEvidenceItem,
  type AnswerWriterServiceResult,
} from "./answerWriter.service.js";
import { AnswerWriterOutputSchema } from "./chatAgentIO.js";
import type { ModelAdapter, ModelCompletionResponse } from "./agents.types.js";
import type { ChatSource } from "../chat/chat.types.js";

// ── fixtures ────────────────────────────────────────────────────────────────

const CHUNK_A = "chunk-a";
const CHUNK_B = "chunk-b";

const SOURCES: ChatSource[] = [
  {
    chunkId: CHUNK_A,
    documentId: "doc-a",
    text: "CivicOps runs an annual flood-response drill every Q1.",
    pageNumber: 3,
    sectionTitle: "Protected Values",
    score: 0.95,
    documentTitle: "Company Handbook",
  },
  {
    chunkId: CHUNK_B,
    documentId: "doc-b",
    text: "Incident command must publish a public status page within 30 minutes.",
    score: 0.9,
    documentTitle: "Civic Ops",
  },
];

const EVIDENCE: AnswerWriterEvidenceItem[] = [
  {
    chunkId: CHUNK_A,
    documentId: "507f1f77bcf86cd799439014",
    text: "CivicOps runs an annual flood-response drill every Q1.",
  },
  {
    chunkId: CHUNK_B,
    documentId: "507f1f77bcf86cd799439015",
    text: "Incident command must publish a public status page within 30 minutes.",
  },
];

/**
 * Recording provider adapter: captures every complete() invocation (including
 * the structured-output request) and replays a scripted raw content string.
 */
class RecordingAdapter implements ModelAdapter {
  readonly providerKey = "recorded";
  readonly modelName = "recorded-model";
  calls: Array<Record<string, unknown>> = [];
  content = "";

  setContent(content: string): void {
    this.content = content;
  }

  async complete(params: {
    messages: { role: string; content: string }[];
    temperature?: number;
    maxTokens?: number;
    structuredOutput?: { type: "json_object" };
  }): Promise<ModelCompletionResponse> {
    this.calls.push({ ...params });
    return {
      id: "recorded-1",
      provider: this.providerKey,
      model: this.modelName,
      choices: [
        { index: 0, message: { role: "assistant", content: this.content }, finishReason: "stop" },
      ],
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      latencyMs: 1,
      estimatedCost: 0,
    };
  }
}

function makeService(content: string): {
  service: AnswerWriterService;
  adapter: RecordingAdapter;
} {
  const adapter = new RecordingAdapter();
  adapter.setContent(content);
  return { service: new AnswerWriterService(adapter), adapter };
}

function generateArgs(overrides: Partial<Parameters<AnswerWriterService["generate"]>[0]> = {}) {
  return {
    conversationId: "507f1f77bcf86cd799439013",
    question: "Summarize the civic ops in 10 points.",
    task: "document_summary" as const,
    citationsEnabled: true,
    evidence: EVIDENCE,
    maxTokens: 2048,
    ...overrides,
  };
}

function assertFailClosed(result: AnswerWriterServiceResult, raw: string) {
  assert.ok(result.outcome === "usable");
  const usable = result as Extract<AnswerWriterServiceResult, { outcome: "usable" }>;
  assert.equal(usable.structured, false);
  assert.equal(usable.decision, "insufficient_evidence");
  assert.equal(usable.parsedDecision, "insufficient_evidence");
  assert.equal(usable.answer, insufficientEvidenceMessage("en"));
  assert.deepEqual(usable.citedChunkIds, []);
  assert.equal(usable.answer.includes(raw), false, "raw provider output must never surface");
}

// ── A: AnswerWriterService requests structured JSON mode ─────────────────────

test("A: AnswerWriterService requests structured JSON mode for the strict AnswerWriter contract", async () => {
  const { service, adapter } = makeService(
    JSON.stringify({ decision: "grounded_answer", answer: "Grounded.", citedChunkIds: [CHUNK_A] }),
  );

  await service.generate(generateArgs());

  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(adapter.calls[0].structuredOutput, { type: "json_object" });
});

// ── C: multiline answer via escaped newlines parses and round-trips ─────────

test("C: multiline grounded answer is valid JSON with escaped newline semantics and parses", async () => {
  const answerText = "Opening line.\n1. Point one\n2. Point two";
  const raw = JSON.stringify({
    decision: "grounded_answer",
    answer: answerText,
    citedChunkIds: [CHUNK_A, CHUNK_B],
  });
  const { service } = makeService(raw);

  // The raw provider payload must be syntactically valid JSON: newlines must be
  // the escaped sequence, not literal control characters.
  assert.doesNotThrow(() => JSON.parse(raw));
  assert.ok(raw.includes("\\n"), "raw JSON must use escaped \\n for newlines");
  assert.equal(raw.includes("\n"), false, "raw JSON must not contain literal newlines");

  const result = await service.generate(generateArgs());
  assert.ok(result.outcome === "usable");
  const usable = result as Extract<AnswerWriterServiceResult, { outcome: "usable" }>;
  assert.equal(usable.structured, true);
  assert.equal(usable.decision, "grounded_answer");
  assert.equal(usable.answer, answerText);
  assert.deepEqual(usable.citedChunkIds, [CHUNK_A, CHUNK_B]);
});

// ── D: valid structured grounded output flows through ───────────────────────

test("D: valid structured grounded output returns the human answer and preserves citations", async () => {
  const raw = JSON.stringify({
    decision: "grounded_answer",
    answer: "CivicOps publishes a status page within 30 minutes.",
    citedChunkIds: [CHUNK_B],
  });
  const { service } = makeService(raw);

  const result = await service.generate(generateArgs());

  // The provider payload itself parses and satisfies the strict schema.
  assert.deepEqual(AnswerWriterOutputSchema.safeParse(JSON.parse(raw)).success, true);

  assert.ok(result.outcome === "usable");
  const usable = result as Extract<AnswerWriterServiceResult, { outcome: "usable" }>;
  assert.equal(usable.structured, true);
  assert.equal(usable.parsedDecision, "grounded_answer");
  assert.equal(usable.decision, "grounded_answer");
  assert.equal(usable.answer, "CivicOps publishes a status page within 30 minutes.");
  assert.deepEqual(usable.citedChunkIds, [CHUNK_B]);
});

test("D2: hidden reasoning is stripped from a structured standard-text answer", async () => {
  const { service } = makeService(JSON.stringify({
    decision: "grounded_answer",
    answer: "<think>private reasoning</think>The supported answer.",
    citedChunkIds: [CHUNK_A],
  }));

  const result = await service.generate(generateArgs());
  assert.equal(result.outcome, "usable");
  const usable = result as Extract<AnswerWriterServiceResult, { outcome: "usable" }>;
  assert.equal(usable.answer, "The supported answer.");
  assert.doesNotMatch(usable.answer, /think|private reasoning/i);
});

test("D3: reasoning-only structured output cannot become a successful answer", async () => {
  const { service } = makeService(JSON.stringify({
    decision: "grounded_answer",
    answer: "<think>private reasoning only</think>",
    citedChunkIds: [CHUNK_A],
  }));

  const result = await service.generate(generateArgs());
  assert.equal(result.outcome, "unusable");
  assert.doesNotMatch(result.sanitizedContent, /private reasoning/i);
});

test("D4: an unclosed reasoning block cannot become a successful answer", async () => {
  const { service } = makeService(JSON.stringify({
    decision: "grounded_answer",
    answer: "<think>private reasoning only",
    citedChunkIds: [CHUNK_A],
  }));

  const result = await service.generate(generateArgs());
  assert.equal(result.outcome, "unusable");
});

// ── E–H: malformed / plain / unknown-key output still fails closed ──────────

test("E: malformed JSON still fails closed", async () => {
  const raw = '{"decision": "grounded_answer", "answer": "truncated';
  const { service } = makeService(raw);
  const result = await service.generate(generateArgs());
  assertFailClosed(result, raw);
});

test("F: literal control-character malformed JSON still fails closed", async () => {
  // The exact CivicOps failure class: unescaped LF bytes inside the answer
  // string make JSON.parse throw "Bad control character in string literal".
  const raw = '{"decision":"grounded_answer","answer":"Line one\n1. Point one\n2. Point two","citedChunkIds":["' + CHUNK_A + '"]}';
  const { service } = makeService(raw);
  const result = await service.generate(generateArgs());
  assertFailClosed(result, raw);
});

test("G: plain prose still fails closed", async () => {
  const raw = "Sure! Here is a summary of the civic ops.";
  const { service } = makeService(raw);
  const result = await service.generate(generateArgs());
  assertFailClosed(result, raw);
});

test("H: unknown keys still fail closed", async () => {
  const raw =
    '{"decision":"grounded_answer","answer":"Grounded.","citedChunkIds":["' +
    CHUNK_A +
    '"],"confidential":"secret"}';
  const { service } = makeService(raw);
  const result = await service.generate(generateArgs());
  assertFailClosed(result, raw);
});

// ── I: grounded_answer without valid citations fails closed ────────────────

test("I: grounded_answer with no valid citations is downgraded to insufficient_evidence", async () => {
  const raw = JSON.stringify({
    decision: "grounded_answer",
    answer: "Grounded claim with no citation support.",
    citedChunkIds: [],
  });
  const { service } = makeService(raw);

  const result = await service.generate(generateArgs());
  assert.ok(result.outcome === "usable");
  const usable = result as Extract<AnswerWriterServiceResult, { outcome: "usable" }>;
  assert.equal(usable.structured, true);
  assert.equal(usable.parsedDecision, "grounded_answer");
  assert.equal(usable.decision, "insufficient_evidence");
  assert.deepEqual(usable.citedChunkIds, []);
});

test("I2: citations outside the authorized evidence set are dropped and grounded is downgraded", async () => {
  const raw = JSON.stringify({
    decision: "grounded_answer",
    answer: "Grounded claim citing an unauthorized chunk.",
    citedChunkIds: ["not-in-evidence"],
  });
  const { service } = makeService(raw);

  const result = await service.generate(generateArgs());
  assert.ok(result.outcome === "usable");
  const usable = result as Extract<AnswerWriterServiceResult, { outcome: "usable" }>;
  assert.equal(usable.parsedDecision, "grounded_answer");
  assert.equal(usable.decision, "insufficient_evidence");
  assert.deepEqual(usable.citedChunkIds, []);
});

test("I3: mixed valid and invented citations retain only the approved evidence subset", async () => {
  const { service } = makeService(JSON.stringify({
    decision: "grounded_answer",
    answer: "A supported answer.",
    citedChunkIds: [CHUNK_A, "invented-chunk"],
  }));

  const result = await service.generate(generateArgs());
  assert.equal(result.outcome, "usable");
  const usable = result as Extract<AnswerWriterServiceResult, { outcome: "usable" }>;
  assert.equal(usable.decision, "grounded_answer");
  assert.deepEqual(usable.citedChunkIds, [CHUNK_A]);
});

// ── CivicOps regression: multiline 10-point grounded summary ───────────────

test("CivicOps regression: multiline 10-point grounded summary is usable and never leaks raw JSON", async () => {
  const summary = [
    "Flood-response operations summary:",
    "1. The flood-response drill runs every Q1.",
    "2. Incident command publishes a status page within 30 minutes.",
    "3. Public alerts are issued through the county notification system.",
    "4. Shelters are opened when river levels exceed the alert threshold.",
    "5. Field crews report to pre-assigned staging areas.",
    "6. Dispatch coordinates with the utilities department on outages.",
    "7. Recovery phase begins after the all-clear is declared.",
    "8. Damage assessments are collected within 72 hours.",
    "9. Lessons-learned reports are filed within two weeks.",
    "10. The operations center logs every action for the record.",
  ].join("\n");
  const raw = JSON.stringify({
    decision: "grounded_answer",
    answer: summary,
    citedChunkIds: [CHUNK_A, CHUNK_B],
  });
  const { service, adapter } = makeService(raw);

  const result = await service.generate(generateArgs());

  // The structured-output path must be requested end to end.
  assert.deepEqual(adapter.calls[0].structuredOutput, { type: "json_object" });

  assert.ok(result.outcome === "usable");
  const usable = result as Extract<AnswerWriterServiceResult, { outcome: "usable" }>;
  assert.equal(usable.structured, true);
  assert.equal(usable.parsedDecision, "grounded_answer");
  assert.equal(usable.decision, "grounded_answer");
  assert.equal(usable.answer, summary);
  assert.ok(usable.answer.includes("\n"), "answer must be a human-readable multiline summary");
  assert.ok(usable.answer.includes("1.") && usable.answer.includes("10."), "answer must contain the numbered points");
  assert.deepEqual(usable.citedChunkIds, [CHUNK_A, CHUNK_B]);

  // The user-facing answer must never contain the raw JSON envelope.
  assert.equal(usable.answer.includes('"decision":'), false);
  assert.equal(usable.answer.includes('"citedChunkIds":'), false);
});

// ── J: evidence block anchors ────────────────────────────────────────────────

test("J: English evidence embeds id and doc anchors in every source header", () => {
  const messages = buildRagMessages({
    citationsEnabled: true,
    historyFromDb: [],
    sources: SOURCES,
    userMessage: "Summarize the civic ops in 10 points.",
  });

  const contextMsg = messages.find((m) => m.content.includes("Context:"));
  assert.ok(contextMsg, "English context message must be emitted");
  assert.match(
    contextMsg.content,
    /\[Source 1: id:chunk-a doc:doc-a title:Company Handbook — Protected Values \(p\.3\)\]/,
  );
  assert.match(contextMsg.content, /\[Source 2: id:chunk-b doc:doc-b title:Civic Ops\]/);

  // The anchors let the model read back the exact chunk doc — verified above.
  assert.match(contextMsg.content, /id:chunk-a/);
  assert.match(contextMsg.content, /doc:doc-a/);
});

test("K: Arabic evidence embeds id and doc anchors in every source header", () => {
  const messages = buildRagMessages({
    citationsEnabled: true,
    historyFromDb: [],
    sources: SOURCES,
    userMessage: "لخص ملف civic ops",
    language: "ar",
  });

  const contextMsg = messages.find((m) => m.content.includes("السياق:"));
  assert.ok(contextMsg, "Arabic context message must be emitted");
  assert.match(
    contextMsg.content,
    /\[المصدر 1: id:chunk-a doc:doc-a العنوان:Company Handbook — Protected Values \(صفحة 3\)\]/,
  );
  assert.match(
    contextMsg.content,
    /\[المصدر 2: id:chunk-b doc:doc-b العنوان:Civic Ops\]/,
  );

  // Same machine-readable anchor tokens as English so Arabic generations can
  // copy back the exact chunk ids (not page numbers or titles).
  assert.match(contextMsg.content, /id:chunk-a/);
  assert.match(contextMsg.content, /doc:doc-a/);
});
