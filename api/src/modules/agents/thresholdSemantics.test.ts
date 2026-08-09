import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveThresholdComparisons,
  deriveThresholdDecisions,
  extractThresholdRules,
  hasNumericConsistencyViolation,
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
