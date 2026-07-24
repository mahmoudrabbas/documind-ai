import { describe, expect, it, vi } from "vitest";
import { attachPolicyPreview, editPolicyDraft, type PolicyDraftState } from "./document-policy-state";
import type { PolicyDraft, PolicyPreview } from "@/types/api/document-policy.types";

const draft: PolicyDraft = { rules: [], inherits: null, effectiveFrom: null, effectiveUntil: null, reason: null };
const preview = { documentId: "d", currentPolicyId: "p", currentPolicyVersion: 1, proposedPolicyVersion: 2, normalizedSummary: { ruleCount: 0, allowRuleCount: 0, denyRuleCount: 0, inherits: null, effectiveFrom: "2026-07-23T00:00:00.000Z", effectiveUntil: null, reason: null }, impact: { direction: "no_change", byAction: {}, usersGainingAny: 0, usersLosingAny: 0, ruleDelta: { added: 0, removed: 0 }, sensitiveBroadening: false }, sensitiveConfirmationRequired: false, previewToken: "opaque", previewExpiresAt: "2026-07-23T01:00:00.000Z", previewFingerprint: "fingerprint" } as PolicyPreview;

describe("policy draft state", () => {
  it("editing invalidates the preview artifact and idempotency identity", () => {
    const initial = attachPolicyPreview({ draft, preview: null, idempotencyKey: null, dirty: false }, preview, "key");
    expect(editPolicyDraft(initial, { ...draft, reason: "changed" })).toMatchObject({ preview: null, idempotencyKey: null, dirty: true });
  });

  it("never writes opaque artifacts to browser storage", () => {
    const setItem = vi.fn(); vi.stubGlobal("localStorage", { setItem });
    const state: PolicyDraftState = attachPolicyPreview({ draft, preview: null, idempotencyKey: null, dirty: false }, preview, "key");
    expect(state.preview?.previewToken).toBe("opaque"); expect(setItem).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
});
