import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluationFixtures } from "./evaluation.fixtures.js";

describe("Evaluation dataset validation", () => {
  it("has all required fields for each fixture", () => {
    for (const fixture of evaluationFixtures) {
      assert.ok(fixture.id, `Fixture ${fixture.id} missing id`);
      assert.ok(fixture.question, `Fixture ${fixture.id} missing question`);
      assert.ok(fixture.language, `Fixture ${fixture.id} missing language`);
      assert.ok(fixture.evidenceBundle, `Fixture ${fixture.id} missing evidenceBundle`);
      assert.ok(fixture.expectedOutcome, `Fixture ${fixture.id} missing expectedOutcome`);
      assert.ok(fixture.description, `Fixture ${fixture.id} missing description`);
      assert.ok(Array.isArray(fixture.tags), `Fixture ${fixture.id} tags should be array`);
    }
  });

  it("has unique fixture IDs", () => {
    const ids = evaluationFixtures.map((f) => f.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, "Fixture IDs should be unique");
  });

  it("has balanced outcome distribution", () => {
    const outcomes = evaluationFixtures.map((f) => f.expectedOutcome);
    const approved = outcomes.filter((o) => o === "approved").length;
    const refused = outcomes.filter((o) => o === "refused").length;
    const conflict = outcomes.filter((o) => o === "conflict").length;

    assert.ok(approved >= 3, "Should have at least 3 approved fixtures");
    assert.ok(refused >= 3, "Should have at least 3 refused fixtures");
    assert.ok(conflict >= 1, "Should have at least 1 conflict fixture");
  });

  it("has all three language types", () => {
    const languages = evaluationFixtures.map((f) => f.language);
    assert.ok(languages.includes("en"), "Should have English fixtures");
    assert.ok(languages.includes("ar"), "Should have Arabic fixtures");
    assert.ok(languages.includes("mixed"), "Should have mixed language fixtures");
  });

  it("evidence bundles have sufficient structure", () => {
    for (const fixture of evaluationFixtures) {
      assert.ok(fixture.evidenceBundle.items, `${fixture.id}: missing items`);
      assert.ok(fixture.evidenceBundle.sufficiency, `${fixture.id}: missing sufficiency`);
      assert.ok(
        ["SUFFICIENT", "WEAK", "NO_EVIDENCE", "CONFLICTING"].includes(
          fixture.evidenceBundle.sufficiency.level,
        ),
        `${fixture.id}: invalid sufficiency level`,
      );
    }
  });

  it("tags cover expected categories", () => {
    const allTags = evaluationFixtures.flatMap((f) => f.tags);
    assert.ok(allTags.some((t) => t.includes("english")), "Should have english tag");
    assert.ok(allTags.some((t) => t.includes("arabic")), "Should have arabic tag");
    assert.ok(allTags.some((t) => t.includes("injection")), "Should have injection tag");
    assert.ok(allTags.some((t) => t.includes("refusal")), "Should have refusal tag");
  });
});
