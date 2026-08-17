import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CONFLICT_EXCERPT_MAX_CHARS,
  renderUnresolvedConflictAnswer,
} from "./conflictAnswer.js";

const sources = [
  {
    chunkId: "chunk-a",
    documentId: "doc-1",
    documentTitle: "Remote Work Policy v1",
    sectionTitle: "Weekly allowance",
    pageNumber: 2,
    text: "Remote work is allowed 1 day per week.",
  },
  {
    chunkId: "chunk-b",
    documentId: "doc-2",
    documentTitle: "Remote Work Policy v2",
    sectionTitle: "Weekly allowance",
    pageNumber: 2,
    text: "Remote work is allowed 2 days per week.",
  },
];

describe("renderUnresolvedConflictAnswer", () => {
  test("presents every position separately with its source and never decides a winner", () => {
    const answer = renderUnresolvedConflictAnswer({ language: "en", sources });
    assert.match(answer, /Remote Work Policy v1/u);
    assert.match(answer, /1 day per week/u);
    assert.match(answer, /Remote Work Policy v2/u);
    assert.match(answer, /2 days per week/u);
    assert.match(answer, /do not resolve which position applies/u);
    for (const winnerWord of [
      "authoritative",
      "correct",
      "preferred",
      "newer",
      "final answer",
      "applies instead",
    ]) {
      assert.equal(
        answer.toLowerCase().includes(winnerWord),
        false,
        `${winnerWord} must never appear`,
      );
    }
  });

  test("renders Arabic for Arabic and mixed contexts without winner wording", () => {
    for (const language of ["ar", "mixed"] as const) {
      const answer = renderUnresolvedConflictAnswer({ language, sources });
      assert.match(answer, /كلا الموقفين/u, language);
      assert.match(answer, /1 day per week/u, language);
      assert.match(answer, /2 days per week/u, language);
      assert.equal(/المعتمدة|الأفضل/.test(answer), false, language);
    }
  });

  test("bounds excerpts deterministically", () => {
    const long = "x".repeat(CONFLICT_EXCERPT_MAX_CHARS + 500);
    const answer = renderUnresolvedConflictAnswer({
      language: "en",
      sources: [{ ...sources[0]!, text: long }],
    });
    assert.ok(answer.length < long.length);
    assert.ok(answer.includes("…"));
  });

  test("fails closed without sources", () => {
    assert.throws(() => renderUnresolvedConflictAnswer({ language: "en", sources: [] }));
  });

  test("output is deterministic for identical inputs", () => {
    const first = renderUnresolvedConflictAnswer({ language: "en", sources });
    const second = renderUnresolvedConflictAnswer({ language: "en", sources });
    assert.equal(first, second);
  });
});
