import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  areEquivalentEvidenceAssertions,
  detectConflicts,
  MAX_CONFLICT_ITEMS,
} from "./conflictDetector.js";

function item(
  text: string,
  overrides: Partial<{
    documentId: string;
    documentVersionId: string;
    tenantId: string;
  }> = {},
) {
  return {
    text,
    documentId: overrides.documentId ?? "doc-a",
    documentVersionId: overrides.documentVersionId ?? "version-a",
    tenantId: overrides.tenantId ?? "tenant-a",
  };
}

describe("conflictDetector — subject/metric alignment", () => {
  it("does not conflict hotel and meal monetary limits in the same document", () => {
    const conflicts = detectConflicts([
      item("Hotel maximum: USD 180 per night."),
      item("Meal maximum: USD 60 per day."),
    ], undefined, "What is the hotel limit?");
    assert.deepEqual(conflicts, []);
  });

  it("does not conflict P1 response and P1 restoration durations", () => {
    const conflicts = detectConflicts([
      item("P1 response time is 15 minutes."),
      item("P1 restoration time is 4 hours."),
    ], undefined, "What is the P1 response time?");
    assert.deepEqual(conflicts, []);
  });

  it("does not conflict receipt threshold and hotel limit", () => {
    const conflicts = detectConflicts([
      item("Receipts are required above USD 25."),
      item("Hotel maximum is USD 180 per night."),
    ], undefined, "What is the hotel limit?");
    assert.deepEqual(conflicts, []);
  });

  it("does not conflict remote employment eligibility and weekly remote maximum", () => {
    const conflicts = detectConflicts([
      item("Remote-work eligibility requires at least 90 days of employment."),
      item("Remote work is allowed up to 2 days per week."),
    ], undefined, "How many remote work days are allowed each week?");
    assert.deepEqual(conflicts, []);
  });

  it("does not conflict P1 and P2 response targets", () => {
    const conflicts = detectConflicts([
      item("P1 response time is 15 minutes."),
      item("P2 response time is 30 minutes."),
    ], undefined, "What are the P1 and P2 response targets?");
    assert.deepEqual(conflicts, []);
  });

  it("does not conflict adjacent purchase approval ranges", () => {
    const conflicts = detectConflicts([
      item("Purchases up to USD 500 require manager approval."),
      item("Purchases above USD 500 and up to USD 5,000 require department-head approval."),
    ], undefined, "What approval is required for a purchase?");
    assert.deepEqual(conflicts, []);
  });

  it("does not conflict compatible claims from different policy domains", () => {
    const conflicts = detectConflicts([
      item("International travel requires department-head approval.", { documentId: "travel" }),
      item("Remote access requires the corporate VPN.", { documentId: "it" }),
    ], undefined, "What do I need for international travel and remote access?");
    assert.deepEqual(conflicts, []);
  });

  it("does not let an unrelated conflicting metric poison the current question", () => {
    const conflicts = detectConflicts([
      item("Hotel maximum is USD 180 per night.", { documentId: "travel-a" }),
      item("Hotel maximum is USD 250 per night.", { documentId: "travel-b" }),
      item("Meal maximum is USD 60 per day.", { documentId: "expenses" }),
    ], undefined, "What is the meal limit?");
    assert.deepEqual(conflicts, []);
  });
});

describe("conflictDetector — genuine conflicts", () => {
  const cases = [
    {
      name: "hotel maximum",
      question: "What is the hotel maximum?",
      first: "Hotel maximum is USD 180 per night.",
      second: "Hotel maximum is USD 250 per night.",
    },
    {
      name: "P1 response",
      question: "What is the P1 response time?",
      first: "P1 response time is 15 minutes.",
      second: "P1 response time is 30 minutes.",
    },
    {
      name: "remote weekly maximum",
      question: "How many remote work days are allowed?",
      first: "Remote work is allowed 1 day per week.",
      second: "Remote work is allowed 2 days per week.",
    },
    {
      name: "quotation threshold",
      question: "When are three vendor quotations required?",
      first: "Three vendor quotations are required above USD 2,000.",
      second: "Three vendor quotations are required above USD 3,000.",
    },
    {
      name: "employment eligibility threshold",
      question: "When is an employee eligible for remote work?",
      first: "Employees are eligible for remote work after at least 90 days of employment.",
      second: "Employees are eligible for remote work after at least 120 days of employment.",
    },
    {
      name: "remote maximum threshold",
      question: "What is the maximum remote work allowance?",
      first: "Remote work is allowed up to 2 days per week.",
      second: "Remote work is allowed up to 3 days per week.",
    },
  ];

  for (const scenario of cases) {
    it(`detects unresolved ${scenario.name} conflict across documents`, () => {
      const conflicts = detectConflicts([
        item(scenario.first, { documentId: "doc-a", documentVersionId: "v1" }),
        item(scenario.second, { documentId: "doc-b", documentVersionId: "v2" }),
      ], undefined, scenario.question);
      assert.equal(conflicts.length, 1);
      assert.deepEqual(conflicts[0]?.itemIndices, [0, 1]);
      assert.match(conflicts[0]?.description ?? "", /Unresolved conflict group/u);
    });
  }

  it("detects same-document aligned value conflicts", () => {
    const conflicts = detectConflicts([
      item("Hotel maximum is USD 180 per night."),
      item("Hotel maximum is USD 250 per night.", { documentVersionId: "version-b" }),
    ], undefined, "What is the hotel maximum?");
    assert.equal(conflicts.length, 1);
  });

  it("never compares explicitly different tenants", () => {
    const conflicts = detectConflicts([
      item("Hotel maximum is USD 180 per night.", { tenantId: "tenant-a" }),
      item("Hotel maximum is USD 250 per night.", { tenantId: "tenant-b" }),
    ], undefined, "What is the hotel maximum?");
    assert.deepEqual(conflicts, []);
  });
});

describe("conflictDetector — duplicate/version handling and bounds", () => {
  it("treats exact identical assertions across versions as consistent", () => {
    const text = "Manager approval is required.";
    assert.deepEqual(detectConflicts([
      item(text, { documentVersionId: "version-a" }),
      item(text, { documentVersionId: "version-b" }),
    ], undefined, "Is manager approval required?"), []);
  });

  it("treats normalized whitespace and punctuation variants as equivalent", () => {
    assert.equal(
      areEquivalentEvidenceAssertions(
        "Manager approval is required.",
        "  Manager   approval is required!!! ",
      ),
      true,
    );
    assert.deepEqual(detectConflicts([
      item("Manager approval is required.", { documentVersionId: "version-a" }),
      item("  Manager   approval is required!!! ", { documentVersionId: "version-b" }),
    ], undefined, "Is manager approval required?"), []);
  });

  it("does not infer conflict solely from different versions and paraphrased text", () => {
    assert.deepEqual(detectConflicts([
      item("Employees may work remotely up to two days per week.", { documentVersionId: "version-a" }),
      item("Remote work is allowed for a maximum of 2 days each week.", { documentVersionId: "version-b" }),
    ], undefined, "How many remote days are allowed?"), []);
  });

  it("bounds item comparisons to the authorized candidate limit", () => {
    const items = Array.from({ length: MAX_CONFLICT_ITEMS + 5 }, (_unused, index) =>
      item(`Unrelated statement ${index}.`, { documentId: `doc-${index}` }),
    );
    assert.deepEqual(detectConflicts(items, undefined, "What is documented?"), []);
  });
});
