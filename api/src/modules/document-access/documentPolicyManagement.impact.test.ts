import assert from "node:assert/strict";
import test from "node:test";
import { aggregateBatchImpact, classifyPolicyImpact, emptyActionImpact, requiresSensitiveBroadeningConfirmation } from "./documentPolicyManagement.impact.js";

test("classifies exact effective gains and losses", () => {
  const impact = emptyActionImpact(); assert.equal(classifyPolicyImpact(impact), "no_change");
  impact.read.gained = 2; assert.equal(classifyPolicyImpact(impact), "broadening");
  impact.download.lost = 1; assert.equal(classifyPolicyImpact(impact), "mixed");
  impact.read.gained = 0; assert.equal(classifyPolicyImpact(impact), "tightening");
});

test("sensitive confirmation is authoritative and gain-specific", () => {
  const impact = emptyActionImpact(); impact.use_in_ai.gained = 1;
  assert.equal(requiresSensitiveBroadeningConfirmation("confidential", impact), true);
  assert.equal(requiresSensitiveBroadeningConfirmation("highly_confidential", impact), true);
  assert.equal(requiresSensitiveBroadeningConfirmation("restricted", impact), false);
  impact.use_in_ai.gained = 0; impact.read.lost = 1;
  assert.equal(requiresSensitiveBroadeningConfirmation("confidential", impact), false);
});

test("batch aggregation produces exact deterministic totals", () => {
  const first = emptyActionImpact(); first.read.gained = 2;
  const second = emptyActionImpact(); second.download.lost = 3;
  const aggregate = aggregateBatchImpact([
    { direction: "broadening", usersGainingAny: 2, usersLosingAny: 0, sensitiveConfirmationRequired: true, byAction: first },
    { direction: "tightening", usersGainingAny: 0, usersLosingAny: 3, sensitiveConfirmationRequired: false, byAction: second },
  ]);
  assert.equal(aggregate.broadeningCount, 1); assert.equal(aggregate.tighteningCount, 1);
  assert.equal(aggregate.usersGainingAccess, 2); assert.equal(aggregate.usersLosingAccess, 3);
  assert.deepEqual(aggregate.byAction.read, { gained: 2, lost: 0 });
});
