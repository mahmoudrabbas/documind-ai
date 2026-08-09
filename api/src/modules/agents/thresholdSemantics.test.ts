import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveThresholdComparisons,
  deriveThresholdDecisions,
  extractNumericMentions,
  extractThresholdRules,
  hasNumericConsistencyViolation,
  normalizeNumericText,
} from "./thresholdSemantics.js";

function outcomes(question: string, evidence: string): boolean[] {
  return deriveThresholdComparisons(question, evidence).map((item) => item.satisfied);
}

test("evaluates lower-bound currency thresholds on both sides", () => {
  const evidence = "Receipts are required for any single expense greater than USD 25.";
  assert.deepEqual(outcomes("Are receipts required for $20?", evidence), [false]);
  assert.deepEqual(outcomes("Are receipts required for $30?", evidence), [true]);
});

test("evaluates inclusive employment-duration thresholds", () => {
  const evidence = "Employees who completed at least 90 days may request regular remote work.";
  assert.deepEqual(outcomes("Eligible after 30 days?", evidence), [false]);
  assert.deepEqual(outcomes("Eligible after 90 days?", evidence), [true]);
  assert.deepEqual(outcomes("Eligible after 120 days?", evidence), [true]);
});

test("evaluates procurement and purchase-order thresholds without exact-number anchoring", () => {
  const quotes = "For purchases above USD 2,000, at least three written vendor quotations are required.";
  assert.deepEqual(outcomes("Are quotations required for $1500?", quotes), [false]);
  assert.deepEqual(outcomes("Are quotations required for $2500?", quotes), [true]);

  const purchaseOrder = "A purchase order is required above USD 1,000.";
  assert.deepEqual(outcomes("Do I need a PO for $900?", purchaseOrder), [false]);
  assert.deepEqual(outcomes("Do I need a PO for $1500?", purchaseOrder), [true]);
});

test("represents bounded approval ranges and independently evaluates each documented rule", () => {
  const evidence = [
    "Purchases > USD 500 and <= USD 5,000 require department-head approval.",
    "Purchases above USD 5,000 require Finance Director approval.",
  ].join(" ");
  assert.deepEqual(outcomes("Who approves a $300 purchase?", evidence), [false, true, false]);
  assert.deepEqual(outcomes("Who approves a $1000 purchase?", evidence), [true, true, false]);
  assert.deepEqual(outcomes("Who approves a $6000 purchase?", evidence), [true, false, true]);
  assert.deepEqual(
    deriveThresholdDecisions("Who approves a $300 purchase?", evidence).map((item) => item.satisfied),
    [false, false],
  );
  assert.deepEqual(
    deriveThresholdDecisions("Who approves a $1000 purchase?", evidence).map((item) => item.satisfied),
    [true, false],
  );
  assert.deepEqual(
    deriveThresholdDecisions("Who approves a $6000 purchase?", evidence).map((item) => item.satisfied),
    [false, true],
  );
});

test("evaluates inclusive upper bounds", () => {
  const evidence = "Employees may work remotely up to 2 days per week.";
  assert.deepEqual(outcomes("Can I work remotely 1 day per week?", evidence), [true]);
  assert.deepEqual(outcomes("Can I work remotely 2 days per week?", evidence), [true]);
  assert.deepEqual(outcomes("Can I work remotely 3 days per week?", evidence), [false]);
});

test("recognizes the supported comparison vocabulary and symbolic operators", () => {
  const phrases = [
    ["greater than 2 days", "gt"], ["above 2 days", "gt"],
    ["more than 2 days", "gt"], ["> 2 days", "gt"],
    ["less than 2 days", "lt"], ["below 2 days", "lt"],
    ["fewer than 2 days", "lt"], ["< 2 days", "lt"],
    ["at least 2 days", "gte"], ["minimum of 2 days", "gte"],
    [">= 2 days", "gte"], ["at most 2 days", "lte"],
    ["maximum of 2 days", "lte"], ["up to 2 days", "lte"],
    ["<= 2 days", "lte"],
  ] as const;
  for (const [text, operator] of phrases) {
    assert.equal(extractThresholdRules(text)[0]?.operator, operator, text);
  }
  assert.equal(extractThresholdRules("minimum employment = 90 days")[0]?.operator, "gte");
  assert.equal(extractThresholdRules("maximum remote duration: 2 days")[0]?.operator, "lte");
});

test("normalizes Arabic-Indic and Eastern Arabic numerals for controlled parsing", () => {
  assert.equal(
    normalizeNumericText("٢٥ ٩٠ ١٠٠٠ ١٥٠٠ ۲۵ ١٬٥٠٠ ٢٫٥"),
    "25 90 1000 1500 25 1,500 2.5",
  );
  assert.deepEqual(
    extractNumericMentions("-٥ دولار و ٢٫٥ بالمئة").map(({ value, unit }) => ({ value, unit })),
    [
      { value: -5, unit: "currency:usd" },
      { value: 2.5, unit: "percentage" },
    ],
  );
});

