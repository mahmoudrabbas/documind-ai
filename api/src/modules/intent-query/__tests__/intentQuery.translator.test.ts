import test from "node:test";
import assert from "node:assert/strict";
import {
  translateQuery,
  buildTranslatedQueries,
  type CompleteFn,
} from "../intentQuery.translator.js";

function completeWith(content: string): CompleteFn {
  return async () => ({
    id: "t1",
    provider: "test",
    model: "test-translator",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finishReason: "stop",
      },
    ],
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    latencyMs: 1,
    estimatedCost: 0,
  });
}

test("translateQuery - English question produces an Arabic translation", async () => {
  const complete = completeWith(
    JSON.stringify({ ar: "أخبرني عن ملف الحمقى", en: "tell me about the idiots file" }),
  );
  const result = await translateQuery(complete, "tell me about the idiots file", "en");
  assert.equal(result.ar, "أخبرني عن ملف الحمقى");
  assert.equal(result.en, "tell me about the idiots file");
});

test("translateQuery - Arabic question produces an English translation", async () => {
  const complete = completeWith(
    JSON.stringify({ ar: "ما محتوى ملف الحمقى", en: "what is the content of the idiots file" }),
  );
  const result = await translateQuery(complete, "ما محتوى ملف الحمقى", "ar");
  assert.equal(result.en, "what is the content of the idiots file");
});

test("translateQuery - preserves the source-language form when the model omits it", async () => {
  const complete = completeWith(JSON.stringify({ ar: "ما محتوى الملف" }));
  const result = await translateQuery(complete, "what is the file content", "en");
  assert.equal(result.ar, "ما محتوى الملف");
  // The English (source) form is always retained.
  assert.equal(result.en, "what is the file content");
});

test("translateQuery - strips markdown code fences", async () => {
  const complete = completeWith(
    "```json\n{\"ar\": \"ما محتوى الملف\", \"en\": \"what is the file content\"}\n```",
  );
  const result = await translateQuery(complete, "what is the file content", "en");
  assert.equal(result.ar, "ما محتوى الملف");
});

test("translateQuery - fail-open on invalid JSON", async () => {
  const complete = completeWith("not json at all");
  const result = await translateQuery(complete, "hello", "en");
  assert.deepEqual(result, {});
});

test("translateQuery - fail-open on provider error", async () => {
  const failing: CompleteFn = async () => {
    throw new Error("provider offline");
  };
  const result = await translateQuery(failing, "hello", "en");
  assert.deepEqual(result, {});
});

test("buildTranslatedQueries - English source adds Arabic semantic and keyword queries", () => {
  const translated = { ar: "أخبرني عن كتاب محاط بالحمقى", en: "tell me about the idiots file" };
  const { semanticTexts, keywordTerms } = buildTranslatedQueries(
    "tell me about the idiots file",
    "en",
    translated,
  );
  assert.deepEqual(semanticTexts, ["أخبرني عن كتاب محاط بالحمقى"]);
  assert.ok(keywordTerms.length > 0);
  assert.ok(keywordTerms[0]!.length > 0);
});

test("buildTranslatedQueries - skips the source-identical text", () => {
  const translated = { ar: "same as source", en: "same as source" };
  const { semanticTexts, keywordTerms } = buildTranslatedQueries(
    "same as source",
    "en",
    translated,
  );
  assert.deepEqual(semanticTexts, []);
  assert.deepEqual(keywordTerms, []);
});

test("buildTranslatedQueries - mixed language adds both counterparts", () => {
  const translated = {
    ar: "ما محتوى كتاب الحمقى",
    en: "what is the content of the idiots book",
  };
  const { semanticTexts } = buildTranslatedQueries(
    "ملف ediots ما محتواه",
    "mixed",
    translated,
  );
  assert.equal(semanticTexts.length, 2);
});
