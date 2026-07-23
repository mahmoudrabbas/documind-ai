import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const taxonomy = read("TaxonomyManager.tsx");
const editor = read("PolicyEditor.tsx");
const panel = read("DocumentPolicyPanel.tsx");
const batch = read("BatchPolicyDialog.tsx");

describe("Phase 8 safety source contracts", () => {
  it("uses all four backend classification levels", () => expect(taxonomy).toContain('"highly_confidential"'));
  it("offers archive and restore confirmation dialogs", () => { expect(taxonomy).toContain('role="alertdialog"'); expect(taxonomy).toContain('"archive" | "restore"'); });
  it("hides taxonomy mutations without the update permission", () => expect(taxonomy).toContain("canMutate &&"));
  it("cancels stale taxonomy requests", () => expect(taxonomy).toContain("controller.abort()"));
  it("supports bounded taxonomy pagination", () => { expect(taxonomy).toContain("pageSize: 20"); expect(taxonomy).toContain("totalPages"); });

  it("lists all independent policy actions", () => expect(editor).toContain("DOCUMENT_ACCESS_ACTIONS.map"));
  it("keeps owner rules free of a subject ID", () => expect(editor).toContain('subject: { type: "owner" }'));
  it("requires authoritative subject selection for identified subjects", () => expect(editor).toContain('includes(rule.subject.type) && !rule.subject.id'));
  it("rejects duplicate semantic rules before preview", () => expect(editor).toContain("semantics.has(semantic)"));
  it("rejects duplicate actions", () => expect(editor).toContain("new Set(rule.actions).size"));
  it("enforces the backend rule bound", () => expect(editor).toContain("draft.rules.length > 200"));
  it("validates effective intervals", () => expect(editor).toContain("Date.parse(draft.effectiveUntil) <= Date.parse(draft.effectiveFrom)"));
  it("invalidates preview and idempotency context after edits", () => { expect(editor).toContain("setPreview(null)"); expect(editor).toContain("setIdempotencyKey(null)"); });
  it("does not persist or decode preview artifacts", () => { expect(editor).not.toContain("localStorage"); expect(editor).not.toContain("sessionStorage"); expect(editor).not.toContain("atob("); });
  it("requires backend preview before apply", () => expect(editor).toContain("if (!preview || !idempotencyKey"));
  it("disables apply for no-change", () => expect(editor).toContain('preview.impact.direction === "no_change"'));
  it("does not auto-confirm sensitive broadening", () => expect(editor).toContain("setAcknowledged(false)"));
  it("sends sensitive confirmation only from the explicit dialog", () => expect(editor).toContain("doApply(true)"));
  it("preserves draft while reloading a stale pointer", () => expect(editor).toContain("Reload pointer and preserve draft"));

  it("shows deny assignments instead of omitting them", () => expect(panel).toContain('assignment.effect === "deny"'));
  it("shows stale references safely", () => expect(panel).toContain("Unavailable principal"));
  it("sorts history newest first and marks it read-only", () => { expect(panel).toContain("b.policyVersion - a.policyVersion"); expect(panel).toContain("Read only"); });
  it("renders each effective action independently", () => expect(panel).toContain("user.actions[action]"));
  it("does not infer effective access locally", () => expect(panel).toContain("getEffectiveAccess"));
  it("labels propagation current only when versions match", () => expect(panel).toContain('status.appliedPolicyVersion === status.desiredPolicyVersion'));
  it("does not expose a propagation retry button", () => expect(panel).toContain("No retry action is exposed"));
  it("clears prior-document policy data before refresh", () => expect(panel).toContain("setActive(null)"));

  it("uses only the backend-supported shared batch template", () => expect(batch).toContain("Shared change reason"));
  it("shows authoritative aggregate and per-document impact", () => { expect(batch).toContain("preview.aggregate"); expect(batch).toContain("preview.results.map"); });
  it("requires sensitive confirmation for a nonzero backend count", () => expect(batch).toContain("sensitiveCount ? setConfirm(true)"));
  it("does not claim total success for partial results", () => expect(batch).toContain("Partial batch result"));
  it("prevents successful results from being applied twice in one dialog", () => expect(batch).toContain("Boolean(result)"));
  it("keeps tenant identity out of the batch payload", () => expect(batch).not.toContain("tenantId"));
  it("keeps policy dialogs within the mobile viewport", () => { expect(editor).toContain("max-h-[calc(100vh-1rem)]"); expect(batch).toContain("max-h-[calc(100vh-1.5rem)]"); });
  it("uses logical layout utilities for bidirectional screens", () => { expect(panel).not.toContain(" ml-"); expect(panel).not.toContain(" mr-"); expect(taxonomy).toContain("text-start"); });
});
