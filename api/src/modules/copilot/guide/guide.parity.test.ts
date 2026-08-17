import test from "node:test";
import assert from "node:assert/strict";
import { getAllGuideFlows } from "./guideFlows.js";
import { createGuideTargetRegistry } from "./guideTargets.js";
import { validateGuideI18nKeys } from "./guide.i18n.js";
import { GUIDE_SECTIONS } from "./guideSections.js";

test("Guide flow parity", async (t) => {
  await t.test(
    "every flow step targetId exists in the guide target registry",
    () => {
      const registry = createGuideTargetRegistry();
      const missing: string[] = [];
      for (const flow of getAllGuideFlows()) {
        for (const step of flow.steps) {
          if (!registry.has(step.target.targetId)) {
            missing.push(`${flow.flowId} -> ${step.stepId} -> ${step.target.targetId}`);
          }
        }
      }
      assert.deepEqual(missing, []);
    },
  );

  await t.test(
    "every flow titleKey, step titleKey, and instructionKey resolves to a translation",
    () => {
      const { valid, missing } = validateGuideI18nKeys();
      assert.equal(
        valid,
        true,
        `Missing guide i18n keys: ${missing.join(", ")}`,
      );
    },
  );

  await t.test("flow ids and step orders are unique and sequential", () => {
    const flowIds = new Set<string>();
    for (const flow of getAllGuideFlows()) {
      assert.ok(!flowIds.has(flow.flowId), `Duplicate flow id ${flow.flowId}`);
      flowIds.add(flow.flowId);

      const stepIds = new Set<string>();
      const orders = flow.steps.map((s) => s.order);
      for (const step of flow.steps) {
        assert.ok(
          !stepIds.has(step.stepId),
          `Duplicate stepId ${step.stepId} in ${flow.flowId}`,
        );
        stepIds.add(step.stepId);
      }
      assert.deepEqual(
        orders,
        Array.from({ length: orders.length }, (_, i) => i + 1),
        `${flow.flowId} step orders must be sequential`,
      );
    }
  });

  await t.test("every section navTargetId exists and matches its route", () => {
    const registry = createGuideTargetRegistry();
    const problems: string[] = [];
    for (const section of GUIDE_SECTIONS) {
      const target = registry.get(section.navTargetId);
      if (!target) {
        problems.push(`${section.sectionId} -> unknown target ${section.navTargetId}`);
        continue;
      }
      if (target.route !== section.route) {
        problems.push(
          `${section.sectionId} -> ${section.navTargetId} route mismatch (${target.route} vs ${section.route})`,
        );
      }
    }
    assert.deepEqual(problems, []);
  });

  await t.test("every section pageTargetId exists and matches its route", () => {
    const registry = createGuideTargetRegistry();
    const problems: string[] = [];
    for (const section of GUIDE_SECTIONS) {
      if (!section.pageTargetId) continue;
      const target = registry.get(section.pageTargetId);
      if (!target) {
        problems.push(
          `${section.sectionId} -> unknown target ${section.pageTargetId}`,
        );
        continue;
      }
      if (target.route !== section.route) {
        problems.push(
          `${section.sectionId} -> ${section.pageTargetId} route mismatch (${target.route} vs ${section.route})`,
        );
      }
    }
    assert.deepEqual(problems, []);
  });

  await t.test("navigate guides rely on a registered shared content target", () => {
    assert.ok(
      createGuideTargetRegistry().has("section-content"),
      "section-content must be registered for generic navigation guides",
    );
  });
});