test("extracts the bounded Arabic comparator vocabulary", () => {
  const phrases = [
    ["أكثر من ٢٥ دولار", "gt"],
    ["أكثر مِن ٢٥ دولار", "gt"],
    ["أكبر من ٢٥ دولار", "gt"],
    ["فوق ٢٥ دولار", "gt"],
    ["يزيد عن ٢٥ دولار", "gt"],
    ["على الأقل ٩٠ يومًا", "gte"],
    ["بحد أدنى ٩٠ يومًا", "gte"],
    ["لا يقل عن ٩٠ يومًا", "gte"],
    ["أقل من ١٠ أيام", "lt"],
    ["أصغر من ١٠ أيام", "lt"],
    ["تحت ١٠ أيام", "lt"],
    ["لا يزيد عن ٢ يوم", "lte"],
    ["بحد أقصى ٢ يوم", "lte"],
    ["حتى ٢ يوم", "lte"],
    ["إلى حد أقصى ٢ يوم", "lte"],
  ] as const;
  for (const [text, operator] of phrases) {
    assert.equal(extractThresholdRules(text)[0]?.operator, operator, text);
  }
});

test("evaluates Arabic and mixed-language threshold questions at their boundaries", () => {
  const receipts = "يجب تقديم إيصال للمصروفات التي تزيد عن ٢٥ دولارًا.";
  assert.deepEqual(outcomes("لو المصروف ٢٠ دولار، لازم أقدم إيصال؟", receipts), [false]);
  assert.deepEqual(outcomes("لو المصروف ٣٠ دولار، لازم أقدم إيصال؟", receipts), [true]);

  const remote = "يحق للموظف طلب العمل عن بعد بعد إكمال ٩٠ يومًا على الأقل من العمل.";
  assert.deepEqual(outcomes("هل ٣٠ يوم كفاية؟", remote), [false]);
  assert.deepEqual(outcomes("can i اشتغل remote بعد 90 يوم؟", remote), [true]);
  assert.deepEqual(outcomes("أنا شغال بقالى ١٢٠ يوم، ينفع أطلب العمل عن بعد؟", remote), [true]);

  const purchaseOrder = "يلزم Purchase Order للمشتريات التي تزيد عن ١٠٠٠ دولار.";
  assert.deepEqual(outcomes("لو قيمة الشراء ١٠٠٠ دولار بالظبط، لازم PO؟", purchaseOrder), [false]);

  const maximum = "لا يجوز العمل عن بعد لأكثر من يومين في الأسبوع. بحد أقصى ٢ يوم.";
  assert.deepEqual(outcomes("هل ٣ أيام مسموحة؟", maximum), [false]);
});

test("preserves explicit signs and excludes dates and hyphenated identifiers", () => {
  assert.deepEqual(
    extractNumericMentions("-5 USD, USD -2.5, +5 days, and -2.5%").map(({ value, unit }) => ({ value, unit })),
    [
      { value: -5, unit: "currency:usd" },
      { value: -2.5, unit: "currency:usd" },
      { value: 5, unit: "duration:day" },
      { value: -2.5, unit: "percentage" },
    ],
  );
  assert.deepEqual(extractNumericMentions("2025-01-01 and CASE-123-A"), []);
});

test("evaluates signed thresholds without losing or inverting the sign", () => {
  const balance = "A balance below -5 USD is blocked.";
  assert.deepEqual(outcomes("Is -10 USD blocked?", balance), [true]);
  assert.deepEqual(outcomes("Is -5 USD blocked?", balance), [false]);
  assert.deepEqual(outcomes("Is -2 USD blocked?", balance), [false]);

  const temperature = "Temperature must remain above -10 degrees.";
  assert.deepEqual(outcomes("Is -5 degrees acceptable?", temperature), [true]);
  assert.deepEqual(outcomes("Is +10 degrees acceptable?", "Temperature must remain above +10 degrees."), [false]);
});

test("compares compatible count units conservatively", () => {
  const evidence = "At most 5 written vendor quotations are allowed.";
  assert.deepEqual(outcomes("Are 4 vendor quotations allowed?", evidence), [true]);
  assert.deepEqual(outcomes("Are 6 vendor quotations allowed?", evidence), [false]);
  assert.deepEqual(outcomes("Are 6 login attempts allowed?", evidence), []);
});

test("allows only question-sourced values with an explicit compatible threshold", () => {
  assert.equal(hasNumericConsistencyViolation({
    claimText: "At 120 days, the employee satisfies the 90-day minimum.",
    questionText: "Can an employee with 120 days request remote work?",
    evidenceText: "Employees with at least 90 days may request remote work.",
  }), false);
  assert.equal(hasNumericConsistencyViolation({
    claimText: "At 120 hours, the employee satisfies the 90-day minimum.",
    questionText: "Can an employee with 120 hours request remote work?",
    evidenceText: "Employees with at least 90 days may request remote work.",
  }), true);
  assert.equal(hasNumericConsistencyViolation({
    claimText: "The account locks for 20 minutes after 5 failed attempts.",
    questionText: "Does it lock for 20 minutes after 5 failed attempts?",
    evidenceText: "After 5 failed attempts, the account locks for 30 minutes.",
  }), true);
  assert.equal(hasNumericConsistencyViolation({
    claimText: "The account locks for 20 minutes after 5 failed attempts.",
    questionText: "Does it lock for 20 minutes after 5 failed attempts?",
    evidenceText: "The account locks for 30 minutes. Retrying is allowed after at least 10 minutes.",
  }), true);
});
