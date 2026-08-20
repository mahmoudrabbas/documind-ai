# Permission Loading Lock Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make permission loading terminate reliably under concurrent 403 events, timeouts, and React remounts, and remove duplicate company-admin top-bar navigation.

**Architecture:** Replace competing generation-based refreshes with one identity-scoped active promise and an eight-second timeout. Coalesce denial-triggered refreshes, preserve fail-closed state transitions, and keep route authorization unchanged. Treat the tenant top bar as utilities only for company admins while retaining the complete sidebar.

**Tech Stack:** React 19, Next.js 16 Client Components, TypeScript, Vitest, React Testing Library.

---

### Task 1: Reproduce the permission loading race

**Files:**
- Modify: `app/src/providers/__tests__/permission-provider.test.tsx`

1. Add a jsdom provider harness using the real `PermissionProvider` and mocked
   auth, permission service, and permission-denied subscription.
2. Add a failing test with a deferred `/permissions/me` response and rapid
   permission-denied notifications.
3. Assert the provider does not create competing requests and eventually
   publishes `ready`.
4. Run:
   `npm.cmd run test --workspace app -- src/providers/__tests__/permission-provider.test.tsx`
5. Confirm the new test fails for the current generation-counter behavior.

### Task 2: Add timeout and retry regression coverage

**Files:**
- Modify: `app/src/providers/__tests__/permission-provider.test.tsx`
- Modify: `app/src/components/auth/permission-boundary.test.tsx`
- Modify: `app/src/components/auth/app-navigation.test.tsx`

1. Add a failing fake-timer test that advances eight seconds and expects an
   error containing `Permissions check timed out`.
2. Invoke `refreshPermissions` from the error state and assert a fresh request
   can reach `ready`.
3. Add boundary/navigation assertions that terminal permission failures expose
   Retry and invoke refresh.
4. Add an unmount/remount test proving stale completion is ignored.
5. Run the focused app tests and confirm the new assertions fail before the
   production change.

### Task 3: Implement the permission lifecycle fix

**Files:**
- Modify: `app/src/providers/permission-provider.tsx`
- Modify: `app/src/components/auth/app-navigation.tsx`
- Modify as needed: `app/src/lib/permission-utils.ts`

1. Replace request generations with an identity-scoped active request record.
2. Reuse the active promise for concurrent refresh callers.
3. Add an eight-second timeout that publishes the existing error state and
   ignores late settlement.
4. Invalidate active work on identity/auth lifecycle changes and unmount.
5. Debounce permission-denied notifications and reuse active work.
6. Localize the navigation retry alert with existing permission/common keys.
7. Run the focused provider, boundary, navigation, and permission-utils tests.

### Task 4: Verify the employee knowledge-gap permission contract

**Files:**
- Modify: `api/src/modules/permissions/permissions.catalog-role.test.ts`

1. Add an explicit regression assertion that
   `BASE_ROLE_DEFAULTS.EMPLOYEE` includes `Permission.KNOWLEDGE_GAPS_READ`.
2. Run:
   `node ../scripts/run-api-tests.mjs src/modules/permissions/permissions.catalog-role.test.ts`
   from `api/`.
3. Do not modify backend evaluator behavior unless this contract test exposes a
   real defect.

### Task 5: Remove duplicate company-admin top-bar navigation

**Files:**
- Create: `app/src/components/ui/TopNavBar.test.tsx`
- Modify: `app/src/components/ui/TopNavBar.tsx`

1. Add a failing render test for a company admin that asserts the top bar has no
   search textbox and no Overview, Documents, or Users links.
2. Assert utility controls remain and the super-admin behavior is unchanged.
3. Remove the company-admin search and duplicate links without changing sidebar
   constants or route guards.
4. Run the top-bar and sidebar navigation tests.

### Task 6: Verify and document

**Files:**
- Modify, keep untracked: `docs/V1-FINAL-STABILIZATION-REPORT.md`

1. Run focused app tests for the provider, boundary, app navigation, top bar,
   permission utilities, and affected dashboard layouts.
2. Run app typecheck and lint.
3. Run the focused backend permission catalog test.
4. Run `git diff --check` and inspect `git status --short`.
5. Add the root cause, implementation, test counts, navbar cleanup, and tenant
   data-safety statement to the untracked report.
6. Commit only code/tests/planning files as a small reviewable commit if all
   focused checks pass. Do not stage or commit the stabilization report. Do not
   push, merge, or open a pull request.

