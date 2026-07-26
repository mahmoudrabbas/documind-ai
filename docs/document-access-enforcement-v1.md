# Document access enforcement v1

Issue 18 Phase 5 composes the current Permission Contract v1 capability decision with the exact active document policy. Both must allow the action. Actor identity, base/custom role, and optional department membership are loaded from active tenant-owned records. Resource owner and taxonomy references come only from the stored document. Policy-less, stale, missing, malformed, inactive, future, expired, or invalid inherited policy contexts fail closed.

Direct denials use the existing `DOCUMENT_NOT_FOUND` 404 envelope, making missing, cross-tenant, and policy-denied resources indistinguishable without exposing policy identity or reasons. Synchronous calls reload the document pointer and snapshots for every decision, so revocation requires no cache, session refresh, reindex, or worker propagation.

Listing uses a tenant-scoped aggregation that joins the exact active snapshot and inherited snapshot, validates effective state, applies matching subjects and deny precedence, and removes authorization internals before a shared repository facet computes rows and count. Authorization occurs before sorting, pagination, and serialization; no allowed-ID list or post-page filtering is used.

Uploads retain `documents:create`, resolve or idempotently create the active same-tenant Restricted classification, and transactionally create the document, initial version, immutable policy v1, and active pointer. The uploader is owner. The private default grants only owner `discover`, `read`, and `download`; it grants no tenant-member, employee-wide, `use_in_ai`, `manage_access`, mutation, replacement, deletion, archive, or reprocess action. Storage cleanup remains active on database failure.

Extraction and processing reads require policy `read`; dispatch and retry operations require `reprocess`; quality/review mutations require `update`. Explicit intent-query document IDs require `use_in_ai` individually and one denial rejects the request. This phase does not implement general retrieval, public policy management, propagation/reindex, citations, audit events, or frontend controls.
