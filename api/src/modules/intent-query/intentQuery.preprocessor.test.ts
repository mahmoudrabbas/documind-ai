import test from "node:test";
import assert from "node:assert/strict";
import {
  preprocessIntentText,
  reduceCharacterElongation,
} from "./intentQuery.preprocessor.js";

test("intent preprocessing preserves the exact original separately", () => {
  const original = "  شُكــراً، HR_Policy.pdf 2026!  ";
  const result = preprocessIntentText(original);
  assert.equal(result.originalText, original);
  assert.equal(result.normalizedText, "شكرا hr policy pdf 2026");
  assert.deepEqual(result.normalizedTokens, ["شكرا", "hr", "policy", "pdf", "2026"]);
  assert.equal(result.language, "mixed");
  assert.deepEqual(result.scripts, { arabic: true, latin: true });
});

test("classification preprocessing normalizes whitespace, punctuation, casing and Arabic letters", () => {
  const result = preprocessIntentText("\tإجَازَة   سَنَوِيَّة؟ THANKS!!!");
  assert.equal(result.normalizedText, "اجازه سنويه thanks");
  assert.deepEqual(result.normalizedTokens, ["اجازه", "سنويه", "thanks"]);
});

test("elongation reduction collapses only runs of three or more letters", () => {
  assert.equal(reduceCharacterElongation("شكراااا تسلممم thankssss good"), "شكرا تسلم thanks good");
  const result = preprocessIntentText("شكراااا ❤️");
  assert.equal(result.elongationReducedText, "شكرا");
  assert.equal(result.hasEmojiOrSymbol, true);
});

test("preprocessing is request-local and immutable", () => {
  const result = preprocessIntentText("Thanks");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.normalizedTokens), true);
});
