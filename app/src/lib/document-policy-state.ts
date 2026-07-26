import type { PolicyDraft, PolicyPreview } from "@/types/api/document-policy.types";

export interface PolicyDraftState {
  draft: PolicyDraft;
  preview: PolicyPreview | null;
  idempotencyKey: string | null;
  dirty: boolean;
}

/** Pure state transition: every draft edit invalidates the opaque operation context. */
export function editPolicyDraft(state: PolicyDraftState, draft: PolicyDraft): PolicyDraftState {
  return { draft, preview: null, idempotencyKey: null, dirty: true };
}

/** Preview tokens intentionally have no persistence helper. */
export function attachPolicyPreview(state: PolicyDraftState, preview: PolicyPreview, idempotencyKey: string): PolicyDraftState {
  return { ...state, preview, idempotencyKey };
}
