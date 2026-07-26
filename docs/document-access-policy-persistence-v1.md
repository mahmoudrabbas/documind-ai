# Document Access Policy Persistence v1

## Phase 3 boundary

Issue 18 Phase 3 persists the Phase 1 `DocumentAccessPolicy` contract and exposes provider-neutral repository and service operations for exact reads, active reads, bounded history, initial creation, and concurrency-safe next-version activation. It does not migrate existing documents, create policies during upload, enforce policies on document or retrieval APIs, add public mutation routes, audit policy changes, or update indexes/workers.

## Identity, immutability, and indexes

`policyId` is the stable policy-family identity shared by every version for one document. MongoDB `_id` is the private snapshot identity. A snapshot is addressed by the tenant-scoped tuple `(tenantId, documentId, policyId, policyVersion)`; that tuple is unique. History, tenant/family, and effective-time compound indexes never make an identifier globally unique across tenants.

Snapshots are append-only. Normal query updates, replacements, and bulk writes are rejected by the model. Phase 3 never changes snapshot status after creation: active selection is represented only by the Document pointer, so historical rule content and provenance remain unchanged.

## Active pointer and atomic writes

Document has optional `activePolicyId`, `activePolicyVersion`, and `policyChangedAt` fields. They remain absent/null for existing documents because Phase 3 performs no migration. File `version` and `versionLabel` remain independent and are never modified by policy writes.

Initial and next-version creation use a Mongo session transaction. The new snapshot is inserted and the Document pointer is changed with a compare-and-set predicate in the same transaction. A next version must use the active family and equal the expected version plus one. A unique snapshot index prevents duplicate versions, while the pointer predicate makes stale writers fail. The repository does not retry a failed write. Transaction-capable MongoDB (replica set or sharded deployment) is therefore a persistence prerequisite; there is deliberately no unsafe non-transaction fallback.

## Tenant and reference validation

Every repository operation requires both `tenantId` and `documentId`. Services first load the Document through the authoritative tenant scope, making absent and cross-tenant resources indistinguishable. Client input cannot set tenant, document, family, version, status, provenance, or index identity fields.

User subjects must resolve to an active same-tenant non-`SUPER_ADMIN` user. Custom roles must be same-tenant, active, migration-complete roles. Department subjects and category/classification/department index metadata must resolve to current, active Phase 2 taxonomy records. Archived references are rejected for new snapshots. `owner` and `tenant_member` subjects cannot carry IDs.

Inheritance uses an exact family/version reference. The parent must be an older snapshot in the same tenant, document, and policy family. Direct self-reference, forward references, missing/cross-scope parents, and cycles encountered while walking the loaded chain are rejected.

## Validation and default

The persistence validator requires contract version 1, positive safe policy versions, valid effective instants, an increasing effective window, unique nonblank rule IDs, Phase 1 allow/deny effects and actions, valid subject shapes, and exact agreement between policy and index identity. Duplicate actions are removed and sorted in the canonical Phase 1 action order; rules are sorted by ID.

The pure default factory requires a valid restricted/private classification ID and creates active version 1 with one owner rule granting exactly `discover`, `read`, and `download`. It grants no `tenant_member`, employee-wide, `use_in_ai`, mutation, or `manage_access` action. Missing taxonomy context fails closed. The factory is deterministic and deeply freezes its result, but Phase 3 does not connect it to upload or migration.

## Authorization and stable errors

Policy reads may be wired to existing `documents:read`. There is no proven Permission Contract v1 capability for `manage_access`; consequently the service requires an injected mutation authorization guard and Phase 3 provides no production mutation route or permissive mapping. In particular, `documents:read` alone cannot mutate a policy. A later permission-catalog decision must supply canonical policy-administration authority.

Stable errors distinguish invalid input, hidden not-found, stale pointer, duplicate version, scope mismatch, invalid inheritance, invalid subjects, invalid taxonomy, active-pointer conflict, and missing mutation authority. Mongo duplicate-key text is never returned.

## Later phases

Later work owns migration/backfill, upload integration, public policy editing and preview/apply APIs, document and retrieval enforcement, production evaluator wiring, propagation/reindexing, audit events, citation/RAG behavior, and frontend management UI. Existing document visibility is unchanged by this phase.
