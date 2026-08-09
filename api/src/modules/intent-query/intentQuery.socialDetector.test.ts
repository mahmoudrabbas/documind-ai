import test from "node:test";
import assert from "node:assert/strict";
import { detectSocialMessage } from "./intentQuery.socialDetector.js";
import type { SocialSubtypeValue } from "./intentQuery.types.js";

const SOCIAL: SocialSubtypeValue[] = [
  "greeting",
  "thanks",
  "farewell",
  "acknowledgement",
  "wellbeing",
];

function assertSocial(message: string, subtype?: SocialSubtypeValue) {
  const result = detectSocialMessage(message);
  assert.equal(result.isSocial, true, `expected "${message}" to be social`);
  assert.equal(result.reasonCode, "SOCIAL_FAST_PATH");
  if (subtype) {
    assert.equal(result.subtype, subtype, `expected "${message}" subtype to be ${subtype}`);
  } else {
    assert.ok(
      result.subtype && SOCIAL.includes(result.subtype),
      `expected "${message}" to carry a valid subtype, got ${result.subtype}`,
    );
  }
}

test("pure Arabic social phrases are classified as social with the right subtype", () => {
  const cases: Array<[string, SocialSubtypeValue]> = [
    ["شكراً جزيلاً", "thanks"],
    ["شكرا", "thanks"],
    ["شكرًا لك", "thanks"],
    ["السلام عليكم", "greeting"],
    ["السلام عليكم ورحمة الله", "greeting"],
    ["تسلم يدك", "thanks"],
    ["يعطيك العافيه", "thanks"],
    ["جزاك الله خيرا", "thanks"],
    ["بارك الله فيك", "thanks"],
    ["اهلا وسهلا", "greeting"],
    ["كيف حالك", "wellbeing"],
    ["صباح الخير", "greeting"],
    ["مساء الخير", "greeting"],
    ["الحمد لله", "acknowledgement"],
    ["بخير", "wellbeing"],
    ["مع السلامه", "farewell"],
    ["مبروك", "acknowledgement"],
    ["عيد مبارك", "acknowledgement"],
    ["كل عام وانت بخير", "acknowledgement"],
    ["رمضان كريم", "greeting"],
    ["بالتوفيق", "farewell"],
    ["تمام", "acknowledgement"],
    ["اوكي", "acknowledgement"],
    ["مرحبا", "greeting"],
    ["شكرا جدا", "thanks"],
  ];
  for (const [message, subtype] of cases) {
    assertSocial(message, subtype);
  }
});

test("English social phrases are classified as social with the right subtype", () => {
  const cases: Array<[string, SocialSubtypeValue]> = [
    ["thanks", "thanks"],
    ["thank you", "thanks"],
    ["Thank You!", "thanks"],
    ["good morning", "greeting"],
    ["good evening", "greeting"],
    ["hello", "greeting"],
    ["hi", "greeting"],
    ["how are you", "wellbeing"],
    ["you're welcome", "thanks"],
    ["ok", "acknowledgement"],
    ["okay", "acknowledgement"],
    ["got it", "acknowledgement"],
    ["great", "acknowledgement"],
    ["nice", "acknowledgement"],
    ["have a nice day", "farewell"],
  ];
  for (const [message, subtype] of cases) {
    assertSocial(message, subtype);
  }
});

test("emoji/symbol-only messages are classified as social acknowledgement", () => {
  for (const message of ["👍", "👋🙂", "😊", "❤️", "🎉"]) {
    assertSocial(message, "acknowledgement");
  }
});

test("social prefixes never override a substantive request", () => {
  for (const message of [
    "شكراً، ما هي سياسة الإجازات؟",
    "السلام عليكم، أريد معرفة سياسة الترقية",
    "صباح الخير، كم عدد أيام الإجازة المرضية؟",
    "thanks, what is the leave policy?",
    "thank you. what are the working hours?",
    "مرحبا، ما هو سقف الإنفاق؟",
    "شكرا جزيلا أرجو شرح سياسة الحضور",
  ]) {
    const result = detectSocialMessage(message);
    assert.equal(result.isSocial, false, `expected "${message}" NOT to be social`);
    assert.equal(result.reasonCode, null);
  }
});

