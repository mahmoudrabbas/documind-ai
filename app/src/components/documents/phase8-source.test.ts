import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const taxonomy = read("TaxonomyManager.tsx");
const editor = read("PolicyEditor.tsx");
const panel = read("DocumentPolicyPanel.tsx");
const batch = read("BatchPolicyDialog.tsx");
const policyService = read("../../services/document-policy.service.ts");

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
  it("loads policy editor options from a scoped document endpoint", () => { expect(editor).toContain("getPolicyEditorOptions(documentId"); });
  it("loads documentOwnerId from editor options for owner-rule enforcement", () => { expect(editor).toContain("documentOwnerId"); expect(editor).toContain("result.data.documentOwnerId"); });
  it("loads only active options via the backend-scoped endpoint", () => expect(policyService).toContain("policy-editor/options"));
  it("does not call general admin endpoints for users, roles, or taxonomy", () => { expect(editor).not.toContain('from "@/services/users.service"'); expect(editor).not.toContain('from "@/services/roles.service"'); expect(editor).not.toContain("listTaxonomy("); });
  it("preselects current taxonomy and supports clearing optional assignments", () => { expect(editor).toContain("currentTaxonomy.classificationId"); expect(editor).toContain('categoryId: event.target.value || null'); expect(editor).toContain('departmentId: event.target.value || null'); });
  it("binds taxonomy to preview and apply", () => { expect(editor).toContain("pointer.policyVersion, draft, taxonomy"); expect(editor).toContain("confirmSensitive, taxonomy"); });
  it("invalidates a preview after taxonomy changes", () => { expect(editor).toContain("function editTaxonomy"); expect(editor).toContain("setPreview(null)"); });
  it("protects owner rules for non-owner users", () => { expect(editor).toContain("ownerReadOnly"); expect(editor).toContain("Protected owner rule"); expect(editor).toContain("Protected owner rule — only the document owner can modify it."); });
  it("compares current user with document owner for owner-rule read-only", () => { expect(editor).toContain("currentUserId === documentOwnerId"); });
  it("enforces minimum actions for owner rules owned by the document owner", () => { expect(editor).toContain("isOwnerRule && OWNER_MINIMUM_ACTIONS.has(action)"); expect(editor).toContain("(required)"); });
  it("prevents subject type change for owner rules", () => { expect(editor).toContain("ownerReadOnly || isOwnerRule"); });
  it("protects taxonomy for delegated non-owner managers", () => { expect(editor).toContain("taxonomyEditable"); expect(editor).toContain("Document taxonomy can only be changed by the document owner or a Company Admin."); });
  it("disables taxonomy controls when not editable", () => { expect(editor).toContain("disabled={!taxonomyEditable}"); });
  it("shows owner-rule-protected error message", () => { expect(editor).toContain("owner_rule_protected"); expect(editor).toContain("Only the document owner may modify the owner rule."); });
  it("shows taxonomy-protected error message", () => { expect(editor).toContain("taxonomy_protected"); expect(editor).toContain("Only the document owner or a Company Admin may change document taxonomy."); });
  it("shows options loading, error, and taxonomy empty states", () => { expect(editor).toContain("Loading policy editor options"); expect(editor).toContain("No active classifications are available"); expect(editor).toContain("Taxonomy options could not be loaded"); expect(editor).toContain("Policy editor options could not be loaded"); });
  it("shows a retry button for failed options loading", () => { expect(editor).toContain("Retry loading options"); expect(editor).toContain("Retry taxonomy"); });
  it("uses the backend-selected sensitivity for confirmation", () => expect(editor).toContain("preview.taxonomy.classificationLevel"));
  it("does not auto-confirm sensitive broadening", () => expect(editor).toContain("setAcknowledged(false)"));
  it("sends sensitive confirmation only from the explicit dialog", () => expect(editor).toContain("doApply(true)"));
  it("preserves draft while reloading a stale pointer", () => expect(editor).toContain("Reload pointer and preserve draft"));
  it("preserves taxonomy selections while reloading a stale pointer", () => {
    const reload = editor.slice(editor.indexOf("async function reloadPointer"), editor.indexOf("async function doApply"));
    expect(reload).not.toContain("setTaxonomy(");
  });

  it("shows deny assignments instead of omitting them", () => expect(panel).toContain('assignment.effect === "deny"'));
  it("shows stale references safely", () => expect(panel).toContain("Unavailable principal"));
  it("sorts history newest first and marks it read-only", () => { expect(panel).toContain("b.policyVersion - a.policyVersion"); expect(panel).toContain("Read only"); });
  it("keeps history failures out of the panel-wide error state", () => { expect(panel).toContain("setHistoryError(policyApi.classifyPolicyError(cause))"); expect(panel).toContain("Other policy data remains available"); });
  it("shows a History-tab retry action", () => { expect(panel).toContain("<HistoryLoadError"); expect(panel).toContain("Retry history"); });
  it("retries only history after an isolated failure", () => {
    const retry = panel.match(/function HistoryLoadError[^\n]+/)?.[0] ?? "";
    expect(retry).toContain("retry");
    expect(retry).not.toContain("refresh");
    expect(panel).toContain("HistoryLoadError retry={() => void refreshHistory()}");
  });
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
