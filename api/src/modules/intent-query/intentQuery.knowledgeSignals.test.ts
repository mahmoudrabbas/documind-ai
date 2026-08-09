import test from "node:test";
import assert from "node:assert/strict";
import {
  assessPositiveKnowledgeSeeking,
  isLikelyGibberish,
  selectSafeRetrievalQuestion,
  stripLeadingSocialExpression,
} from "./intentQuery.knowledgeSignals.js";

test("positive knowledge signals require both enterprise/document scope and a request shape", () => {
  for (const input of [
    "ما سياسة الإجازات السنوية؟",
    "What is our leave policy?",
    "تسلم، ممكن تلخص HR_Policy.pdf؟",
    "summarize the employee handbook",
  ]) {
    assert.equal(assessPositiveKnowledgeSeeking(input).positive, true, input);
  }
  for (const input of ["شجرا", "asdasd", "What is the capital of France?"]) {
    assert.equal(assessPositiveKnowledgeSeeking(input).positive, false, input);
  }
});

test("verified social prefixes are removed without consuming the knowledge remainder", () => {
  assert.deepEqual(stripLeadingSocialExpression("شكرا، كام يوم الإجازة السنوية؟"), {
    text: "كام يوم الإجازة السنوية؟",
    removed: true,
  });
  assert.deepEqual(stripLeadingSocialExpression("thanks, what is our leave policy?"), {
    text: "what is our leave policy?",
    removed: true,
  });
});

test("safe retrieval normalization preserves critical anchors and rejects unrelated rewrites", () => {
  assert.equal(
    selectSafeRetrievalQuestion(
      "شكرا، كام يوم الاجازه السنويه؟",
      "كام يوم الإجازة السنوية؟",
    ),
    "كام يوم الإجازة السنوية؟",
  );
  assert.equal(
    selectSafeRetrievalQuestion(
      "لخص HR_Policy.pdf لسنة 2026",
      "لخص سياسة الرواتب لسنة 2025",
    ),
    "لخص HR_Policy.pdf لسنة 2026",
  );
  assert.equal(
    selectSafeRetrievalQuestion(
      "What is the anual leave polcy?",
      "What is the annual leave policy?",
    ),
    "What is the annual leave policy?",
  );
  assert.equal(
    selectSafeRetrievalQuestion(
      "Summarize the Blue Falcon policy",
      "Summarize the Red Falcon policy",
      ["Blue Falcon"],
    ),
    "Summarize the Blue Falcon policy",
  );
  assert.equal(
    selectSafeRetrievalQuestion(
      "Can an employee use annual leave during probation?",
      "Who approves an expense of EGP 7,500? Can an employee use annual leave during probation?",
    ),
    "Can an employee use annual leave during probation?",
  );
});

test("short random input is gibberish but social and policy questions are not", () => {
  assert.equal(isLikelyGibberish("asdasd"), true);
  assert.equal(isLikelyGibberish("qwerty zxcvb"), true);
  assert.equal(isLikelyGibberish("شجرا"), false);
  assert.equal(isLikelyGibberish("ما سياسة الإجازات؟"), false);
});
