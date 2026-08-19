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

test("keeps the remote-work and receipt threshold regression matrix deterministic", () => {
  const remote = "Employees who have completed at least 90 days of employment may request a regular remote-work arrangement.";
  const remoteCases = [
    ["هل الموظف اللي اشتغل ٣٠ يوم يقدر يطلب العمل عن بعد؟", false],
    ["لو الموظف كمل ٩٠ يوم بالظبط، ينفع يطلب العمل عن بعد؟", true],
    ["لو الموظف كمل ١٢٠ يوم، ينفع يطلب العمل عن بعد؟", true],
    ["هل الموظف اللي اشتغل 30 يوم يقدر يطلب العمل عن بعد؟", false],
    ["لو الموظف كمل 90 يوم بالظبط، ينفع يطلب العمل عن بعد؟", true],
    ["لو الموظف كمل 120 يوم، ينفع يطلب العمل عن بعد؟", true],
    ["Can an employee who has worked for 30 days request regular remote work?", false],
    ["Can an employee who has worked for 90 days request regular remote work?", true],
    ["Can an employee who has worked for 120 days request regular remote work?", true],
  ] as const;
  for (const [question, expected] of remoteCases) {
    assert.deepEqual(outcomes(question, remote), [expected], question);
  }

  const receipts = "Receipts are required for expenses above USD 25.";
  assert.deepEqual(outcomes("لو المصروف ٢٠ دولار، لازم أقدم إيصال؟", receipts), [false]);
  assert.deepEqual(outcomes("لو المصروف ٣٠ دولار، لازم أقدم إيصال؟", receipts), [true]);
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

test("normalizes Unicode hyphen and dash variants to equivalent numeric semantics", () => {
  const plain = "Unused annual leave above the 10-day carry-over limit expires on 31 December.";
  const nonBreaking = "Unused annual leave above the 10\u2011day carry\u2011over limit expires on 31 December.";
  const enDash = "Unused annual leave above the 10\u2013day carry\u2013over limit expires on 31 December.";
  const minus = "Unused annual leave above the 10\u2212day carry\u2212over limit expires on 31 December.";
  const expected = [
    { value: 10, unit: "duration:day" },
    { value: 31, unit: "count:december" },
  ];
  for (const variant of [plain, nonBreaking, enDash, minus]) {
    assert.deepEqual(
      extractNumericMentions(variant).map(({ value, unit }) => ({ value, unit })),
      expected,
    );
  }
  assert.equal(
    normalizeNumericText(nonBreaking),
    normalizeNumericText(plain),
    "normalized text must be identical across hyphen variants",
  );
});

test("U+2011 non-breaking hyphen does not create a false numeric contradiction", () => {
  const evidence = "Unused annual leave may be carried over into the next calendar year up to a maximum of 10 days. Unused annual leave above the 10-day carry-over limit expires on 31 December.";
  assert.equal(hasNumericConsistencyViolation({
    claimText: "Unused annual leave that exceeds the 10\u2011day carry\u2011over limit expires on 31 December.",
    questionText: "When does unused annual leave that exceeds 10 days expire?",
    evidenceText: evidence,
  }), false);
});

test("HR-style statement with 10-day limit and 31 December does not trigger a false violation", () => {
  const evidence = "Unused annual leave may be carried over into the next calendar year up to a maximum of 10 days. Unused annual leave above the 10-day carry-over limit expires on 31 December.";
  assert.equal(hasNumericConsistencyViolation({
    claimText: "Any unused annual leave beyond the 10\u2011day carry\u2011over limit expires on 31 December.",
    questionText: "What happens to unused annual leave that exceeds the 10-day carry-over limit?",
    evidenceText: evidence,
  }), false);
});

test("bounded temporal-unit modifiers bind the number to the day unit", () => {
  assert.deepEqual(
    extractNumericMentions("The current policy allows up to 2 remote days per week.").map(({ value, unit }) => ({ value, unit })),
    [{ value: 2, unit: "duration:day" }],
  );
  assert.deepEqual(
    extractNumericMentions("The superseded policy allowed up to 3 remote days per week.").map(({ value, unit }) => ({ value, unit })),
    [{ value: 3, unit: "duration:day" }],
  );
  assert.deepEqual(
    extractNumericMentions("5 business days, 10 calendar days, and 3 working days.").map(({ value, unit }) => ({ value, unit })),
    [
      { value: 5, unit: "duration:day" },
      { value: 10, unit: "duration:day" },
      { value: 3, unit: "duration:day" },
    ],
  );
  assert.deepEqual(
    extractNumericMentions("5 written vendor quotations are allowed.").map(({ value, unit }) => ({ value, unit })),
    [{ value: 5, unit: "count:quotation" }],
    "non-temporal modifiers must not be treated as day units",
  );
});

test("supported comparison claim with remote-day bounds is not a numeric contradiction", () => {
  const claim = "The current policy allows up to 2 remote days per week, while the superseded policy allowed up to 3 remote days per week.";
  const evidence = [
    "Eligible employees may work remotely up to 2 days per week.",
    "This old version allowed remote work up to 3 days per week.",
  ].join(" ");
  assert.equal(hasNumericConsistencyViolation({
    claimText: claim,
    questionText: "How many remote days per week are allowed in the current Remote Work Policy compared to the superseded Remote Work Policy?",
    evidenceText: evidence,
  }), false);
});

test("higher remote-day bound remains a genuine numeric contradiction", () => {
  assert.equal(hasNumericConsistencyViolation({
    claimText: "The current policy allows up to 4 remote days per week.",
    questionText: "How many remote days per week are allowed?",
    evidenceText: "Eligible employees may work remotely up to 2 days per week.",
  }), true);
});

test("hours and days remain different quantities despite equal values", () => {
  assert.equal(hasNumericConsistencyViolation({
    claimText: "Employees may work 2 hours per week.",
    questionText: "How many hours of remote work are allowed?",
    evidenceText: "Employees may work 2 days per week.",
  }), true);
});

test("detects genuine numeric contradictions after hyphen normalization", () => {
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
    claimText: "Leave beyond the 10\u2011day limit expires on 31 December.",
    questionText: "Does leave beyond 10 days expire?",
    evidenceText: "Leave beyond the 5-day limit expires on 31 December.",
  }), true);
});

