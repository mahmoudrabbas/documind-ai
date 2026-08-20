# Knowledge Gap and Permission Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Distinguish access-constrained RAG refusals from genuine Knowledge Gaps and guarantee the Knowledge Gaps route reaches a terminal permission state.

**Architecture:** Propagate trusted retrieval authorization booleans through the chat workflow and use their combined value for both safe response selection and Knowledge Gap suppression. Keep one identity-scoped permission request active in the frontend, ignore stale settlement, bound it with a timeout, and expose retryable terminal states.

**Tech Stack:** TypeScript, Express workflow services, React 19, Next.js 16 Client Components, Vitest, React Testing Library, MongoDB memory-backed API integration tests.

---

### Task 1: Lock the partial-authorization chat contract

**Files:**
- Modify: `api/src/modules/chat/__tests__/chatWorkflowService.test.ts`
- Modify: `api/src/modules/chat/__tests__/chat.productionWorkflow.e2e.test.ts`

1. Add a unit regression where retrieval/evidence reports
   `authorizationFiltered` without a terminal `authorizationRestricted` flag.
2. Assert the response uses the generic authorization-safe message, sources are
   empty, and `reportKnowledgeGap` is not called.
3. Add a production-composed employee regression with same-tenant evidence that
   lacks `use_in_ai` authorization.
4. Assert no denied title, document ID, chunk ID, text, marker, Knowledge Gap,
   or `knowledge_gap_created` outbox record escapes.
5. Run the focused tests and confirm they fail against a fallback that checks
   only `authorizationRestricted`.

### Task 2: Apply the authorization-aware fallback

**Files:**
- Modify: `api/src/modules/chat/chatWorkflowService.ts`

1. Pass `authorizationRestricted || authorizationFiltered` to the fallback
   selector for insufficient-evidence and unverified-grounded refusals.
2. Keep the existing reportability predicate artifact-driven; do not infer from
   response text.
3. Keep genuine authorized-corpus no-match behavior unchanged.
4. Run both focused chat suites and confirm the regressions pass.

### Task 3: Lock the permission provider lifecycle

**Files:**
- Modify: `app/src/providers/__tests__/permission-provider.test.tsx`
- Modify: `app/src/components/auth/permission-boundary.test.tsx`
- Modify: `app/src/components/auth/app-navigation.test.tsx`

1. Cover rapid permission-denied notifications during an active request and
   assert they reuse one request.
2. Cover an eight-second stalled request, terminal error rendering, and a fresh
   successful manual retry.
3. Cover unmount/remount so a stale response cannot corrupt the current
   provider.
4. Cover synchronous client failure and working Retry actions.
5. Run the focused frontend tests and confirm the old generation/mount lifecycle
   fails the new cases.

### Task 4: Apply the bounded identity-scoped permission lifecycle

**Files:**
- Modify: `app/src/providers/permission-provider.tsx`
- Modify: `app/src/components/auth/app-navigation.tsx`

1. Store one active request record per authenticated tenant/user identity.
2. Reuse its promise for concurrent refresh requests.
3. Use a request token to ignore stale, timed-out, or unmounted settlement.
4. Add an eight-second timeout that publishes `status: "error"`.
5. Debounce permission-denied refresh bursts and clear request/timer state on
   identity changes and unmount.
6. Keep route authorization fail-closed and use localized retry copy.
7. Run the provider, boundary, and navigation tests.

### Task 5: Verify employee access and both regressions

**Files:**
- Modify: `api/src/modules/permissions/permissions.catalog-role.test.ts`

1. Assert the employee base role contains `knowledge-gaps:read`.
2. Run the focused API permission test.
3. Run the focused chat unit and production-composed suites.
4. Run the focused app permission/navigation suites.
5. Run API and app typechecks.
6. Run `git diff --check` and inspect the final worktree without staging
   unrelated files.
