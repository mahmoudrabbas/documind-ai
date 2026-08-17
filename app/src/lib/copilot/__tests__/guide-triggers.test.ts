import { describe, it, expect } from "vitest";
import {
  createInitialTriggerState,
  dismissTrigger,
  evaluateTrigger,
  getTriggerRule,
  GUIDE_TRIGGER_RULES,
  resetGuideTriggers,
  subscribeGuideTriggers,
  emitGuideTrigger,
  dismissGuideTrigger,
} from "@/lib/copilot/guide-triggers";

describe("guide triggers", () => {
  it("defines a rule for every supported event", () => {
    const ids = GUIDE_TRIGGER_RULES.map((rule) => rule.event);
    expect(new Set(ids).size).toBe(ids.length);
    for (const event of ["documents.search_zero_results", "documents.upload_failed"]) {
      expect(getTriggerRule(event as never)).toBeDefined();
    }
  });

  it("emits a suggestion on first fire", () => {
    const state = createInitialTriggerState();
    const { state: next, suggestion } = evaluateTrigger(
      state,
      "documents.search_zero_results",
      1_000,
    );
    expect(suggestion).toEqual({
      event: "documents.search_zero_results",
      flowId: "documents.search",
    });
    expect(next.fired).toEqual(["documents.search_zero_results"]);
    expect(next.lastEmittedAt["documents.search_zero_results"]).toBe(1_000);
  });

  it("honours oncePerSession within the same session", () => {
    const first = evaluateTrigger(
      createInitialTriggerState(),
      "documents.upload_failed",
      1_000,
    );
    const second = evaluateTrigger(first.state, "documents.upload_failed", 5_000);
    expect(second.suggestion).toBeNull();
    expect(second.state.fired).toHaveLength(1);
  });

  it("suppresses a dismissed event for the session", () => {
    const dismissed = dismissTrigger(
      createInitialTriggerState(),
      "documents.upload_failed",
    );
    const { suggestion } = evaluateTrigger(dismissed, "documents.upload_failed", 1_000);
    expect(suggestion).toBeNull();
  });

  it("rejects unknown events silently", () => {
    const state = createInitialTriggerState();
    const { state: next, suggestion } = evaluateTrigger(state, "bogus" as never, 1_000);
    expect(suggestion).toBeNull();
    expect(next).toBe(state);
  });

  it("fans suggestions out to subscribers and clears on reset", () => {
    resetGuideTriggers();
    const seen: string[] = [];
    subscribeGuideTriggers((suggestion) => seen.push(suggestion.event));

    emitGuideTrigger("documents.search_zero_results");
    emitGuideTrigger("documents.search_zero_results");
    emitGuideTrigger("documents.upload_failed");
    dismissGuideTrigger("documents.upload_failed");
    emitGuideTrigger("documents.upload_failed");

    expect(seen).toEqual([
      "documents.search_zero_results",
      "documents.upload_failed",
    ]);

    resetGuideTriggers();
    const after: string[] = [];
    subscribeGuideTriggers((suggestion) => after.push(suggestion.event));
    emitGuideTrigger("documents.upload_failed");
    expect(after).toEqual(["documents.upload_failed"]);
  });
});
