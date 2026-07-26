# Document Policy UI v1

This document covers Issue 18 Phase 8 only. The document drawer exposes Overview, Active Policy, Assignments, Effective Access, History, and Propagation Status to users whose coarse permission set contains `documents:manage-access`. Direct requests remain subject to backend 403/hidden-404 decisions; control-plane visibility never claims document read access.

The active policy and immutable, newest-first history are read-only views. Assignment rows include allow and deny effects, inherited state, and stale-reference warnings. The bounded user matrix calls the effective-access endpoint and displays each action independently; the UI does not infer action hierarchies or evaluate access locally.

The structured editor accepts the backend subject types, effects, eleven explicit actions, dates, and a 500-character change reason. Owner and tenant-member rules have no subject ID. User, role, and department IDs come from tenant-scoped APIs. Duplicate semantic rules, duplicate actions, empty actions, invalid intervals, and more than 200 rules block preview. A deny-all draft is visible with a warning and remains subject to backend recovery-path validation.

Every write starts with preview against the current policy family/version. The impact, direction, rule delta, user gains/losses, action counts, expiry, and sensitive-confirmation flag are backend results. The signed preview token is opaque, held only in component memory, never decoded, logged, persisted, or placed in a URL. Editing invalidates it and its idempotency identity. Apply reuses the same bounded `Idempotency-Key` after an uncertain network response; a changed draft requires a new preview and key.

No-change disables apply. Expiry or mismatch requires re-preview. Version conflict preserves the in-memory draft but never retries it against a new version automatically. Reference errors lead back to subject correction. Confidential broadening is confirmed only when the backend flag is true, through an unchecked acknowledgement and explicit confirm action; closing the alert dialog writes nothing.

The documents table permits deterministic selection of at most 50 unique authorized rows. Page/filter changes clear selection. Batch preview sends document IDs, expected pointers, and the shared supported draft—never tenant ID or titles. Aggregate and item impact come from the backend. Batch apply retains complete/no-change/replay/conflict/failed item states and never presents partial completion as total success. Conflicts require reload and re-preview; successful entries are not silently resubmitted.

Propagation presents desired and applied/indexed versions, pending/current/failure states, attempts, reindex need, safe failure code, and completion time. Only matching `current` state/version is labelled current. It explains that synchronous API enforcement already follows the active policy while derived metadata/index work can remain pending or failed. No unsupported retry control is exposed.

Views include loading, empty, denied/unavailable, stale, partial, and recovery states. Tables scroll on narrow screens, controls use logical start/end CSS for RTL, and status meaning includes text/icons rather than color alone. Forms have labels, tables have headers, icon controls have accessible names, and sensitive confirmation uses alert-dialog semantics. English and Arabic localization follow the existing dictionaries.

No retrieval, citation, vector-search, chat/RAG, worker, notification, or backend policy semantics are implemented here. Issue 18 reaches its implementation boundary with this Phase 8 UI and still requires independent review and commit.