// \u2500\u2500 metric scope: a shared unit is not a shared quantity \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

test("a recurrence rate is never compared against an absolute quantity", () => {
  const tenure =
    "Employees who have completed at least 90 days of continuous employment may request a regular remote-work arrangement.";
  const weeklyLimit = "Regular remote work is limited to a maximum of two days per week.";

  // "two days per week" is a weekly allowance, not tenure. Comparing it to the
  // 90-day minimum reports 2 >= 90 -> false, which reads downstream as a
  // documented eligibility failure the evidence never states.
  assert.deepEqual(deriveThresholdComparisons("Can I work remotely two days per week?", tenure), []);
  // ...and the tenure value is likewise not a weekly allowance.
  assert.deepEqual(
    deriveThresholdComparisons("I have worked here for 30 days. Can I work remotely?", weeklyLimit),
    [],
  );

  // Each value still reaches the rule that measures the same thing.
  assert.deepEqual(
    deriveThresholdComparisons("Can I work remotely two days per week?", weeklyLimit),
    [{ questionValue: 2, thresholdValue: 2, unit: "duration:day", operator: "lte", satisfied: true }],
  );
  assert.deepEqual(
    deriveThresholdComparisons("I have worked here for 30 days. Can I work remotely two days per week?", tenure),
    [{ questionValue: 30, thresholdValue: 90, unit: "duration:day", operator: "gte", satisfied: false }],
  );
});

test("rates compare only against the same period", () => {
  const weekly = "Employees may work remotely up to 2 days per week.";
  assert.deepEqual(outcomes("Can I work 3 days per week?", weekly), [false]);
  assert.deepEqual(outcomes("Can I work 1 day per week?", weekly), [true]);
  assert.deepEqual(outcomes("Can I work 3 days per month?", weekly), []);
  assert.deepEqual(outcomes("Can I take 3 days off?", weekly), []);
});

test("equivalent rate spellings resolve to one period", () => {
  const weekly = "Remote work is limited to a maximum of 2 days per week.";
  for (const question of [
    "Can I work 3 days per week?",
    "Can I work 3 days each week?",
    "Can I work 3 days every week?",
    "Can I work 3 days/week?",
    "Can I work 3 days weekly?",
  ]) {
    assert.deepEqual(outcomes(question, weekly), [false], question);
  }
  assert.deepEqual(
    outcomes("\u064a\u0646\u0641\u0639 \u0627\u0634\u062a\u063a\u0644 \u0663 \u0627\u064a\u0627\u0645 \u0641\u064a \u0627\u0644\u0627\u0633\u0628\u0648\u0639\u061f", "\u0627\u0644\u0639\u0645\u0644 \u0639\u0646 \u0628\u0639\u062f \u0628\u062d\u062f \u0627\u0642\u0635\u064a \u0662 \u064a\u0648\u0645 \u0641\u064a \u0627\u0644\u0627\u0633\u0628\u0648\u0639."),
    [false],
  );
});

test("an unrecognized period noun reads as absolute rather than blocking comparison", () => {
  // Only known periods disambiguate; "per receipt" is not a recurrence period,
  // so the existing currency comparison must keep working.
  assert.deepEqual(
    outcomes("Are receipts required for $30 per receipt?", "Receipts are required above USD 25 per receipt."),
    [true],
  );
});