test("question marks never disqualify a known social message", () => {
  const cases: Array<[string, SocialSubtypeValue]> = [
    ["شكراً؟", "thanks"],
    ["كيف حالك؟", "wellbeing"],
    ["كيف حالكم؟", "wellbeing"],
    ["أخبارك؟", "wellbeing"],
    ["هل أنت بخير؟", "wellbeing"],
    ["هلا؟", "greeting"],
    ["تمام؟", "acknowledgement"],
    ["How are you?", "wellbeing"],
    ["How are you doing?", "wellbeing"],
    ["Are you okay?", "wellbeing"],
    ["What's up?", "wellbeing"],
    ["are you ok?", "wellbeing"],
  ];
  for (const [message, subtype] of cases) {
    assertSocial(message, subtype);
  }
});

test("substantive Arabic and English questions are never social", () => {
  for (const message of [
    "ما هي سياسة الإجازات؟",
    "أين أجد نموذج طلب الإجازة؟",
    "مرحباً، أين أجد نموذج طلب الإجازة؟",
    "كيف أطلب إجازة؟",
    "what is the remote work policy",
    "Hello, what is the remote work policy?",
    "Are employees allowed to work remotely?",
    "compare the leave policies",
    "هل يمكنني رفع وثيقة؟",
    "كيف أطلب إجازة",
  ]) {
    const result = detectSocialMessage(message);
    assert.equal(result.isSocial, false, `expected "${message}" NOT to be social`);
  }
});

test("empty, whitespace, and punctuation-only messages are not social", () => {
  for (const message of ["", "   ", "...", "---", "؟", "?"]) {
    const result = detectSocialMessage(message);
    assert.equal(result.isSocial, false, `expected "${JSON.stringify(message)}" NOT to be social`);
    assert.equal(result.subtype, null);
  }
});

test("kashida, harakat, and full-width variants are normalized before matching", () => {
  const result = detectSocialMessage("شكراً جَزيلاً");
  assert.equal(result.isSocial, true);
  assert.equal(result.reasonCode, "SOCIAL_FAST_PATH");
  assert.equal(result.subtype, "thanks");
});

test("unknown messages fall through as non-social without a subtype", () => {
  const result = detectSocialMessage("tell me about the new process workflow");
  assert.equal(result.isSocial, false);
  assert.equal(result.subtype, null);
});

test("bounded typo, elongation, dialect and mixed-language social forms are recognized", () => {
  const cases: Array<[string, SocialSubtypeValue]> = [
    ["شجرا", "thanks"],
    ["شكررا", "thanks"],
    ["شكرن", "thanks"],
    ["شكراااا", "thanks"],
    ["تسلممم", "thanks"],
    ["شكرا يا قائد", "thanks"],
    ["ألف شكر يا معلم", "thanks"],
    ["ماشي", "acknowledgement"],
    ["اشطا", "acknowledgement"],
    ["thx", "thanks"],
    ["tnx", "thanks"],
    ["thanx", "thanks"],
    ["thanks يا قائد", "thanks"],
    ["شكرا bro", "thanks"],
  ];
  for (const [message, subtype] of cases) assertSocial(message, subtype);
});

test("bounded fuzzy matching never consumes substantive questions", () => {
  for (const message of [
    "شكرا، كام يوم الإجازة السنوية؟",
    "السلام عليكم، ما سياسة الإجازات؟",
    "thanks, what is our leave policy?",
    "تسلم، ممكن تلخص HR_Policy.pdf؟",
    "شجرة الشركة جميلة",
    "سياسة شكر الموظفين",
    "ما سياسة الشكر والتقدير؟",
  ]) {
    assert.equal(detectSocialMessage(message).isSocial, false, message);
  }
});
