# Disposable Test Database Safety Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent destructive API tests from connecting to or cleaning a live MongoDB database.

**Architecture:** Add a shared test-only helper that validates disposable database names, connects with an explicit `dbName`, and verifies the active connection before cleanup. Migrate every test that currently connects to the raw `MONGODB_URI` without a database override.

**Tech Stack:** TypeScript, Mongoose, Node test runner, Vitest, mongodb-memory-server

---

### Task 1: Add fail-closed database guard tests

**Files:**
- Create: `api/src/common/testing/disposableMongo.test.ts`
- Create: `api/src/common/testing/disposableMongo.ts`

**Step 1:** Write tests that require test-marked database names, reject `docsai`, `prod`, `production`, empty names, disconnected connections, and actual/expected name mismatches.

**Step 2:** Run `node scripts/run-api-tests.mjs "src/common/testing/disposableMongo.test.ts"` and verify the test fails because the helper does not exist.

**Step 3:** Implement the minimal validation and connection assertion functions.

**Step 4:** Run the same command and verify all guard tests pass.

### Task 2: Isolate unsafe persistence-test connections

**Files:**
- Modify: `api/src/modules/chat/__tests__/chat.productionWorkflow.e2e.test.ts`
- Modify: `api/src/modules/billing/subscription-admin.service.test.ts`
- Modify: `api/src/modules/billing/__tests__/billing-operation.persistence.test.ts`
- Modify: `api/src/modules/billing/__tests__/refund.service.persistence.test.ts`
- Modify: `api/src/modules/billing/__tests__/invoice-synchronization.persistence.test.ts`
- Modify: `api/src/modules/billing/__tests__/billing.routes.integration.test.ts`
- Modify: `api/src/modules/notifications/__tests__/notification.model.test.ts`
- Modify: `api/src/modules/notifications/__tests__/outbox.test.ts`
- Modify: `api/vitest.config.ts`

**Step 1:** Replace raw Mongoose connections with the helper and a dedicated `*-test` database name.

**Step 2:** Add an active-database assertion before destructive setup and teardown cleanup.

**Step 3:** Search for remaining raw `mongoose.connect(process.env.MONGODB_URI)` test connections and verify none remain.

**Step 4:** Remove the hardcoded Vitest `MONGODB_URI` so the official runner's disposable replica-set URI is preserved.

### Task 3: Verify safely

**Files:**
- Test: all files changed in Tasks 1 and 2

**Step 1:** Run the helper unit test through `scripts/run-api-tests.mjs`.

**Step 2:** Run the affected integration tests through `scripts/run-api-tests.mjs` so each process receives a disposable memory-server URI.

**Step 3:** Run `npm run typecheck:api`.

**Step 4:** Run `npm run lint` and report warnings separately from errors.

**Step 5:** Review `git diff` and confirm no application data, environment file, dependency manifest, or unrelated user file changed.
