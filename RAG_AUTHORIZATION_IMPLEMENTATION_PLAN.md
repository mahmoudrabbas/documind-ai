# RAG Authorization and Retrieval Remediation Implementation Plan

> **For the executing model:** Use `superpowers:using-git-worktrees`, then `superpowers:executing-plans`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`.

**Goal:** Eliminate silent RAG authorization mismatches, stale-metadata security decisions, misleading refusals, and chat-route inconsistencies identified in `RAG_AUTHORIZATION_AUDIT.md`.

**Architecture:** Keep `documents:read` and `documents:use-in-ai` separate. Build a live, fail-closed document-ID allowlist from canonical documents and current policy snapshots before search, then reauthorize final candidates before releasing content. Evidence, citation, and routing remain separate typed gates.

**Tech Stack:** TypeScript, Express, Mongoose/MongoDB, Atlas Search, BullMQ, Node test runner, Vitest, Next.js.

---

## Locked Decisions

- An explicit `use_in_ai` policy grant is authoritative; EMPLOYEE classification defaults cannot override it.
- Explicit permission scopes still constrain access and fail closed when invalid.
- `documents:read` does not automatically imply `documents:use-in-ai`.
- Trial and active tenants may use authenticated tenant routes.
- Genuine source conflicts produce an answer explaining both positions with citations.
- Chunk taxonomy metadata may affect ranking but must never authorize or deny access.
- Empty or unresolved authorization filters mean deny-all, never unrestricted access.

## Execution Protocol

For every phase: write the failing tests, run them to confirm failure, implement the minimum change, rerun focused tests and typechecking, then commit. Do not begin the next phase until its acceptance gate passes.

Create an isolated worktree before editing. Preserve the existing untracked `RAG_AUTHORIZATION_AUDIT.md`; do not commit it unless explicitly requested.

## Non-Negotiable Guidelines for the Executing Model

### Before Editing

- Read `RAG_AUTHORIZATION_AUDIT.md` completely, then inspect every referenced source file before changing behavior.
- Treat the repository as the source of truth when file names or line numbers have changed. Do not blindly reproduce code snippets from the audit.
- Run `git status --short` first. Preserve all existing user changes and untracked files; never reset, checkout, overwrite, or delete them.
- Create an isolated feature worktree and branch. Never implement this plan directly on `master` or another shared branch.
- Run the relevant existing tests before changing code. Record any baseline failures and do not attribute them to the implementation.
- If a locked decision conflicts with an actual legal, compliance, or product requirement found in the repository, stop and ask the user rather than guessing.

### Authorization Safety

- Never weaken tenant isolation. Every document, policy, chunk, embedding, conversation, and audit query must include the trusted server-side `tenantId`.
- Never accept `tenantId`, `actorId`, role, permissions, scopes, trace IDs, allowed document IDs, or authorization outcomes from model/tool input or request bodies.
- The trusted actor must be loaded from the database for the current tenant. JWT role claims may identify a session but must not override persisted authorization state.
- Missing permissions, missing policies, invalid roles, inactive taxonomy records, unresolved scopes, empty allowlists, malformed IDs, and dependency failures must fail closed.
- `undefined`, `null`, and `[]` must have explicit tested meanings. No missing or empty authorization value may be interpreted as unrestricted access.
- Explicit deny rules must continue to win over every allow rule, including owner, role, department, and tenant-member rules.
- Permission capability checks and document policy checks are both required. Passing one must never bypass the other.
- Use canonical document fields and policy snapshots for authorization. Chunk or embedding metadata may only narrow relevance after authorization and must never broaden or revoke access.
- Reauthorize every final document immediately before its text, citation, title, or source metadata leaves the retrieval boundary.
- Do not add a permission cache. The current uncached behavior is intentional so grants and revocations take effect on the next request.
- Do not expose whether an inaccessible document exists. Unauthorized explicit document IDs or titles must remain indistinguishable from nonexistent ones.

### Retrieval and Evidence Safety

- The allowlist must be computed before content retrieval and must be intersected with user-requested filters. User filters can only narrow access.
- Never truncate the authorization allowlist. Process large sets in deterministic batches and merge results globally.
- Do not fall back from a failed allowlist resolver to tenant-wide search. Return a typed fail-closed outcome instead.
- Preserve final policy reauthorization even after the canonical allowlist is implemented; it closes revocation races.
- Never send unauthorized chunk text to rerankers, language models, citation verification, logs, metrics, or knowledge-gap processing.
- A zero-result response must distinguish authorization restriction, no similar content, indexing unavailability, and evidence rejection internally.
- Genuine conflicts may be explained only from authorized evidence, must cite all competing claims, and must not select an unsupported winner.
- Citation or semantic-verification failure must never release an unverified grounded answer.
- Retries must be bounded and must reuse the same tenant, actor, policy action, and document allowlist. A retry must never broaden authorization.

### Migration and Data Safety

- Never run migration `--apply` commands against production or shared data without explicit user approval after reviewing the dry-run report.
- Run the `use_in_ai` migration tenant by tenant. Save the dry-run counts and checkpoint before applying.
- Migration logic must be idempotent, resumable with `--after-id`, and safe under policy-version conflicts.
- Never modify existing immutable policy snapshots. Create a new version and atomically update the active policy pointer through the established persistence service.
- Do not directly edit chunks or embeddings outside the propagation worker unless the existing architecture explicitly requires a repair migration.
- Every propagation event must be tenant-scoped, idempotent, retryable, traceable, and safe when delivered more than once.
- Never test destructive taxonomy, policy, tenant-status, or migration operations against production data. Use disposable Mongo fixtures or a dedicated test tenant.

### Testing Discipline

- Follow strict red-green-refactor TDD. No production behavior change may be written before a test fails for the expected reason.
- Do not weaken, delete, skip, or rewrite an assertion merely to make a test pass. Change an existing expectation only when this plan explicitly changes that behavior.
- Prefer real Mongo fixtures and the real policy evaluator for authorization integration tests. Avoid Map lookups or mocks that bypass policy, scope, lifecycle, or taxonomy behavior.
- Every security regression test must include a negative assertion proving that unauthorized or cross-tenant content is absent.
- Test both `/chat/send` and `/chat/send/stream` for every guard decision.
- Test both broadening and revocation directions for taxonomy and policy changes.
- Test all reason codes as well as user-visible messages. Do not rely only on candidate counts or HTTP status codes.
- Run focused tests after each red-green cycle, then the complete workspace validation before claiming a phase is complete.

### Observability and Privacy

- Reuse the incoming request trace ID across chat, retrieval, evidence, citations, propagation, and audit events.
- Logs and metrics may include IDs, counts, stages, latencies, outcomes, and reason codes. They must not contain query text, document text, chunk text, generated answers, secrets, tokens, or personal data.
- Public response outcomes must remain coarse and must not reveal hidden document IDs, titles, classifications, policy rules, or denial subjects.
- Audit-write or metrics failures must not broaden access or release content. Authorization decisions remain fail closed.

### Scope and Change Control

- Keep edits limited to this remediation. Do not perform unrelated refactors, dependency upgrades, formatting sweeps, or schema redesigns.
- Prefer existing repository services, validators, ports, and error conventions over new parallel authorization implementations.
- Add an abstraction only when it becomes the single shared source of truth or removes real duplicated security logic.
- Preserve backward compatibility for existing response fields. New response fields should be optional until all callers are updated.
- Do not change user-facing authorization wording without updating English and Arabic responses and their tests.
- Do not commit generated build output unless the repository already tracks it and the plan explicitly requires it.
- After each phase, inspect `git diff --check` and `git diff` to ensure no unrelated changes or sensitive values were introduced.
- If three attempts do not resolve the same failing test or architectural conflict, stop and report the exact blocker instead of applying speculative fixes.

### Completion Rules

- A phase is complete only when its focused tests, API/worker/app typechecks, and diff review pass with fresh output.
- The full task is complete only after `npm run ci:validate` succeeds from a clean implementation worktree.
- Do not claim success from partial tests, previous command output, or visual inspection.
- The final report must list changed files, migrations required, feature-flag state, verification commands and results, remaining risks, and rollback instructions.

### Phase 0: Diagnostics and Regression Baseline

**Files:** Modify `api/src/modules/retrieval/retrieval.types.ts`, `api/src/modules/retrieval/retrieval.service.ts`, `api/src/modules/agents/tools/authorizedRetrievalTools.ts`, `api/src/modules/chat/chatWorkflowService.ts`, and related tests.

- Require the trusted request `traceId` in `AccessContext`; production retrieval must not replace it with a new UUID.
- Add typed retrieval outcomes: `AUTHORIZED_RESULTS`, `NO_AUTHORIZED_DOCUMENTS`, `NO_SEARCH_MATCHES`, and `NO_RETRIEVABLE_CONTENT`.
- Record `retrievalOutcome`, `zeroCandidateReason`, `authorizationRestricted`, evidence sufficiency/reason, and approved/rejected counts without logging queries or chunk text.
- Add optional public `ChatResponse.outcome`: `answered`, `authorization_restricted`, `no_relevant_content`, `evidence_conflict`, `verification_failed`, or `unsupported`.
- Prevent authorization, conflict, and verification failures from creating knowledge-gap records.
- Commit: `test(rag): establish authorization audit regression baseline`.

**Gate:**

```powershell
npm run test --workspace api -- src/modules/retrieval/retrieval.authorization.test.ts
npm run test --workspace api -- src/modules/chat/chat.knowledgeGaps.test.ts
npm run typecheck:api
```

### Phase 1: Canonical RAG Authorization Allowlist

**Files:** Create `api/src/modules/document-access/documentAccess.retrievalAuthorization.ts` and its test; modify `documentAccess.filters.ts`, `documentAccess.authorization.service.ts`, `filterCompiler.ts`, `retrieval.service.ts`, and `app.ts`.

- Resolve the live actor and `documents:use-in-ai` capability; a missing grant returns `mode: "deny_all"`.
- Query canonical tenant documents using owner, category, department, and classification IDs plus current lifecycle state.
- Load exact active and inherited policy snapshots in batches and evaluate `use_in_ai` with the existing in-memory evaluator.
- Return a `DocumentRetrievalAccessFilter` containing all authorized document IDs and a typed denial reason.
- Intersect explicit document/title/query filters with the authorized IDs.
- Search authorized IDs in batches of 500, with maximum concurrency 4, then globally merge the best vector and keyword results.
- Remove base-role classification and chunk department/category/classification fields from authorization filtering.
- Keep final live policy reauthorization before returning chunk text.
- Add real Mongo tests covering explicit confidential grants, scoped grants, deny precedence, ownership, missing policies, and archived documents.
- Commit: `fix(rag): use canonical document authorization allowlist`.

### Phase 2: AI-Use Policy Compatibility

**Files:** Modify `api/src/modules/document-access/documentPolicyManagement.types.ts`, policy preview/editor tests, and `api/src/scripts/migrate-policy-use-in-ai.service.ts`.

- Keep `use_in_ai` independently selectable in policy rules and expose it explicitly in policy previews and responses.
- Preserve the default owner policy's existing `use_in_ai` action.
- Keep the legacy migration idempotent; extend only allow rules containing `read` but lacking `use_in_ai`.
- Run a dry-run per tenant, review `would_migrate`, then apply using the same tenant ID.
- Return a distinct authorization outcome when a document is readable but not AI-usable.
- Commit: `fix(document-access): make AI-use grants explicit`.

**Migration commands:**

```powershell
npm run migrate:policy:use-in-ai --workspace api -- --tenant-id <TENANT_OBJECT_ID>
npm run migrate:policy:use-in-ai:apply --workspace api -- --tenant-id <TENANT_OBJECT_ID>
```

### Phase 3: Propagation and Taxonomy Integrity

**Files:** Modify `api/src/modules/document-access/documentTaxonomyPropagation.service.ts`, `documentTaxonomy.service.ts`, `documentPolicyPropagation.dispatcher.ts`, `app.ts`, and worker propagation tests.

- Generalize propagation requests to classification, category, and department rename, archive, and restore events.
- Add a production scheduler that recovers `pending`, expired `dispatching`, and `retry_pending` events every five seconds in batches of 50.
- Preserve idempotency, exponential backoff, dead-letter state, and audit events.
- Renames must preserve authorization immediately because canonical IDs are authoritative.
- Archived or missing scoped taxonomy references must deny with `TAXONOMY_SCOPE_UNRESOLVABLE`.
- Verify reclassification scope changes take effect immediately, before metadata propagation completes.
- Commit: `fix(indexing): recover policy and taxonomy propagation`.

### Phase 4: Evidence, Summaries, Routing, and Follow-Ups

**Files:** Modify `api/src/modules/agents/tools/authorizedRetrievalTools.ts`, `api/src/modules/reranker/reranker.service.ts`, `conflictDetector.ts`, `api/src/modules/agents/citationSemanticVerification.service.ts`, `citationVerificationAgent.ts`, `chatAgentIO.ts`, `chatWorkflowService.ts`, and `api/src/modules/intent-query/intentQuery.service.ts`.

- Detect conflicts only among deduplicated evidence items that reach the final bundle.
- Add `conflictEvidenceIds`; route conflicts through a `conflict_explanation` answer task that presents both supported values with verified citations.
- Replace the destructive candidate catalog with a five-minute bounded store keyed by tenant, actor, and run/trace ID; reads must be idempotent.
- Return `CANDIDATE_PROVENANCE_MISSING` and retry search once instead of silently assigning zero relevance.
- Verify summaries in batches of at most 20 claims, with concurrency 2; split oversized claims before verification.
- Treat repeated verification-capacity failure as `verification_failed`, never as a knowledge gap.
- Replace unsafe substring matching so `hackathon policy` reaches RAG.
- Let contract/document references override external-current routing, so `latest prices in the vendor contract` reaches RAG.
- Generalize cross-document follow-ups; retrieve the authorized corpus or clarify, never return 502.
- Commit: `fix(rag): improve evidence conflict and routing behavior`.

### Phase 5: Chat Guard and Tenant Lifecycle Parity

**Files:** Modify `api/src/modules/chat/chat.routes.ts`, `api/src/common/auth/tenantAccess.ts`, `api/src/modules/auth/auth.service.ts`, and integration tests.

- Use the same self-resource `CHAT_CREATE` middleware for `/chat/send` and `/chat/send/stream`.
- Reuse one tenant-status helper in authentication and request middleware.
- Allow `active` and `trial`; deny `pending`, `pending_verification`, and `suspended`.
- Add table-driven route tests covering base roles, custom scopes, and tenant statuses.
- Commit: `fix(auth): align chat guards and tenant lifecycle`.

### Phase 6: Rollout and Full Verification

- Add `RAG_CANONICAL_ALLOWLIST_MODE=shadow|enforce|deny_all` in `api/src/config/env.ts`.
- Permit `shadow` only in staging; production rollout moves directly from validated staging to `enforce`.
- Use `deny_all` as the emergency rollback because returning to stale metadata authorization is unsafe.
- Compare allowlist size, resolver latency, search batch count, authorization-filtered count, and refusal outcomes before rollout.
- Confirm `api/dist` is freshly rebuilt and contains the new reason codes.
- Commit: `test(rag): complete authorization parity matrix`.

**Final verification:**

```powershell
npm run test --workspace api
npm run test --workspace workers
npm run test --workspace app
npm run lint
npm run typecheck
npm run build
npm run ci:validate
```

## Acceptance Scenarios

- Explicit EMPLOYEE `use_in_ai` access to a confidential document succeeds.
- Read-only access remains visible/readable but returns `authorization_restricted` in chat.
- Department or category rename does not interrupt retrieval.
- Scoped reclassification changes access immediately despite stale embeddings.
- Failed propagation dispatch is recovered by the scheduler.
- Conflicting leave values are both explained and cited.
- A 25-sentence summary passes batched semantic verification.
- Repeated evidence evaluation is deterministic.
- Both chat endpoints make identical authorization decisions.
- Trial tenants work; pending and suspended tenants remain blocked.
- No cross-tenant content, unauthorized document ID, or hidden document metadata is exposed.

## Required Regression Matrix

Run the matrix for SUPER_ADMIN, COMPANY_ADMIN, EMPLOYEE, and a custom EMPLOYEE role across public, internal, and confidential documents; unscoped, self-only, department, category, and classification scopes; explicit allow, explicit deny, missing policy, archived document, stale index, renamed taxonomy, and tenant statuses active, trial, pending, and suspended.

For every case assert list, direct read, download, retrieval, evidence, chat, and streaming-chat decisions. Assert both the user-visible outcome and the machine-readable reason code.

## Assumptions

- `documents:use-in-ai` remains a separate least-privilege capability for new policies.
- The existing in-memory policy evaluator remains the behavioral source of truth; the new resolver only selects candidate document IDs.
- The allowlist path must not truncate authorized IDs; large sets are searched in batches.
- No raw query text or document text is added to durable authorization or retrieval logs.
- Any test or migration failure blocks the next phase until resolved.
