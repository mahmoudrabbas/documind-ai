import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContextualFollowUpQuestion,
  isLikelyContextualFollowUp,
} from "./intentQuery.knowledgeSignals.js";

test("contextual follow-up detector accepts short Arabic elliptical approval questions", () => {
  assert.equal(isLikelyContextualFollowUp("طيب وموافقة مين؟"), true);
  assert.equal(isLikelyContextualFollowUp("ومين لازم يوافق؟"), true);
});

test("contextual follow-up detector accepts English anaphoric continuations", () => {
  assert.equal(isLikelyContextualFollowUp("Whose approval?"), true);
  assert.equal(isLikelyContextualFollowUp("What if I need to access internal systems while doing that?"), true);
  assert.match(
    buildContextualFollowUpQuestion("Can I work remotely two days per week?", "Whose approval?"),
    /work remotely.*Whose approval/i,
  );
});
