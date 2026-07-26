# Document Access Policy Contract v1

## Purpose and boundary

This contract defines deterministic, tenant-scoped document authorization for Issue 18. Version 1 contains pure TypeScript contracts, an evaluator port, a deterministic in-memory adapter, capability adapters, and provider-neutral list/retrieval filters. It does not define persistence, APIs, migrations, route enforcement, indexing, retrieval, audit, or UI behavior.

Permission contract v1 remains the coarse capability authority. A document policy may narrow an allowed capability but can never create or override one. `PermissionEvaluatorDocumentCapabilityAdapter` composes the existing evaluator without importing role repositories. Phase 5 maps `manage_access` only to `documents:manage-access` and `use_in_ai` only to `documents:use-in-ai`.

## Versioned actions

The serializable action vocabulary is:

`discover`, `read`, `download`, `update`, `delete`, `archive`, `restore`, `replace`, `reprocess`, `manage_access`, and `use_in_ai`.

Actions are independent. In particular, `read` grants neither `download` nor `use_in_ai`.

## Context and policy

Actor context contains the authoritative tenant and actor IDs, base role, optional custom role, and department memberships needed for subject matching. Integrations must derive tenant identity from authenticated server context; arbitrary client tenant fields are never authority.

Resource context contains the authoritative tenant/document IDs, ownership and taxonomy identities, classification and lifecycle state, and the active policy identity/version when known. Future adapters must load it through a tenant-scoped repository.

`legacyCategory` and `legacyDepartment` are transitional display/scope values for current free-text document metadata. They do not establish tenant-owned referential integrity and must not be treated as category or department identity.

A policy snapshot is immutable by `(policyId, policyVersion)` and contains tenant/document identity, lifecycle/effective timestamps, an optional exact parent reference, structured allow/deny rules, safe provenance, and indexing metadata. Rules support user, custom-role, department, owner, and tenant-member subjects. Rule actions are explicit arrays; arbitrary predicates are forbidden.

## Deterministic precedence

Evaluation uses an injected ISO-8601 instant and applies this order:

1. A mismatch among present tenant identities always denies.
2. Invalid actor/resource/time context denies.
3. Unsupported actions deny.
4. Missing, malformed, inactive, not-yet-effective, expired, or stale policy context denies.
5. A missing or invalid referenced inherited snapshot denies.
6. The existing coarse capability adapter must allow the exact action.
7. Every matching deny across the document and inherited snapshots overrides every allow.
8. A matching allow grants only its listed action.
9. No matching allow defaults to deny.

Rule arrays are treated as sets for decisions, and matched rule IDs are deduplicated and sorted. Input array order cannot change the result. Base-role labels alone never grant document access.

## Stable reasons

Decisions use contract version `1` and one of:

- `ACCESS_ALLOWED`
- `INVALID_CONTEXT`
- `TENANT_MISMATCH`
- `CAPABILITY_REQUIRED`
- `POLICY_MISSING`
- `POLICY_INACTIVE`
- `POLICY_NOT_EFFECTIVE`
- `POLICY_EXPIRED`
- `EXPLICIT_DENY`
- `NO_MATCHING_GRANT`
- `INVALID_POLICY`
- `STALE_POLICY_CONTEXT`
- `ACTION_NOT_SUPPORTED`

Decisions contain only safe identity/version fields and matched rule IDs, never document content.

## Query-filter contract

`DocumentAccessQueryFilter` is a repository-adapter input for applying discover/list authorization before count, sorting, and pagination. It contains tenant, actor, action, explicit `deny_all` or `constrained` mode, normalized allow/deny document identities, owner/category/department/classification constraints, policy-version requirements, contract versions, and `failClosed: true`.

Empty constraints never mean unrestricted access. A future Mongo adapter must translate this value into a predicate and reject unsupported combinations; Phase 1 does not import MongoDB or Mongoose types and does not provide that translator.

## Retrieval-filter contract

`DocumentRetrievalAccessFilter` fixes the action to `use_in_ai`, uses the same normalized constraints and policy-version requirements, and sets both `failClosed: true` and `requiresCurrentPolicyRevalidation: true`. Retrieval providers must revalidate current document policy at query/use time. Enqueue-time authority and index-time metadata are never sufficient after revocation or policy tightening.

## Fail-closed invariants

- Actor, resource, policy, inherited policy, and filter tenant identity must agree.
- Coarse denial cannot be overridden by any policy rule.
- Missing, malformed, stale, unsupported, or unmatched state denies.
- Explicit deny overrides allows regardless of source or insertion order.
- The in-memory evaluator and capability source are deterministic development/test adapters, not production persistence.

## Later phases

Later phases own taxonomy and policy persistence, migration/backfill, repository translators, API and processing-route enforcement, policy-change propagation, worker/index integration, retrieval and citation enforcement, auditing, and frontend management/preview UI.
