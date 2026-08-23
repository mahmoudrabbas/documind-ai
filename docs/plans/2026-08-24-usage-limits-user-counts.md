# Usage & Limits User Counts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Usage & Limits endpoint reflect newly accepted employees and always expose the company-admin seat dimension.

**Architecture:** Reuse the existing entitlement request-path reconciliation seam. Before `EntitlementService.getUsage` reads current-period counters, it will best-effort repair the `employees` and `admins` dimensions from the authoritative user collection using `ReconciliationService.reconcileAtLeast`; the controller and UI contracts remain unchanged.

**Tech Stack:** TypeScript, Express, Mongoose, Vitest/Node test runner, existing entitlement and reconciliation services.

---

### Task 1: Add the failing service regression test

**Files:**
- Modify: `api/src/modules/entitlement/__tests__/entitlement.service.test.ts`

**Step 1: Write the failing test**

Add a test for `EntitlementService.getUsage` with no existing employee/admin rows and a reconciliation callback that populates authoritative values. Assert the returned usage includes both `employees` and `admins` with those values. Add a stale-low setup if the local test fake supports seeded counters.

**Step 2: Run the focused test**

Run: `npx vitest run api/src/modules/entitlement/__tests__/entitlement.service.test.ts -t "getUsage reconciles employee and admin dimensions"`

Expected: FAIL because `getUsage` currently only calls `getAllUsage` and never invokes the reconciliation seam.

### Task 2: Implement read-time seat reconciliation

**Files:**
- Modify: `api/src/modules/entitlement/entitlement.service.ts:388-395`

**Step 1: Implement the minimal fix**

In `getUsage`, invoke the existing reconciliation helper for `employees` and `admins` before reading the current-period counters. Keep reconciliation best effort and preserve the existing `getAllUsage` result shape.

**Step 2: Run the focused test**

Run: `npx vitest run api/src/modules/entitlement/__tests__/entitlement.service.test.ts -t "getUsage reconciles employee and admin dimensions"`

Expected: PASS.

### Task 3: Verify entitlement behavior and repository health

**Files:**
- No additional files expected.

**Step 1: Run entitlement regression tests**

Run: `npx vitest run api/src/modules/entitlement/__tests__`

Expected: PASS with no new failures.

**Step 2: Run API typecheck**

Run: `npm.cmd run typecheck --workspace api`

Expected: PASS.

**Step 3: Inspect the final diff**

Run: `git diff --check; git status --short`

Expected: no whitespace errors; only the design/plan documents and the focused implementation/test changes are modified. Git commit remains unavailable if `.git/index.lock` cannot be created in the managed workspace.
