# Automatic Department Document Access Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a document is assigned to a department, employees in that same tenant and department can view, download, and use it in AI, while other departments and tenants remain denied.

**Architecture:** The document access policy remains the authoritative per-document boundary. New uploads add an allow rule for the assigned department with `discover`, `read`, `download`, and `use_in_ai`; existing documents receive the same rule through an additive immutable policy-version backfill. Employee coarse capabilities for reading, downloading, and AI use are enabled by the base role, while policy evaluation still decides which individual documents are accessible.

**Tech Stack:** TypeScript, Express, Mongoose, immutable document policy snapshots, Node test runner, existing tenant-scoped migration framework.

---

### Task 1: Add failing policy and capability regression tests

**Files:**
- Modify: `api/src/modules/document-access/documentAccess.policy.validator.test.ts`
- Modify: `api/src/modules/documents/documentUpload.repository.test.ts`
- Modify: `api/src/modules/permissions/permissions.catalog-role.test.ts`
- Modify: `api/src/modules/document-access/documentAccess.retrievalAuthorization.test.ts`

**Step 1: Write the failing tests**

Cover these behaviors:

- A default policy with `departmentId` has one additional department allow rule containing exactly `discover`, `read`, `download`, and `use_in_ai`.
- A default policy without `departmentId` remains owner-only.
- The employee base role includes `documents:download` and `documents:use-in-ai`.
- An employee whose department matches the document is authorized for AI retrieval; another department is denied; a same-looking department id in another tenant is denied.

**Step 2: Run the focused tests**

Run: `npm.cmd run test --workspace api -- api/src/modules/document-access/documentAccess.policy.validator.test.ts api/src/modules/documents/documentUpload.repository.test.ts api/src/modules/permissions/permissions.catalog-role.test.ts api/src/modules/document-access/documentAccess.retrievalAuthorization.test.ts`

Expected: FAIL because upload/default policy lacks the department rule and employee defaults lack the two coarse capabilities.

### Task 2: Implement automatic department access for new uploads

**Files:**
- Modify: `api/src/modules/document-access/documentAccess.defaultPolicy.ts`
- Modify: `api/src/modules/permissions/permissions.catalog.ts`

**Step 1: Add the minimal implementation**

When `departmentId` is present, append a stable `department-${departmentId}` allow rule with the four department actions. Keep the existing owner rule unchanged. Add download and AI-use to the `EMPLOYEE` base-role defaults; the document policy remains the document-level restriction.

**Step 2: Run the focused tests**

Run the Task 1 command. Expected: PASS.

### Task 3: Add failing additive backfill tests

**Files:**
- Modify: `api/src/scripts/document-policy-backfill.contracts.ts`
- Modify: `api/src/scripts/document-policy-backfill.planner.test.ts`
- Modify: `api/src/scripts/document-policy-backfill.mongo.test.ts`
- Modify: `api/src/scripts/document-policy-backfill.service.test.ts`

**Step 1: Write the failing tests**

Cover an existing department-assigned document with an active policy: the planner should request an additive policy update, the persistence layer should create exactly one new policy snapshot at the next version, update only that document’s active pointer, preserve all previous rules, and be idempotent when the department rule already exists. Assert that records belonging to another tenant are never scanned or changed and that no delete operation is used.

**Step 2: Run the focused tests**

Run: `npm.cmd run test --workspace api -- api/src/scripts/document-policy-backfill.planner.test.ts api/src/scripts/document-policy-backfill.mongo.test.ts api/src/scripts/document-policy-backfill.service.test.ts`

Expected: FAIL because the current backfill treats any active policy as already migrated.

### Task 4: Implement the tenant-safe additive backfill

**Files:**
- Modify: `api/src/scripts/document-policy-backfill.contracts.ts`
- Modify: `api/src/scripts/document-policy-backfill.planner.ts`
- Modify: `api/src/scripts/document-policy-backfill.mongo.ts`
- Modify: `api/src/scripts/document-policy-backfill.service.ts`
- Modify: `api/package.json`
- Create: `docs/document-access-policy-department-backfill.md`

**Step 1: Extend planning and reporting**

Represent an additive department-rule plan separately from legacy no-policy migration. Skip documents with no valid same-tenant `departmentId`; classify documents already containing the department allow rule as `already_migrated`.

**Step 2: Implement the write transaction**

Load the document and active policy with `{ _id, tenantId }` filters. Verify the policy identity and department taxonomy reference are same-tenant and active. Create a new immutable snapshot with `policyVersion + 1`, preserve all existing rules, append the department rule, and update the document active policy pointer with an optimistic filter. Do not update or delete the prior snapshot. Do not call `deleteMany`, `deleteOne`, collection drops, or tenant mutations.

**Step 3: Preserve dry-run/apply safety**

Keep dry-run as the default and require `--apply` for writes. Keep tenant id mandatory, bounded batch/limit/checkpoint behavior, and document the exact commands plus the expected report and rollback approach (stop the migration; do not delete data).

**Step 4: Run migration tests**

Run the Task 3 command. Expected: PASS.

### Task 5: Verify tenant isolation and repository health

**Files:**
- No additional files expected.

**Step 1: Run targeted authorization and upload tests**

Run: `npm.cmd run test --workspace api -- api/src/modules/document-access api/src/modules/documents/documentUpload.repository.test.ts api/src/modules/permissions/permissions.catalog-role.test.ts`

**Step 2: Run API typecheck**

Run: `npm.cmd run typecheck --workspace api`

**Step 3: Inspect safety and final diff**

Run: `git diff --check; rg -n "deleteMany|deleteOne|dropDatabase|drop\(" api/src/scripts/document-policy-backfill*; git status --short`

Expected: no destructive operation in the department backfill, no whitespace errors, and only scoped files changed.
