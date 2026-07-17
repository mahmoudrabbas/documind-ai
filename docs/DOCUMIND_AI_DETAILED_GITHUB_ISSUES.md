# DOCUMIND AI — Detailed GitHub Issues

> Complete implementation-grade issue pack for GitHub and coding models.

# DOCUMIND AI — Detailed GitHub Issues for Vibe Coding

This package expands the project backlog into **30 implementation-grade feature issues**. Each issue is written so it can be pasted into GitHub and handed directly to a coding model.

## Source of Truth

The issues are based on:

1. The current repository implementation audit in `PROJECT_IMPLEMENTATION_STATUS.md`.
2. The updated full-product SRS in `DOCUMIND_AI_SRS_UPDATED_V2`.
3. The agreed product decisions:
   - Exactly three base roles: `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE`.
   - Custom roles are real tenant-scoped permission bundles.
   - Multi-agent workflows are mandatory.
   - Agents propose/coordinate; deterministic services and workers authorize and execute.
   - Payment, subscription lifecycle, invoices, refunds, quotas, and billing portal are part of the target product.
   - Employee Excel import includes AI-assisted mapping, deterministic validation, admin confirmation, asynchronous execution, email dispatch, progress, retry, and reports.
   - No issue should block waiting for another issue.

## How to Use

1. Select one issue file from `github-issues/`.
2. Paste the complete file into a GitHub Issue.
3. Assign one owner and one branch.
4. Give the same issue text to the coding model.
5. The model must inspect the repository before coding and follow the issue's discovery checklist.
6. Merge one pull request for the complete vertical slice.
7. Use the wave checkpoint only for integration; do not create blocking micro-issues for models/controllers/UI/tests.

## Parallel-Development Rule

Every issue must define the external interfaces it needs and ship:

- A provider/domain port.
- A deterministic fake or in-memory adapter.
- Contract tests.
- Frozen fixtures.
- Versioned request/response/event schemas.

This allows all six team members to work in parallel. A feature may later switch from a fake adapter to a real adapter without rewriting the domain or UI.

## Waves


### Wave 1 — Secure Product Foundation

- **Issue 01:** Secure Repository Secrets and All-Workspace CI
- **Issue 02:** Implement Real Custom Roles and Permission Engine
- **Issue 03:** Harden Company User and Document Authorization
- **Issue 04:** Normalize Package and Subscription Domain
- **Issue 05:** Build Functional Worker Runtime and Queue Contract
- **Issue 06:** Create Unified Observability and Audit Foundation

### Wave 2 — Core Operational Flows

- **Issue 07:** Complete Authentication E2E, Sessions, and 429 UX
- **Issue 08:** Complete Secure Document Management and Storage Adapter
- **Issue 09:** Build AI-Assisted Excel Employee Import, Confirmation, and Execution
- **Issue 10:** Implement Payment Checkout and Webhook Synchronization
- **Issue 11:** Implement Reliable Email Queue, Templates, and Delivery Status
- **Issue 12:** Create Agent Runtime, Supervisor, Typed Tools, and Tracing

### Wave 3 — Document Intelligence

- **Issue 13:** Implement PDF, DOCX, and TXT Extraction Pipeline
- **Issue 14:** Implement OCR and Document Quality Analysis
- **Issue 15:** Implement Metadata, Version, and Conflict Agents
- **Issue 16:** Implement Semantic Chunking, Embeddings, and Indexing
- **Issue 17:** Implement Processing Progress, Retry, Reprocess, and Admin UI
- **Issue 18:** Implement Document Categories, Access Policies, and Permission UI

### Wave 4 — Multi-Agent RAG

- **Issue 19:** Implement Intent Detection and Bilingual Query Expansion Agent
- **Issue 20:** Implement Tenant and Role Filtered Hybrid Retrieval
- **Issue 21:** Implement Reranking and Evidence Packaging
- **Issue 22:** Implement Answer Writer, Citation Verification, and Compliance Agents
- **Issue 23:** Build Conversations, Streaming Chat, and Source Viewer
- **Issue 24:** Implement Knowledge Gap Agent, Feedback, and Resolution Workflow

### Wave 5 — Commercial and Production Completion

- **Issue 25:** Implement Entitlement and Concurrency-Safe Quota Enforcement
- **Issue 26:** Complete Super Admin Company, Package, and Subscription Operations
- **Issue 27:** Complete Company Admin Dashboard, Settings, and Custom-Role UX
- **Issue 28:** Implement Token, Cost, Latency, Quality Analytics and Insight Agent
- **Issue 29:** Implement Billing Portal, Invoices, Cancellation, Reactivation, and Refunds
- **Issue 30:** Build Production Platform, Quality Gates, Deployment, Backup, and Recovery

## Issue Index

| # | Issue | Epic | Wave | Suggested Owner | Complexity |
|---|---:|---|---|---:|---|---|
| 01 | [Secure Repository Secrets and All-Workspace CI](github-issues/01-secure-repository-secrets-and-all-workspace-ci.md) | Foundation | Wave 1 | Platform/DevOps | Medium |
| 02 | [Implement Real Custom Roles and Permission Engine](github-issues/02-implement-real-custom-roles-and-permission-engine.md) | Security | Wave 1 | Backend/Security | Large |
| 03 | [Harden Company User and Document Authorization](github-issues/03-harden-company-user-and-document-authorization.md) | Security | Wave 1 | Full-stack | Large |
| 04 | [Normalize Package and Subscription Domain](#issue-04--normalize-package-and-subscription-domain) | Commercial | Wave 1 | Backend/Product | Large — **IMPLEMENTED (2026-07-17)** |
| 05 | [Build Functional Worker Runtime and Queue Contract](github-issues/05-build-functional-worker-runtime-and-queue-contract.md) | Infrastructure | Wave 1 | Backend/DevOps | Large |
| 06 | [Create Unified Observability and Audit Foundation](github-issues/06-create-unified-observability-and-audit-foundation.md) | Operations | Wave 1 | Backend/Platform | Large |
| 07 | [Complete Authentication E2E, Sessions, and 429 UX](github-issues/07-complete-authentication-e2e-sessions-and-429-ux.md) | Authentication | Wave 2 | Full-stack/QA | Large |
| 08 | [Complete Secure Document Management and Storage Adapter](github-issues/08-complete-secure-document-management-and-storage-adapter.md) | Documents | Wave 2 | Full-stack | Large |
| 09 | [Build AI-Assisted Excel Employee Import, Confirmation, and Execution](github-issues/09-build-ai-assisted-excel-employee-import-confirmation-and-execution.md) | Employee Onboarding | Wave 2 | Full-stack | Large |
| 10 | [Implement Payment Checkout and Webhook Synchronization](github-issues/10-implement-payment-checkout-and-webhook-synchronization.md) | Payments | Wave 2 | Backend/Full-stack | Large |
| 11 | [Implement Reliable Email Queue, Templates, and Delivery Status](github-issues/11-implement-reliable-email-queue-templates-and-delivery-status.md) | Email | Wave 2 | Backend/Full-stack | Large |
| 12 | [Create Agent Runtime, Supervisor, Typed Tools, and Tracing](github-issues/12-create-agent-runtime-supervisor-typed-tools-and-tracing.md) | Agents | Wave 2 | AI/Backend | Large |
| 13 | [Implement PDF, DOCX, and TXT Extraction Pipeline](github-issues/13-implement-pdf-docx-and-txt-extraction-pipeline.md) | Document Intelligence | Wave 3 | Backend/AI | Large |
| 14 | [Implement OCR and Document Quality Analysis](github-issues/14-implement-ocr-and-document-quality-analysis.md) | Document Intelligence | Wave 3 | AI/Backend | Large |
| 15 | [Implement Metadata, Version, and Conflict Agents](github-issues/15-implement-metadata-version-and-conflict-agents.md) | Document Intelligence | Wave 3 | AI/Full-stack | Large |
| 16 | [Implement Semantic Chunking, Embeddings, and Indexing](github-issues/16-implement-semantic-chunking-embeddings-and-indexing.md) | Search | Wave 3 | AI/Backend | Very Large |
| 17 | [Implement Processing Progress, Retry, Reprocess, and Admin UI](github-issues/17-implement-processing-progress-retry-reprocess-and-admin-ui.md) | Documents | Wave 3 | Full-stack | Large |
| 18 | [Implement Document Categories, Access Policies, and Permission UI](github-issues/18-implement-document-categories-access-policies-and-permission-ui.md) | Security/Documents | Wave 3 | Full-stack | Large |
| 19 | [Implement Intent Detection and Bilingual Query Expansion Agent](github-issues/19-implement-intent-detection-and-bilingual-query-expansion-agent.md) | RAG | Wave 4 | AI/Backend | Large |
| 20 | [Implement Tenant and Role Filtered Hybrid Retrieval](github-issues/20-implement-tenant-and-role-filtered-hybrid-retrieval.md) | RAG | Wave 4 | AI/Backend | Very Large |
| 21 | [Implement Reranking and Evidence Packaging](github-issues/21-implement-reranking-and-evidence-packaging.md) | RAG | Wave 4 | AI/Backend | Large |
| 22 | [Implement Answer Writer, Citation Verification, and Compliance Agents](github-issues/22-implement-answer-writer-citation-verification-and-compliance-agents.md) | RAG | Wave 4 | AI/Backend | Very Large |
| 23 | [Build Conversations, Streaming Chat, and Source Viewer](github-issues/23-build-conversations-streaming-chat-and-source-viewer.md) | Chat | Wave 4 | Full-stack | Very Large |
| 24 | [Implement Knowledge Gap Agent, Feedback, and Resolution Workflow](github-issues/24-implement-knowledge-gap-agent-feedback-and-resolution-workflow.md) | Knowledge | Wave 4 | AI/Full-stack | Large |
| 25 | [Implement Entitlement and Concurrency-Safe Quota Enforcement](github-issues/25-implement-entitlement-and-concurrency-safe-quota-enforcement.md) | Commercial | Wave 5 | Backend/Full-stack | Very Large |
| 26 | [Complete Super Admin Company, Package, and Subscription Operations](github-issues/26-complete-super-admin-company-package-and-subscription-operations.md) | Super Admin | Wave 5 | Full-stack | Large |
| 27 | [Complete Company Admin Dashboard, Settings, and Custom-Role UX](github-issues/27-complete-company-admin-dashboard-settings-and-custom-role-ux.md) | Company Admin | Wave 5 | Full-stack | Large |
| 28 | [Implement Token, Cost, Latency, Quality Analytics and Insight Agent](github-issues/28-implement-token-cost-latency-quality-analytics-and-insight-agent.md) | Analytics | Wave 5 | AI/Full-stack | Very Large |
| 29 | [Implement Billing Portal, Invoices, Cancellation, Reactivation, and Refunds](github-issues/29-implement-billing-portal-invoices-cancellation-reactivation-and-refunds.md) | Payments | Wave 5 | Full-stack | Large |
| 30 | [Build Production Platform, Quality Gates, Deployment, Backup, and Recovery](github-issues/30-build-production-platform-quality-gates-deployment-backup-and-recovery.md) | Production | Wave 5 | DevOps/QA | Very Large |

## Important Clarification

The waves define integration checkpoints, not coding dependencies. Work inside a wave is parallel-safe, and issues in later waves may also begin earlier when the team has capacity because every issue includes its own fake adapters and fixtures.

## Files

- `DOCUMIND_AI_DETAILED_GITHUB_ISSUES.md` — all 30 issues in one document.
- `github-issues/*.md` — one GitHub-ready file per issue.
- `ISSUE_EXECUTION_GUIDE.md` — workflow and review rules.
- `GITHUB_ISSUE_TEMPLATE.md` — reusable template for future issues.


---

# Issue Execution Guide

## Objective

The team uses feature-sized vertical issues instead of layer-sized micro-tasks. A model receives one complete issue and is responsible for the usable outcome across the layers needed by that feature.

## Delivery Model

```text
One feature issue
    → one owner
    → one branch
    → multiple commits
    → one pull request
    → one reviewable demonstration
```

Checklist lines are implementation work units, not separate GitHub issues.

## What “No Blocking Dependency” Means

A feature may logically consume another capability, but the developer must not wait for another branch. The issue defines a port and ships a fake adapter.

Examples:

- Chat uses a fake answer stream until live RAG is connected.
- Retrieval uses a frozen chunk corpus until indexing is connected.
- Answer agents use evidence-bundle fixtures until retrieval is connected.
- Excel import uses fake queue, permission, entitlement, mapping-agent, and email ports.
- Payments use a fake payment provider.
- Email uses a fake delivery provider and in-memory queue.
- Admin dashboards use fixture-backed service adapters instead of hardcoded UI data.
- Production infrastructure uses contract probes and fake external providers.

A fake adapter is acceptable for parallel development only when:

1. The domain interface is explicit and versioned.
2. Contract tests exist.
3. The UI and domain do not pretend the fake is production data.
4. The production adapter boundary is documented.
5. The issue still completes all behavior owned by that issue.

## Branch and Pull Request Rules

- Branch: use the branch name in the issue.
- One issue must not be split into model/controller/page/test PRs.
- Commits should represent meaningful internal steps.
- Draft PRs may be opened early.
- Avoid unrelated refactors and shared-file churn.
- Rebase or merge the integration branch at wave checkpoints, not after every commit.

## Coding Model Workflow

The model must:

1. Read the complete issue.
2. Inspect the current repository and tests.
3. Run `git status`.
4. Write a short file-level implementation plan.
5. Implement the vertical slice.
6. Add migrations/backfills when data changes.
7. Add unit, integration, security, and user-flow tests.
8. Run lint, typecheck, tests, and builds.
9. Update documentation.
10. Return an evidence-based report and `git status --short`.

The model must not:

- Assume the issue description exactly matches the latest code.
- Ask routine questions that can be resolved by repository inspection.
- Weaken authorization or tenant isolation to make tests pass.
- Use an agent/LLM decision as permission or deterministic execution.
- Insert production credentials.
- Leave placeholder pages or mocked metrics presented as complete.
- silently skip failing workspaces or tests.

## Review Checklist

A reviewer verifies:

- The feature provides user/product value, not only scaffolding.
- The backend is the authorization source of truth.
- Tenant IDs are derived from authenticated context.
- Cross-tenant and privilege-escalation tests exist.
- Failure, retry, stale-state, and duplicate-request behavior are explicit.
- Fake adapters have contract tests and are clearly labeled.
- API contracts and error codes are stable/documented.
- UI covers loading, empty, error, permission, success, responsive, RTL/LTR, and accessibility states.
- Logs/audit do not expose secrets or protected content.
- No unrelated code or generated junk is included.
- The demo and test commands in the PR are reproducible.

## Integration Checkpoint

At the end of each wave:

1. Freeze shared contracts.
2. Run all workspace checks.
3. Replace compatible fake adapters with available production adapters.
4. Run cross-feature contract tests.
5. Resolve schema/event version drift.
6. Run the wave's end-to-end demonstration.
7. Update implementation status and SRS/documentation drift.


---

# Issue 01 — Secure Repository Secrets and All-Workspace CI

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Foundation |
| Suggested owner | Platform/DevOps |
| Complexity | Medium |
| Branch | `feature/01-secure-repository-secrets-and-all-workspace-ci` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Make the repository security baseline and CI trustworthy across web, API, and worker.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- The repository contains web, API, and worker workspaces, but the root validation commands do not reliably validate all three.
- The worker currently fails type-checking because its dependency resolution is incomplete, while the root commands can still report success.
- Lint currently reports real errors and warnings, and Compose reads file-backed secrets from tracked repository paths.

## User and Product Outcomes

- Developers get one trustworthy command set that validates every workspace.
- CI fails whenever any application, worker, test suite, Docker image, or required configuration is broken.
- No secret value is committed, printed, copied into artifacts, or exposed in documentation.

## SRS Requirements Covered

- `NFR-SEC-003`
- `NFR-TEST-001`
- `NFR-OBS-001`

## Current Code Areas to Inspect First

- `package.json`
- `api/package.json`
- `app/package.json`
- `workers/package.json`
- `.github/workflows/ci.yml`
- `docker-compose.yml`
- `secrets/`
- `api/src/config/env.ts`
- `workers/src/structuredLogger.ts`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Inventory tracked and referenced secrets without printing their values. Replace real secret files with ignored runtime files and committed `.example` placeholders.
- [ ] Update `.gitignore`, Compose, environment examples, and bootstrap documentation so local development remains straightforward.
- [ ] Add fail-fast environment validation for production and test modes. Development defaults may be safe placeholders only where they cannot grant access.
- [ ] Make root `lint`, `typecheck`, `test`, and `build` scripts explicitly execute `app`, `api`, and `workers` and propagate non-zero exit codes.
- [ ] Remove invalid temporary source files, unresolved ESLint rules, stale suppressions, unused imports, and worker dependency failures.
- [ ] Add CI jobs for dependency installation, lint, typecheck, unit/integration tests, production builds, Docker image builds, and `docker compose config` validation.
- [ ] Upload useful test/build summaries while ensuring logs are redacted.
- [ ] Document credential rotation steps for any value that may previously have been committed.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Remove tracked secret material and document rotation
- [ ] Require managed/environment-provided secrets
- [ ] Fix worker dependency/build resolution
- [ ] Make root lint/typecheck/test/build include every workspace
- [ ] Add Docker image build checks
- [ ] Expose clear CI summaries

## Backend and Domain Implementation

- [ ] Repair the worker package manifest and lockfile resolution instead of using local undeclared modules.
- [ ] Ensure API environment validation distinguishes required secrets by environment and never silently falls back to unsafe production values.
- [ ] Add a small automated check that fails when known secret-file patterns or obvious credential values are committed.

### Recommended Code Ownership / Path Boundaries

- root package scripts and workspace manifests
- CI workflow(s)
- Dockerfiles/Compose
- environment validation and secret examples
- developer setup/CI documentation

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Validate required public environment variables at build/start time. Production must not silently use localhost API URLs.
- [ ] Keep client-exposed variables clearly separated from server-only secrets.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] No product database migration is expected.
- [ ] CI and environment contracts are the deliverables; do not change business schemas.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Never read or echo actual secret contents in the PR description, test snapshots, terminal output, or generated documentation.
- [ ] Rotate potentially exposed credentials outside code, then document only the rotation procedure and secret names.
- [ ] Use least-privileged CI credentials and protected environments for future deployment jobs.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Missing required production variables must stop startup with a clear variable-name-only error.
- [ ] A broken worker, skipped workspace, or failed Docker build must make CI red.
- [ ] Tests that are intentionally unavailable must be reported as skipped with a reason, not silently omitted.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Intentionally break a harmless worker type and prove the root typecheck fails, then revert.
- [ ] Verify all workspace scripts are listed and executed.
- [ ] Run lint, typecheck, tests, builds, Docker builds, and Compose config validation.
- [ ] Add tests for environment validation and redaction.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] CI output must show per-workspace status and durations.
- [ ] Do not include environment values in logs; log only key names and validation categories.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] This issue owns repository tooling, CI, manifests, environment examples, and secret-loading infrastructure only.
- [ ] It must not refactor product modules.
- [ ] Other feature branches may rely on the final root commands but do not need this issue merged to develop locally.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Deploying the product to a production hosting provider.
- Choosing an LLM, payment, storage, or email vendor.
- Changing feature behavior.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] All three workspaces fail CI when broken
- [ ] No real secret value exists in tracked files or logs
- [ ] Worker typecheck and build pass
- [ ] Lint errors are resolved
- [ ] CI documentation matches actual commands

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 02 — Implement Real Custom Roles and Permission Engine

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Security |
| Suggested owner | Backend/Security |
| Complexity | Large |
| Branch | `feature/02-implement-real-custom-roles-and-permission-engine` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Replace label-only custom roles with explicit tenant-scoped permission bundles.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- The system uses exactly three base roles: `SUPER_ADMIN`, `COMPANY_ADMIN`, and `EMPLOYEE`.
- Existing custom roles store a name and base role but do not carry enforceable permissions.
- Backend authorization currently checks broad base roles, so custom role names do not change what a user can actually do.

## User and Product Outcomes

- A Company Admin can create meaningful tenant-scoped roles such as HR Manager, Document Manager, Billing Viewer, or Knowledge Manager.
- Permissions are enforced by backend services, not merely hidden in the UI.
- Employees retain least-privilege defaults unless an explicit custom role grants additional capabilities.

## SRS Requirements Covered

- `FR-RBAC-003`
- `FR-RBAC-004`
- `FR-RBAC-005`
- `FR-RBAC-006`

## Current Code Areas to Inspect First

- `api/src/db/models/role.model.ts`
- `api/src/modules/roles/`
- `api/src/modules/users/users.service.ts`
- `api/src/common/middlewares/authorization.middleware.ts`
- `app/src/app/(dashboard)/dashboard/roles/`
- `app/src/components/auth/app-navigation.tsx`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define a canonical permission catalog grouped by users, roles, documents, chat, analytics, knowledge gaps, company settings, billing, imports, and audit.
- [ ] Keep the three base roles unchanged. A custom role refines tenant capabilities and must never create platform-level Super Admin access.
- [ ] Extend the role schema with normalized permission identifiers, optional scopes, status, version, createdBy, updatedBy, and timestamps.
- [ ] Support optional scopes for department IDs, document categories/classifications, and self-only access. Scope semantics must be deterministic and documented.
- [ ] Create a `PermissionEvaluator`/`AuthorizationService` interface that resolves base-role defaults plus active custom-role grants.
- [ ] Implement permission-aware middleware or service guards that accept a permission identifier and resource context.
- [ ] Add role CRUD, assignment, archive, clone, and usage-count behavior. Prevent deleting a role while assigned unless users are migrated.
- [ ] Prevent a Company Admin from granting permissions they are not authorized to delegate.
- [ ] Provide a migration path from current label-only roles. Existing users must retain safe access and no one should gain new permissions accidentally.
- [ ] Create a Company Admin role editor with searchable permission groups, scope selectors, assigned-user counts, and clear warnings.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Define permission catalog
- [ ] Extend role schema with permissions and scopes
- [ ] Implement permission resolver and authorizePermission middleware
- [ ] Prevent privilege escalation
- [ ] Add role assignment APIs and UI
- [ ] Add audit and tests

## Backend and Domain Implementation

- [ ] Proposed modules: permission catalog, permission resolver, role repository/service, role assignment service, and authorization middleware.
- [ ] Resolve permissions on every protected operation; UI checks are convenience only.
- [ ] Cache permission resolution only with a clear invalidation strategy on role updates/assignments.
- [ ] Return stable denial codes such as `PERMISSION_REQUIRED`, `SCOPE_MISMATCH`, and `ROLE_NOT_ASSIGNABLE`.

### Recommended Code Ownership / Path Boundaries

- permission catalog and resolver module
- role model/repository/service/routes
- authorization middleware
- Company Admin role editor
- migration/backfill and tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Build role list, create/edit, details, assignment, archive/delete confirmation, and permission-preview states.
- [ ] Hide or disable actions according to resolved permissions, but still handle backend 403 responses.
- [ ] Explain inherited base-role access separately from explicit custom-role grants.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Document proposed role fields and indexes, including tenant-scoped unique normalized name and active/status indexes.
- [ ] Expose a read-only permission-catalog endpoint and tenant role CRUD/assignment endpoints.
- [ ] Responses must not expose permissions from another tenant.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Never allow a tenant role to grant `SUPER_ADMIN` platform capabilities.
- [ ] Prevent privilege escalation through crafted requests, stale role IDs, cross-tenant role IDs, or scope tampering.
- [ ] Audit role creation, permission changes, assignments, removals, archive, and failed escalation attempts.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Reject unknown or deprecated permission identifiers.
- [ ] Reject role assignment to users from another tenant.
- [ ] Return a conflict when deleting an assigned role without an explicit migration plan.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Unit-test permission merge, deny precedence, and scope evaluation.
- [ ] Integration-test each role endpoint and assignment flow with tenant isolation.
- [ ] Security-test escalation, cross-tenant IDs, direct endpoint calls, and stale cached permissions.
- [ ] Frontend-test permission editor, inherited-vs-explicit display, and denial handling.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Record authorization denials with tenant, actor, permission, resource type, and safe reason, without sensitive document content.
- [ ] Measure permission-evaluation latency and cache hit rate if caching is used.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Define and export a stable `PermissionEvaluator` contract plus an in-memory/fake evaluator.
- [ ] Other issues may integrate against that interface before the real resolver is merged.
- [ ] Do not change document/user route policy in this issue; Issue 03 consumes the contract.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Adding a fourth base role or a `COMPANY_OWNER` role.
- Building attribute-based policies beyond the documented scopes.
- Changing payment or document business logic.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Only three base roles exist
- [ ] Custom permissions are enforced by backend
- [ ] EMPLOYEE defaults remain least privilege
- [ ] A tenant cannot grant SUPER_ADMIN capabilities
- [ ] Cross-tenant and escalation tests pass

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 03 — Harden Company User and Document Authorization

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Security |
| Suggested owner | Full-stack |
| Complexity | Large |
| Branch | `feature/03-harden-company-user-and-document-authorization` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Correct broad employee access and enforce resource-level authorization.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Current API guards allow an employee to list tenant users and to patch/delete tenant documents.
- Tenant boundaries are generally present, but resource-level and permission-level rules are too coarse.
- The frontend hides some navigation by role, but backend policy remains the source of truth.

## User and Product Outcomes

- A default employee can use allowed chat/document-reading capabilities without gaining administrative access.
- A Company Admin or authorized custom role can manage users/documents only within permitted scope.
- A tenant can never be left without an active Company Admin.

## SRS Requirements Covered

- `FR-RBAC-001`
- `FR-RBAC-002`
- `FR-RBAC-007`
- `FR-RBAC-008`

## Current Code Areas to Inspect First

- `api/src/modules/users/users.routes.ts`
- `api/src/modules/users/users.service.ts`
- `api/src/modules/documents/documents.routes.ts`
- `api/src/modules/documents/documents.service.ts`
- `api/src/common/middlewares/tenantScoping.middleware.ts`
- `app/src/app/(dashboard)/dashboard/users/`
- `app/src/app/(dashboard)/dashboard/documents/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Write an explicit authorization matrix for user-listing, invitation, update, suspend, delete, role assignment, document read/download/upload/update/delete/reprocess, and access-policy changes.
- [ ] Default `EMPLOYEE` must not list the full tenant directory unless granted `users.read`; provide a self/profile path separately.
- [ ] Default `EMPLOYEE` must not upload, patch, delete, reprocess, or change access on documents.
- [ ] Add resource checks for ownership, department, category, classification, explicit grants, and document status where relevant.
- [ ] Protect self-destructive operations and prevent deletion/deactivation/demotion of the last active Company Admin.
- [ ] Enforce consistent filtering: listing endpoints must return only resources the actor may see, not fetch all and hide client-side.
- [ ] Create stable authorization error codes and user-friendly frontend messages.
- [ ] Update navigation, buttons, row actions, bulk actions, and direct-route guards to reflect permissions.
- [ ] Audit sensitive grants, denials, document mutations, and user lifecycle changes.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Restrict employee user listing
- [ ] Restrict document mutation to granted permissions
- [ ] Define ownership/department/classification rules
- [ ] Protect last active Company Admin
- [ ] Add frontend visibility rules
- [ ] Add abuse tests

## Backend and Domain Implementation

- [ ] Introduce resource-policy functions that receive authenticated tenant/user context and a `PermissionEvaluator` interface.
- [ ] Apply checks before repository reads where possible and always before writes.
- [ ] Use atomic/transactional checks for last-admin protections to avoid race conditions.
- [ ] Review response DTOs to minimize employee-visible personal data.

### Recommended Code Ownership / Path Boundaries

- user/document services and routes
- resource policy module
- frontend route/action guards
- authorization error mapping
- security/integration tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Do not render unavailable administrative navigation or actions.
- [ ] Handle stale permission changes: on a backend 403, refresh the current user's authorization context and show an explanatory message.
- [ ] Add permission-aware empty states rather than showing broken tables.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Existing schemas may be extended with department, owner, classification, and access-policy references only where required by the policy.
- [ ] Document endpoint authorization and stable error responses in API docs.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Tenant ID must come only from authenticated context.
- [ ] Test IDOR attempts using valid IDs from another tenant and resources outside the actor's scope.
- [ ] Do not rely on custom-role names; use resolved permission IDs.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Return 403 for authenticated-but-forbidden operations, 404 where revealing resource existence would be unsafe, and 409 for last-admin conflicts.
- [ ] Bulk operations must report per-item denials without partially applying unauthorized changes.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Matrix tests for each base role and representative custom roles.
- [ ] Cross-tenant and same-tenant out-of-scope IDOR tests.
- [ ] Concurrency test for two simultaneous last-admin demotion/deletion attempts.
- [ ] Frontend tests for hidden actions and backend-denial recovery.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Emit structured authorization-denied and protected-resource-change audit events.
- [ ] Track repeated forbidden attempts for security monitoring without leaking target data.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume `PermissionEvaluator` through an interface; ship a local deterministic stub if Issue 02 is not yet merged.
- [ ] Keep policy logic isolated so the real resolver can replace the stub without route rewrites.
- [ ] Do not redesign the entire custom-role editor.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Building the full role-management UX owned by Issue 02/27.
- Document parsing, RAG, or storage migration.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Default employees cannot list all users or mutate documents
- [ ] Authorized custom roles can perform allowed actions
- [ ] Every denial returns a stable error code
- [ ] Cross-tenant attempts fail
- [ ] UI does not show unavailable actions

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 04 — Normalize Package and Subscription Domain — ✅ IMPLEMENTED (2026-07-17)

> **STATUS: COMPLETE** — All functional requirements, domain services, public DTO, Super Admin UI, registration integration, provider-neutral ports, and migration tooling are implemented. See detailed notes below.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Commercial |
| Suggested owner | Backend/Product |
| Complexity | Large |
| Branch | `feature/04-normalize-package-and-subscription-domain` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Create a single coherent package/subscription source of truth.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Package CRUD, public package retrieval, manual subscription assignment, and tenant plan fields exist.
- Registration stores a selected package code but does not create a complete subscription lifecycle.
- Tenant plan, package code, and subscription records can diverge, and stored limits are not yet enforced.

## User and Product Outcomes

- Every tenant has one authoritative subscription projection tied to a versioned package.
- Public pricing, registration, Super Admin views, billing flows, and entitlement checks consume the same normalized domain.
- Local development works without a real payment provider.

## SRS Requirements Covered

- `FR-PAY-001`
- `FR-PAY-004`

## Current Code Areas to Inspect First

- `api/src/db/models/package.model.ts`
- `api/src/db/models/subscription.model.ts`
- `api/src/db/models/tenant.model.ts`
- `api/src/modules/platform/platform.service.ts`
- `api/src/modules/auth/auth.service.ts`
- `app/src/app/(public)/page.tsx`
- `app/src/app/(auth)/register/`
- `app/src/app/(dashboard)/super-admin/packages/`
- `app/src/app/(dashboard)/super-admin/subscriptions/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define package identity, immutable version snapshots, public visibility, status, monthly/annual prices, currency, trial rules, entitlements, limits, supported models, analytics level, retention, and support level.
- [ ] Define subscription states including `TRIALING`, `INCOMPLETE`, `ACTIVE`, `PAST_DUE`, `PAUSED`, `CANCEL_AT_PERIOD_END`, `CANCELED`, `EXPIRED`, and `UNPAID`.
- [ ] Define provider-neutral fields for customer/subscription/price IDs, period dates, cancellation, trial, payment state, and provider metadata.
- [ ] Make the subscription projection the authoritative tenant commercial state; remove or safely derive duplicated tenant plan strings.
- [ ] Create a default/free package strategy and a deterministic registration outcome when no package is selected.
- [ ] On registration, create an initial local subscription/trial record using an idempotent domain service, without requiring payment checkout.
- [ ] Version package changes so existing subscriptions retain the agreed snapshot until explicitly migrated.
- [ ] Expose sanitized public package DTOs and richer Super Admin DTOs.
- [ ] Provide migration/backfill tooling with dry-run, idempotency, and rollback documentation.
- [ ] Update public pricing, registration selection, Super Admin package/subscription pages, and company billing summary.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Normalize package fields and versions
- [ ] Add monthly/annual pricing and entitlements
- [ ] Define subscription states and provider fields
- [ ] Migrate tenant plan references safely
- [ ] Add default package behavior
- [ ] Update admin/public UI and tests

## Backend and Domain Implementation

- [ ] Create domain services for package versioning, subscription projection, registration assignment, and provider-neutral state transitions.
- [ ] Do not put provider-specific webhook logic here; define interfaces/events used by Issues 10 and 29.
- [ ] Validate money using integer minor units and ISO currency codes.

### Recommended Code Ownership / Path Boundaries

- package/subscription domain models and services
- registration subscription provisioning
- public/admin DTOs and forms
- migration/backfill
- domain tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Display monthly/annual prices, visible features, limits, trial information, and package status from real APIs.
- [ ] Registration must preserve the selected package and clearly explain whether checkout happens now or after verification.
- [ ] Super Admin forms must warn when editing a package would create a new version.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Document package and subscription schemas, indexes, unique constraints, and snapshot fields.
- [ ] Define provider-neutral APIs/events such as `SubscriptionProvisioningPort` and `EntitlementSnapshot`.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Only Super Admin may create/change platform packages.
- [ ] Company users must see only their own subscription and public package data.
- [ ] Audit package-version creation and manual subscription overrides.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Reject invalid currency/price/limit combinations.
- [ ] Handle unknown or inactive selected package codes without creating a partial tenant.
- [ ] Return stable conflicts for duplicate subscription projection or invalid state transition.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Domain transition tests and package version snapshot tests.
- [ ] Registration tests with selected/default/inactive packages.
- [ ] Migration dry-run and idempotency tests.
- [ ] Public DTO leakage tests and cross-tenant subscription access tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Emit package-version, subscription-created, subscription-state-changed, and manual-override events.
- [ ] Correlate registration-created subscriptions with tenant and request trace IDs.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Publish provider-neutral package/subscription types and fake repositories/providers.
- [ ] Payment issues can implement against these contracts without waiting for the database migration to merge.
- [ ] Quota enforcement consumes immutable entitlement snapshots, not package collections directly.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Real checkout, payment webhooks, invoices, refunds, or billing portal.
- Actual quota enforcement.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Tenant plan cannot diverge from subscription projection
- [ ] Public packages expose approved fields only
- [ ] Package versions are auditable
- [ ] Existing tenants retain a valid assignment
- [ ] No payment provider is required for local domain tests

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.

## ✅ Completion Notes (2026-07-17)

Issue 04 has been fully implemented. Key deliverables:

### Backend: Billing domain module (`api/src/modules/billing/`)
- **FR-PAY-001 (Granular entitlements):** Package model with 8 entitlement fields, annual/monthly pricing, trial days, visibility, supported models, analytics level, retention days, support level.
- **Package versioning:** Version=1 on create, version bump + immutable snapshot on update, `PackageSnapshot` type for immutable projections.
- **FR-PAY-004 (Provider-neutral ports):** `SubscriptionProvisioningPort` + `EntitlementSnapshotPort` with fake adapters and contract tests.
- **9-state subscription lifecycle:** `SubscriptionStatus` type with legal transition rules enforced by `transitionSubscription`. All 9 states: TRIALING, INCOMPLETE, ACTIVE, PAST_DUE, PAUSED, CANCEL_AT_PERIOD_END, CANCELED, EXPIRED, UNPAID.
- **Registration integration:** `registerTenantAndAdmin` calls `provisionSubscription` (idempotent, creates TRIALING subscription with selected/default free package). Free package auto-bootstraps if absent.
- **Public DTO:** `PublicPackageDTO` exposes only safe fields. Internal entitlement fields (admins, fileSizeMb, tokensPerMonth, ocrPagesPerMonth) and version history are excluded.

### Platform / Super Admin (`api/src/modules/platform/`)
- Package CRUD endpoints accept FR-PAY-001 fields (`annualPrice`, `trialDays`, `visibility`, `supportedModels`, `analyticsLevel`, `retentionDays`, `supportLevel`).
- Subscription transitions expose all 9 states with legal validation.
- Super Admin UI pages for package management, subscription oversight, and public pricing toggle.

### Frontend (`app/`)
- Super Admin package form with granular entitlements, annual pricing, trial days, visibility toggle.
- Public pricing toggle on landing page.
- Registration UI preserves package selection.

### Tests
- Public route DTO test (no internal field leakage, active+public filter).
- FR-PAY-001 schema field validation tests.
- Package version bump + snapshot tests.
- 9-state subscription status and transition tests.
- Auth integration test verifying registration creates TRIALING subscription.

### Migration scripts
- `api/src/scripts/migrate-subscriptions.ts` — backfill subscriptions for existing tenants.
- `api/src/scripts/seed-default-package.ts` — seed default package catalog.

### Limitations (explicitly outside Issue 04 scope)
- No real payment provider (Stripe/PayPal) — Issue 10.
- Tenant `plan` string is deprecated but still present for backward compat.
- No quota enforcement middleware — Issue 25.
- No auto-expiry/renewal/cancel cron jobs.
- No billing portal, invoices, or refunds — Issue 29.

---

# Issue 05 — Build Functional Worker Runtime and Queue Contract

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Infrastructure |
| Suggested owner | Backend/DevOps |
| Complexity | Large |
| Branch | `feature/05-build-functional-worker-runtime-and-queue-contract` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Turn the worker scaffold into a real resilient queue runtime.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- The worker exposes health endpoints but has no product job runtime, no queue consumer, and incomplete dependencies.
- Document uploads do not enqueue processing jobs.
- Readiness currently does not prove Redis, MongoDB, or registered workers are usable.

## User and Product Outcomes

- Any feature can enqueue a versioned, traceable, idempotent background job through a stable interface.
- Workers report honest readiness, retry transient failures, preserve failed jobs, and shut down cleanly.
- Feature teams can use an in-memory queue adapter while developing in parallel.

## SRS Requirements Covered

- `NFR-REL-001`
- `NFR-PERF-002`
- `NFR-SCALE-001`

## Current Code Areas to Inspect First

- `workers/src/index.ts`
- `workers/src/health.ts`
- `workers/package.json`
- `docker-compose.yml`
- `api/src/modules/processing/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Choose and document the approved queue implementation; BullMQ/Redis is the expected default unless repository constraints require an equivalent.
- [ ] Create a versioned job envelope containing job type, schema version, tenant ID, actor ID, trace ID, idempotency key, payload, createdAt, and optional priority/schedule.
- [ ] Build queue producer and consumer abstractions so product modules do not import vendor APIs directly.
- [ ] Create a registry for typed job handlers with runtime validation.
- [ ] Connect worker to Redis and MongoDB using validated environment configuration.
- [ ] Implement deterministic idempotency helpers, retry/backoff classification, timeout, cancellation, failed-job retention, and dead-letter/replay tooling.
- [ ] Implement dependency-aware liveness/readiness and graceful shutdown on SIGTERM/SIGINT.
- [ ] Add a sample no-business-impact job to prove enqueue, execute, retry, duplicate suppression, and tracing.
- [ ] Expose safe queue metrics and a Super Admin-readable status adapter.
- [ ] Update Docker Compose and local commands so API and worker can be run and tested together.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Install/configure approved queue dependencies
- [ ] Connect Redis and MongoDB
- [ ] Define versioned job envelope
- [ ] Add health/readiness based on dependencies
- [ ] Add retry/dead-letter/idempotency helpers
- [ ] Add graceful shutdown and tests

## Backend and Domain Implementation

- [ ] API should publish through a `JobDispatcher` port.
- [ ] Worker handlers must revalidate tenant/resource identifiers and never trust payload authorization blindly.
- [ ] Use schemas shared through a small contracts package or a versioned module without creating circular workspace dependencies.

### Recommended Code Ownership / Path Boundaries

- queue contracts package/module
- API dispatcher adapter
- worker bootstrap/registry
- health/readiness/metrics
- Compose and integration tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] No product UI is required, but expose a minimal internal/Super Admin diagnostic view or API contract for queue health if consistent with existing platform pages.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define job-status DTOs and optional persisted execution records if BullMQ retention alone is insufficient for audit/history.
- [ ] Do not couple product-specific processing fields to the generic envelope.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Do not place secrets or raw document content in job IDs/logs.
- [ ] Restrict job inspection/replay/cancel APIs to Super Admin or explicitly authorized Company Admin contexts.
- [ ] Validate payload schemas and cap size.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Classify retryable vs permanent errors.
- [ ] Readiness must fail when required dependencies or handler registration are unavailable.
- [ ] Duplicate dispatch with the same idempotency key must not execute twice.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Unit tests for envelope validation, handler registry, retry policy, and idempotency.
- [ ] Integration tests with disposable Redis and MongoDB.
- [ ] Shutdown tests proving in-flight job behavior.
- [ ] Contract tests for in-memory and production queue adapters.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Log enqueue/start/progress/success/failure/retry/dead-letter with the same trace ID.
- [ ] Publish queue depth, active, delayed, retry, failed, and processing duration metrics.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Ship a `JobDispatcher` interface and in-memory implementation first.
- [ ] Product issues may create their own typed jobs against this port before the real worker is merged.
- [ ] Do not implement document, email, import, or payment jobs here.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Product-specific processors.
- Vendor dashboards as a required dependency.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Worker typechecks, tests, and builds
- [ ] Readiness fails when dependencies are unavailable
- [ ] A sample idempotent job executes and retries safely
- [ ] Queue metrics are exposed
- [ ] No product-specific job is required

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 06 — Create Unified Observability and Audit Foundation

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Operations |
| Suggested owner | Backend/Platform |
| Complexity | Large |
| Branch | `feature/06-create-unified-observability-and-audit-foundation` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Correlate requests, jobs, agents, payments, and emails with reliable audit events.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- The API has structured logging and some audit records, but coverage is inconsistent.
- Usage logs are too sparse for agent, billing, email, queue, RAG, or detailed cost analytics.
- There is no unified trace context spanning HTTP requests, jobs, agents, tools, provider calls, and frontend errors.

## User and Product Outcomes

- Developers and administrators can trace one user action across API, queue, agent, email, payment, and storage events.
- Audit records answer who did what, to which resource, under which tenant, and whether it succeeded.
- Sensitive content and credentials are redacted by default.

## SRS Requirements Covered

- `FR-AUD-001`
- `FR-AGT-006`
- `NFR-OBS-001`

## Current Code Areas to Inspect First

- `api/src/common/logger/`
- `api/src/common/middlewares/requestContext.middleware.ts`
- `api/src/db/models/auditLog.model.ts`
- `api/src/db/models/usageLog.model.ts`
- `api/src/modules/platform/platform.service.ts`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define a common correlation context with trace ID, request ID, tenant ID, actor ID, session ID, job ID, agent run ID, and provider event ID where applicable.
- [ ] Create an immutable audit-event schema covering authentication, users, roles, documents, permissions, imports, emails, agents, payments, subscriptions, settings, and destructive actions.
- [ ] Create a technical event/metric interface separate from compliance audit records.
- [ ] Propagate trace context through HTTP, queue envelopes, agent tools, provider adapters, and webhook handlers.
- [ ] Define redaction rules for tokens, passwords, secrets, email bodies, document text, card/payment data, and PII.
- [ ] Add structured error serialization and safe error codes without dumping stack traces to clients.
- [ ] Implement retention and access-control rules for logs, traces, and audit exports.
- [ ] Expose query APIs and initial Super Admin/Company Admin audit views consistent with permission scope.
- [ ] Provide local adapters and interfaces for future observability vendors; do not lock the domain to a vendor SDK.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Define correlation context
- [ ] Create typed audit event catalog
- [ ] Create trace/metrics interfaces
- [ ] Add request/job logging middleware
- [ ] Create admin audit query UI
- [ ] Add redaction and retention tests

## Backend and Domain Implementation

- [ ] Centralize context creation/propagation in middleware and worker/agent adapters.
- [ ] Create typed audit action names and resource metadata rather than arbitrary strings.
- [ ] Ensure audit writes do not silently block critical business actions; define failure policy and alerting.

### Recommended Code Ownership / Path Boundaries

- trace context middleware
- audit/event schemas and writers
- redaction/error serialization
- audit APIs/UI
- telemetry contract tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Add safe error correlation IDs to user-facing error states.
- [ ] Create audit list/detail/filter/export UX only for authorized roles.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Document audit/event schemas, indexes for tenant/time/action/resource, and retention.
- [ ] Provide pagination/date/action/actor/resource filters.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Audit access itself must be permission-protected and audited.
- [ ] Redact before persistence, not only at display time.
- [ ] Prevent tenant-scoped users from querying platform-global audit events.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Telemetry backend failure must not leak secrets or crash unrelated requests, but critical audit loss must be surfaced.
- [ ] Reject unbounded export queries.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Trace propagation from HTTP to fake job and fake agent tool.
- [ ] Redaction snapshot tests.
- [ ] Tenant/audit access tests.
- [ ] Failure-policy tests for unavailable telemetry/audit stores.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] This issue defines the observability foundation itself; provide dashboards/queries for event volume, errors, and missing correlation.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Publish `TraceContext`, `AuditWriter`, `MetricRecorder`, and fake/in-memory adapters.
- [ ] Other issues can emit events immediately without waiting for the final persistence/UI.
- [ ] Do not build domain-specific analytics calculations.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Full AI quality analytics, billing revenue dashboards, or security automation agents.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Every request can produce a correlation ID
- [ ] Sensitive values are redacted
- [ ] Audit events are tenant-aware
- [ ] Platform events can be queried by Super Admin
- [ ] Feature modules can emit events through a stable interface

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 07 — Complete Authentication E2E, Sessions, and 429 UX

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Authentication |
| Suggested owner | Full-stack/QA |
| Complexity | Large |
| Branch | `feature/07-complete-authentication-e2e-sessions-and-429-ux` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Make account lifecycle browser-verifiable and operationally reliable.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Registration, email verification, tenant login, Super Admin login, refresh rotation, logout, password reset, and invitation set-password flows exist.
- Coverage is mostly unit/source-based; full browser and live Mongo/Redis/SMTP-like integration is limited.
- Login 429 handling is generic, logout-all is absent, and registration transaction fallback may retry too broadly.

## User and Product Outcomes

- All account lifecycle flows work reliably across browsers and tenants.
- Users receive clear, safe messages for invalid credentials, expired tokens, rate limits, and session revocation.
- Security-sensitive session and registration behavior is proven by integration and E2E tests.

## SRS Requirements Covered

- `FR-AUTH-001..008`

## Current Code Areas to Inspect First

- `api/src/modules/auth/`
- `api/src/db/models/refreshToken.model.ts`
- `app/src/lib/api-client.ts`
- `app/src/providers/auth-provider.tsx`
- `app/src/app/(auth)/`
- `app/src/components/auth/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Create end-to-end coverage for registration, verification, resend, tenant login, Super Admin login, refresh, concurrent refresh, logout, logout-all, forgot/reset password, invite validation, and set-password.
- [ ] Add logout-all sessions endpoint and UI action; revoke all refresh families for the user/tenant context.
- [ ] Restrict registration's non-transaction fallback to confirmed unsupported-transaction environments and make tenant/admin creation idempotent.
- [ ] Ensure duplicate emails across tenants work, while duplicate email within one tenant is rejected.
- [ ] Standardize token invalid/expired/used/revoked states and pages.
- [ ] Expose safe rate-limit retry metadata and implement a visible countdown/retry state for HTTP 429 without revealing account existence.
- [ ] Prevent authenticated users from revisiting guest auth pages and remove duplicate session-bootstrap logic.
- [ ] Add session-security UI for current session and logout-all; full device management may remain deferred.
- [ ] Verify cookie, SameSite, CORS, HTTPS, and CSRF assumptions for the chosen deployment topology.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Add logout-all
- [ ] Add full DB integration tests
- [ ] Add SMTP test adapter
- [ ] Test verification/invite/reset/session reuse
- [ ] Remove duplicate guest bootstrap logic
- [ ] Implement Retry-After aware 429 UI

## Backend and Domain Implementation

- [ ] Use real disposable MongoDB/Redis in integration tests and a captured/fake SMTP provider for email links.
- [ ] Preserve hashed one-time tokens and refresh rotation/reuse detection.
- [ ] Return stable error codes and optional safe `retryAfterSeconds`.

### Recommended Code Ownership / Path Boundaries

- auth service/controller/routes
- refresh/session repository
- auth provider/API client/guest guards
- auth pages and 429 UX
- integration/browser tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Implement loading, success, invalid, expired, used, rate-limited, and network-failure states for every auth page.
- [ ] Use one shared auth bootstrap/guest guard path.
- [ ] Never persist access tokens in localStorage.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Add any session-revocation indexes or fields required for logout-all, with migration/backfill if needed.
- [ ] Document exact auth request/response/error contracts.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Do not reveal whether an email exists in forgot-password/resend responses.
- [ ] Test token substitution between tenants and slugs.
- [ ] Test refresh reuse and concurrent requests.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Network interruption after registration/verification must be recoverable without duplicate tenant creation.
- [ ] 429 UI must not auto-loop requests.
- [ ] Expired and already-used tokens need distinct safe recovery actions.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] API integration tests with real stores.
- [ ] Browser E2E across desktop/mobile viewport.
- [ ] Cookie/CORS deployment configuration tests.
- [ ] Abuse tests for brute force, token replay, cross-tenant reset, and concurrent refresh.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Audit registration, verification, login success/failure category, refresh reuse, logout-all, reset, invite activation, and rate-limit events.
- [ ] Never log passwords or token values.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Use a fake mail-capture adapter and existing auth APIs; no dependency on the new email queue.
- [ ] Do not redesign employee management or custom roles.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- SSO, MFA, social login, or full device-session management.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] All auth flows pass browser E2E
- [ ] Same email across tenants behaves correctly
- [ ] Tokens are one-time and tenant-bound
- [ ] Logout-all revokes active sessions
- [ ] 429 state is understandable and recoverable

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 08 — Complete Secure Document Management and Storage Adapter

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Documents |
| Suggested owner | Full-stack |
| Complexity | Large |
| Branch | `feature/08-complete-secure-document-management-and-storage-adapter` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Deliver secure document CRUD independent of the processing pipeline.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Basic PDF/DOCX/TXT upload, local-file storage, list, metadata patch, and delete routes exist.
- Validation currently relies heavily on MIME type, storage is local/split across paths, and download/version/reprocess/security features are incomplete.
- Employees currently have overly broad mutation access.

## User and Product Outcomes

- Authorized users can safely upload, inspect, download, replace, archive, and delete documents.
- Production storage is private and provider-neutral, while local development remains simple.
- Document lifecycle data is ready for later processing without implementing extraction in this issue.

## SRS Requirements Covered

- `FR-DOC-001..006`

## Current Code Areas to Inspect First

- `api/src/modules/documents/`
- `api/src/db/models/document.model.ts`
- `api/src/providers/storage/`
- `app/src/app/(dashboard)/dashboard/documents/`
- `app/src/services/documents.service.ts`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define a `StorageProvider` contract with local development and private object-storage-compatible implementations.
- [ ] Validate extension, MIME, file signature/magic bytes, size, filename, zero-byte content, and tenant entitlement through interfaces.
- [ ] Add a malware/security scan adapter and quarantine state; local tests may use a deterministic fake scanner.
- [ ] Store immutable original file metadata including checksum, storage key, original filename, size, type, uploader, tenant, and created time.
- [ ] Support document metadata, category, department, classification, owner, effective/expiry dates, version label, and status.
- [ ] Implement authorized download using short-lived signed access or streamed API response; never expose raw server paths.
- [ ] Implement replace/new-version, archive, restore, soft delete, and permanent-delete retention rules.
- [ ] Prevent duplicate accidental uploads using checksum warnings while allowing intentional new versions.
- [ ] Provide list/detail/search/filter/sort/pagination and clear processing/security status even though processing is not implemented here.
- [ ] Update frontend upload, list, detail drawer/page, version history, download, archive/delete confirmation, and error states.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Add object-storage interface and local test adapter
- [ ] Add signature/checksum validation
- [ ] Add private download
- [ ] Add versions, replace, archive, metadata
- [ ] Add search/filter/pagination
- [ ] Add responsive UI and security tests

## Backend and Domain Implementation

- [ ] Separate storage operations from document repository transactions and define compensation when one succeeds and the other fails.
- [ ] Use permission/access-policy ports so this issue can run with a fake evaluator.
- [ ] Emit a generic `DocumentUploaded` domain event/job request port but do not implement parsing.

### Recommended Code Ownership / Path Boundaries

- storage/security-scan adapters
- document/version models/services/routes
- upload/download/version APIs
- document UI
- security/provider contract tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Show upload validation before submission where possible, progress, quarantine/security errors, metadata forms, and version history.
- [ ] Do not display mutation controls without permission.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define document/version/storage schema and indexes.
- [ ] Add endpoints for upload, list, detail, metadata, download, replace, archive/restore, delete, and versions.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Private-by-default storage, sanitized filenames, no path traversal, no public bucket URLs, and strict tenant/resource authorization.
- [ ] Cap decompression/archive behavior; unsupported archives should be rejected unless explicitly supported.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle storage timeout, database failure after upload, duplicate checksum, scan rejection, quota denial, and interrupted replacement.
- [ ] Compensation must remove orphaned objects or mark them for cleanup.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Signature-vs-extension mismatch, oversized/empty file, path traversal, malicious fake scan, cross-tenant download, unauthorized mutation.
- [ ] Storage provider contract tests and compensation tests.
- [ ] Responsive frontend upload/list/detail tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Audit upload, download, metadata change, version replacement, archive, restore, deletion, and scan result.
- [ ] Record storage latency and failures without logging file content.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Publish `StorageProvider`, `SecurityScanner`, `EntitlementChecker`, and `DocumentProcessingDispatcher` interfaces with fakes.
- [ ] Do not wait for queue, quota, permission, or object-storage issues; use adapters and contract tests.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Text extraction, OCR, chunking, embeddings, or vector indexing.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Files are tenant-isolated and private
- [ ] Duplicate uploads are detected
- [ ] Authorized users can download/version/replace
- [ ] Employees follow permission policy
- [ ] Processing may remain mocked behind a stable interface

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 09 — Build AI-Assisted Excel Employee Import, Confirmation, and Execution

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Employee Onboarding |
| Suggested owner | Full-stack |
| Complexity | Large |
| Branch | `feature/09-build-ai-assisted-excel-employee-import-confirmation-and-execution` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Deliver the complete AI-assisted employee spreadsheet import lifecycle: template, mapping, deterministic validation, admin confirmation, asynchronous execution, invitation dispatch, progress, row-level recovery, and reports.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- No XLSX/CSV import dependency, template, preview, persistent batch, queue execution, row history, report, or retry workflow currently exists.
- Employee invitation exists for single users, and future email delivery will be exposed through a port.

## User and Product Outcomes

- A Company Admin can download a template, upload an Excel sheet, approve column mapping, review deterministic validation, confirm the import, track progress, and export row-level results.
- Successful rows are never duplicated when a job is retried or resumed.
- Invitation emails are dispatched through a stable email port, not sent inline by the request.

## SRS Requirements Covered

- `FR-EMP-002..007`
- `FR-EMAIL-001..003`

## Current Code Areas to Inspect First

- `api/src/modules/users/`
- `api/src/db/models/user.model.ts`
- `app/src/app/(dashboard)/dashboard/users/`
- `workers/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Provide an approved XLSX template with documented columns such as first name, last name, email, department, job title, custom role, preferred language, manager email, and document groups.
- [ ] Accept XLSX with safe file-size/row/column/formula limits. Do not execute formulas or macros.
- [ ] Create a `SpreadsheetMappingAgent` port that proposes column mappings and normalized values using structured output; provide a deterministic fake and require human approval for uncertain mappings.
- [ ] Perform deterministic validation for required fields, email format, duplicate rows, existing same-tenant users, roles, departments, manager references, language, entitlements, and unsupported values.
- [ ] Persist an import batch and immutable row snapshots with statuses, validation errors/warnings, mapping version, checksum, uploader, and tenant.
- [ ] Expose preview summary with valid/warning/invalid/existing counts and quota impact.
- [ ] Require an explicit confirmation endpoint with idempotency key and optimistic state transition from `PREVIEW_READY` to `QUEUED`.
- [ ] Execute confirmed rows asynchronously through a `JobDispatcher` port; create/update users atomically per row and generate invitation intents.
- [ ] Dispatch structured invitation requests through an `EmailDispatchPort`; retries must not create duplicate users or emails.
- [ ] Support batch progress, cancellation before execution where safe, row retry, failed-only retry, history, and CSV/XLSX result export.
- [ ] Build the complete Company Admin UI: template download, upload, mapping review, preview table, confirmation, progress, history, result filters, report download, and retry.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create XLSX template endpoint
- [ ] Parse spreadsheets safely
- [ ] Implement mapping proposal interface
- [ ] Validate rows, roles, departments, duplicates, quotas
- [ ] Persist preview batch
- [ ] Build preview UI and result filters

## Backend and Domain Implementation

- [ ] Use explicit state machines for batch and row statuses.
- [ ] Use deterministic per-row idempotency keys derived from tenant, batch, row identity, and operation version.
- [ ] Do not hold the entire workbook in memory beyond configured limits; stream/parse safely where possible.

### Recommended Code Ownership / Path Boundaries

- import batch/row models
- XLSX parser/mapping/validation services
- confirm/job handlers and email port
- import UI/history/report
- idempotency/E2E tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Never start creation/email on upload alone.
- [ ] Allow admins to correct mappings and selected role/department before confirmation.
- [ ] Make partial success obvious and preserve downloadable errors.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define `EmployeeImportBatch`, `EmployeeImportRow`, mapping proposal, validation result, progress, and report contracts.
- [ ] Add template, upload/preview, mapping-update, confirm, status, history, report, cancel, and retry endpoints.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Company Admin or explicit `users.bulk_import` permission only.
- [ ] Tenant IDs come from auth context; role/department IDs must belong to the tenant.
- [ ] Sanitize spreadsheet values to prevent formula injection in exported reports.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle duplicate upload checksum, stale preview confirmation, quota change between preview and execution, worker interruption, email-provider failure, and partial row failure.
- [ ] Quota conflict at execution must fail only affected rows and be visible.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Parser/mapping/validation unit tests with Arabic and English headers.
- [ ] Idempotency and resume tests across worker failure.
- [ ] Cross-tenant role/department tests and formula-injection tests.
- [ ] End-to-end UI test from template to report using fake queue/email adapters.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Audit upload, mapping approval, confirmation, cancellation, retries, and exports.
- [ ] Emit batch/row processing metrics and invitation dispatch outcomes.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Use `JobDispatcher`, `SpreadsheetMappingAgent`, `PermissionEvaluator`, `EntitlementChecker`, and `EmailDispatchPort` interfaces with fakes.
- [ ] The complete feature can be developed before worker, roles, quota, agent runtime, or email provider issues merge.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Arbitrary spreadsheet editing inside the application.
- Allowing an LLM to create users or send email without deterministic validation and admin confirmation.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Admin sees valid/warning/invalid rows
- [ ] No user is created before confirmation
- [ ] Mapping confidence and overrides are visible
- [ ] Malformed files fail safely
- [ ] Preview is idempotent

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 10 — Implement Payment Checkout and Webhook Synchronization

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Payments |
| Suggested owner | Backend/Full-stack |
| Complexity | Large |
| Branch | `feature/10-implement-payment-checkout-and-webhook-synchronization` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Add provider checkout and authoritative subscription synchronization.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- The application has package/subscription records but no real checkout, provider customer lifecycle, webhook ingestion, or authoritative payment synchronization.

## User and Product Outcomes

- A company can select a paid package, complete secure hosted checkout, and have local subscription state updated only from verified provider events.
- Duplicate or replayed webhooks never create duplicate subscriptions or payments.
- Local/test environments run against a fake payment provider.

## SRS Requirements Covered

- `FR-PAY-002..004`

## Current Code Areas to Inspect First

- `api/src/db/models/package.model.ts`
- `api/src/db/models/subscription.model.ts`
- `api/src/modules/platform/`
- `api/src/app.ts`
- `app/src/app/(public)/`
- `app/src/app/(dashboard)/super-admin/subscriptions/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define a provider-neutral `PaymentProvider` interface and implement the selected production provider adapter, expected to be Stripe unless the product decision changes.
- [ ] Create or retrieve a provider customer for the tenant and create hosted checkout sessions for approved package price/version and billing interval.
- [ ] Use server-side package/price lookup; never trust client-provided amount, currency, entitlement, or provider price ID.
- [ ] Persist checkout attempts and provider event records with idempotency keys and trace IDs.
- [ ] Receive webhooks using raw request body where required, verify signatures/timestamps, persist before processing, and handle replay safely.
- [ ] Map provider events into local subscription projection transitions defined by the normalized commercial domain.
- [ ] Support checkout success/cancel return pages that display pending state until webhook synchronization is confirmed.
- [ ] Add reconciliation command/job to compare provider state with local projection.
- [ ] Provide Super Admin diagnostics for webhook/event processing and safe replay of failed internal processing.
- [ ] Use fake provider fixtures for development and automated tests.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create provider adapter
- [ ] Create checkout session API/UI
- [ ] Verify webhook signatures
- [ ] Persist/idempotently process events
- [ ] Project local subscription state
- [ ] Implement pending/success/failure pages and tests

## Backend and Domain Implementation

- [ ] Keep webhook HTTP acknowledgement fast; process durable event effects idempotently.
- [ ] Store provider IDs, not sensitive payment details.
- [ ] Do not grant entitlements from the browser redirect alone.

### Recommended Code Ownership / Path Boundaries

- payment provider adapter
- checkout service/routes
- raw-body webhook handler/event store
- subscription projection sync
- checkout UI/tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Package selection, checkout launch, pending confirmation, active state, canceled checkout, and recoverable failure states.
- [ ] Do not display success until local state reflects verified provider event.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define checkout-session request/response, payment event, customer mapping, and subscription synchronization records.
- [ ] Add endpoints for checkout session and subscription status; webhook endpoint is provider-specific but isolated.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Verify webhook signatures and allowed event/account context.
- [ ] Protect against price substitution, tenant mismatch, replay, forged success URLs, and open redirects.
- [ ] Never log full webhook secrets or payment instruments.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle duplicate events, out-of-order events, checkout timeout, provider unavailability, invalid signature, unknown price, and local processing failure.
- [ ] Failed event processing must be retryable without recharging.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Provider contract tests with fake adapter.
- [ ] Signature, replay, ordering, idempotency, and tenant-mismatch tests.
- [ ] E2E checkout UX using test/fake provider.
- [ ] Reconciliation tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Audit checkout creation and subscription changes.
- [ ] Track event received/verified/processed/failed/replayed durations and counts.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume normalized package/subscription ports; if Issue 04 is unavailable, ship local contract fixtures matching the documented schema.
- [ ] Expose the same `PaymentProvider` interface for Issue 29.
- [ ] Do not require entitlement enforcement to complete checkout.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Billing portal, invoice history UI, refunds, cancellation/reactivation, and advanced proration operations.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Checkout return is not treated as authoritative
- [ ] Duplicate webhooks do not duplicate effects
- [ ] Subscription state follows verified events
- [ ] Tenant cannot access another billing session
- [ ] Provider sandbox tests pass

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 11 — Implement Reliable Email Queue, Templates, and Delivery Status

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Email |
| Suggested owner | Backend/Full-stack |
| Complexity | Large |
| Branch | `feature/11-implement-reliable-email-queue-templates-and-delivery-status` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Replace direct best-effort email sending with a reliable delivery workflow.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Verification, invitation, and reset email templates can be sent directly through SMTP, but there is no queue, delivery state machine, retry orchestration, provider webhook handling, suppression list, or bulk-safe behavior.

## User and Product Outcomes

- Transactional and onboarding emails are reliable, observable, tenant-branded, bilingual, retryable, and never duplicated.
- An Email Orchestration Agent can choose an approved template/language/variables, but deterministic services remain responsible for validation and sending.
- Company Admins can preview, test, schedule, resend, revoke, and inspect delivery outcomes where permitted.

## SRS Requirements Covered

- `FR-EMAIL-001..006`

## Current Code Areas to Inspect First

- `api/src/modules/auth/auth.mailer.ts`
- `api/src/modules/users/users.service.ts`
- `api/src/providers/`
- `workers/`
- `app/src/app/(dashboard)/dashboard/users/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define approved template types and versioned structured variables. Arbitrary agent-generated HTML must not be sent.
- [ ] Create an `EmailOrchestrationAgent` port that emits `{templateId, language, variables, reminderPolicy, priority, approvalRequired}` with schema validation.
- [ ] Create an `EmailDispatchPort` and queue job contract; provide in-memory/fake adapters so the feature is independently testable.
- [ ] Persist email message and attempt records with tenant, recipient hash/address, template version, correlation IDs, idempotency key, provider message ID, state, timestamps, and safe error category.
- [ ] Implement states: `PENDING`, `QUEUED`, `PROCESSING`, `SENT`, `DELIVERED`, `TEMPORARY_FAILURE`, `PERMANENT_FAILURE`, `BOUNCED`, `REJECTED`, `CANCELLED`, and `SUPPRESSED`.
- [ ] Implement retry with exponential backoff and provider-aware retry classification.
- [ ] Prevent duplicate sending across HTTP retries, queue retries, import retries, and resend actions.
- [ ] Support tenant branding, Arabic/English templates, preview, test-send, scheduled send, invitation reminders, resend, and revocation/expiry handling.
- [ ] Handle provider delivery/bounce/complaint webhooks with signature verification and idempotency.
- [ ] Maintain a suppression list and prevent sending to permanently failed or opted-out addresses where applicable.
- [ ] Build Company Admin delivery status/history UI and Super Admin provider/queue diagnostic view.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create email message/attempt models
- [ ] Create approved template renderer
- [ ] Queue delivery with idempotency
- [ ] Retry transient failures
- [ ] Track provider IDs and webhook status
- [ ] Build admin delivery view and tests

## Backend and Domain Implementation

- [ ] Keep token generation and account activation in auth/user domain services; email payloads contain only approved links/variables.
- [ ] Workers revalidate message state before every send.
- [ ] Store rendered content only if retention/privacy requirements permit; prefer template/version plus variables.

### Recommended Code Ownership / Path Boundaries

- email template/orchestration/dispatch modules
- email message/attempt/suppression models
- worker handlers and provider webhooks
- delivery/admin UI
- provider/idempotency tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Template preview must clearly show sender, recipient, language, subject, and expiration.
- [ ] Resend/revoke actions require explicit confirmation and display current invitation/email state.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define email message, attempt, suppression, template, reminder, and webhook-event schemas.
- [ ] Add preview, test, schedule/dispatch, status/history, resend, cancel/revoke, and webhook endpoints.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Do not let agents choose arbitrary recipients, links, or HTML.
- [ ] Validate recipient belongs to the intended tenant workflow.
- [ ] Sign or construct links server-side and never expose raw token values in logs.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle provider timeout, transient rejection, permanent bounce, duplicate webhook, expired invitation, revoked token, and queue restart.
- [ ] Do not retry permanent failures indefinitely.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Template rendering and variable-schema tests in Arabic and English.
- [ ] Idempotency tests across queue retries and import retries.
- [ ] Provider webhook signature/replay tests.
- [ ] End-to-end invite email capture and status UI using fake provider.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Trace orchestration decision, approval, queueing, provider attempt, delivery webhook, bounce, retry, and final state.
- [ ] Track delivery latency, retry rate, bounce rate, suppression rate, and template version.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Use `JobDispatcher` and agent/model ports with local fakes if Issues 05/12 are not merged.
- [ ] Expose `EmailDispatchPort` for auth and import features.
- [ ] Do not require a live provider in development or CI.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Marketing campaigns and unrestricted bulk messaging.
- Allowing the LLM to send or render unapproved content directly.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Duplicate jobs do not duplicate messages
- [ ] Delivery states are queryable
- [ ] Templates support Arabic/English and tenant branding
- [ ] Bounces and suppression are recorded
- [ ] A fake provider supports local tests

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 12 — Create Agent Runtime, Supervisor, Typed Tools, and Tracing

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Agents |
| Suggested owner | AI/Backend |
| Complexity | Large |
| Branch | `feature/12-create-agent-runtime-supervisor-typed-tools-and-tracing` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Establish the mandatory controlled multi-agent runtime without requiring RAG to exist yet.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Agent, retrieval, citation, and model-provider source files are currently empty or scaffolded.
- The product requires a mandatory controlled multi-agent architecture, but no shared runtime, tool gateway, approval checkpoint, prompt versioning, or trace model exists.

## User and Product Outcomes

- Feature teams can implement specialized agents on a safe, typed, observable runtime.
- Agents can only call registered tools, and every tool independently rechecks tenant/permission context.
- Sensitive actions can pause for human approval and resume without losing state.

## SRS Requirements Covered

- `FR-AGT-001`
- `FR-AGT-004..007`

## Current Code Areas to Inspect First

- `api/src/providers/llm/`
- `api/src/modules/chat/`
- `api/src/modules/retrieval/`
- `api/src/modules/citations/`
- `api/src/db/models/`
- `workers/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define provider-neutral `ModelAdapter` and `EmbeddingAdapter` boundaries; this issue implements model runtime only, not embeddings/RAG.
- [ ] Define typed agent input/output schemas, tool schemas, run context, handoff protocol, structured error types, and version identifiers.
- [ ] Implement a Supervisor workflow engine that selects allowed agents/workflows using deterministic routing plus model assistance where appropriate.
- [ ] Create a tool registry/gateway. Agents may invoke only registered typed tools; tool handlers receive authenticated tenant/user/permission context and reauthorize.
- [ ] Support manager-style orchestration, controlled handoffs, maximum step/tool/time/token budgets, cancellation, retries, and deterministic fallback.
- [ ] Implement prompt/model/tool versioning and configuration resolution with safe defaults.
- [ ] Implement guardrail hooks for input, tool invocation, output, and sensitive-action approval.
- [ ] Implement durable human-approval checkpoints with pause/resume/reject/expire states and tamper-resistant context.
- [ ] Persist complete trace metadata: run/workflow/agent names, model, prompt version, tool calls, handoffs, tokens, cost estimate, latency, evidence IDs, guardrail results, approvals, and errors.
- [ ] Provide deterministic fake model, fake tools, sample supervisor workflow, and contract tests.
- [ ] Create internal debugging/trace viewer endpoints or minimal UI appropriate for Super Admin/developers, with strict redaction.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Define agent/tool schemas
- [ ] Implement Supervisor workflow engine
- [ ] Add permission-aware tool gateway
- [ ] Add prompt/model versioning
- [ ] Add human approval checkpoints
- [ ] Add trace storage and test agents

## Backend and Domain Implementation

- [ ] Keep business operations in deterministic domain services; agent tools are adapters over those services.
- [ ] Do not expose arbitrary code execution, raw database queries, or unbounded network access as tools.
- [ ] Use structured outputs and schema validation for every agent response.

### Recommended Code Ownership / Path Boundaries

- agent runtime contracts
- model adapter/tool gateway
- supervisor/approval/guardrails
- trace persistence/viewer
- fake agents and runtime tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Provide reusable approval request UI components and a trace summary viewer if included in current platform UX.
- [ ] Do not expose hidden prompts or sensitive tool payloads to ordinary employees.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define agent run, step, tool call, approval, prompt version, and model configuration records.
- [ ] Define stable runtime interfaces specialized agents can consume later.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Reauthorize every tool call and enforce tenant context from the authenticated runtime, not model output.
- [ ] Treat document/user content as untrusted data.
- [ ] Redact secrets, tokens, PII, and document text according to policy.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle invalid structured output, tool timeout, model timeout, budget exhaustion, unauthorized tool call, approval expiry, cancellation, and provider outage.
- [ ] Failures must produce a safe terminal state and trace, not an infinite loop.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Deterministic supervisor routing and handoff tests.
- [ ] Unauthorized/unregistered tool and context-tampering tests.
- [ ] Approval pause/resume/reject/expire tests.
- [ ] Budget/cancellation/retry/provider-fallback tests.
- [ ] Trace completeness/redaction tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Agent tracing is a core deliverable; correlate with HTTP/job/request trace context.
- [ ] Expose run success, failure, tool error, approval wait, token, cost, and latency metrics.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Ship fake model/tool adapters and a stable runtime package/module.
- [ ] RAG, metadata, import, email, analytics, and billing agents can implement against the contract independently.
- [ ] Do not implement specialized product agents in this issue.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Retrieval, answer generation, document metadata logic, email delivery, or payment execution.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Agents cannot call unregistered tools
- [ ] Tools recheck authorization
- [ ] Runs record model, prompts, tools, handoffs, tokens, latency
- [ ] Approval can pause/resume
- [ ] Deterministic test agents pass

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 13 — Implement PDF, DOCX, and TXT Extraction Pipeline

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Document Intelligence |
| Suggested owner | Backend/AI |
| Complexity | Large |
| Branch | `feature/13-implement-pdf-docx-and-txt-extraction-pipeline` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Extract structured text and page/section metadata from supported documents.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Document uploads exist, but no PDF, DOCX, or TXT extraction pipeline, structured page model, parser dependency, or processing job handler exists.

## User and Product Outcomes

- Supported documents produce a deterministic structured extraction artifact ready for OCR, quality analysis, metadata, and chunking.
- Parser failure is visible and retryable without duplicating artifacts.

## SRS Requirements Covered

- `FR-PROC-001`
- `FR-DOC-006`

## Current Code Areas to Inspect First

- `api/src/modules/processing/`
- `api/src/providers/storage/`
- `api/src/db/models/document.model.ts`
- `workers/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define a parser-neutral extraction contract with document ID/version, page/block/paragraph/table structures, source offsets, headings, language hints, warnings, parser version, and checksum.
- [ ] Implement safe adapters for PDF, DOCX, and TXT using approved maintained libraries.
- [ ] Preserve page numbers for PDF, section/headings for DOCX, and line/paragraph boundaries for TXT.
- [ ] Detect image-only/low-text PDF pages and flag them for OCR instead of pretending extraction succeeded.
- [ ] Apply configurable limits for pages, characters, nested structures, decompression, parsing time, and memory.
- [ ] Normalize text encoding, line endings, whitespace, and Unicode without destroying Arabic/English content or source mapping.
- [ ] Extract basic document properties where available, but leave semantic metadata decisions to Issue 15.
- [ ] Persist extraction artifacts idempotently and version them by source checksum plus parser version.
- [ ] Implement a typed processing job handler and a direct service path for tests using a `JobDispatcher` port.
- [ ] Create fixtures for Arabic, English, bilingual, tables, headings, empty files, malformed files, and scanned PDFs.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Implement format adapters
- [ ] Preserve page/section structure
- [ ] Handle encoding and Arabic/English
- [ ] Store extraction artifacts
- [ ] Add retryable failure codes
- [ ] Build extraction corpus tests

## Backend and Domain Implementation

- [ ] Parsing must run outside user-facing request threads.
- [ ] Do not generate embeddings or chunks here.
- [ ] Sanitize parser errors and never execute embedded scripts/macros.

### Recommended Code Ownership / Path Boundaries

- parser adapters and extraction schema
- document extraction job handler
- artifact persistence
- status adapter
- golden fixtures/tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Expose extraction status/warnings in document details through a small status contract; full progress UI belongs to Issue 17.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define extraction artifact and processing result DTOs.
- [ ] Provide an internal service/tool contract consumed by quality/metadata/chunking issues.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Treat all files as hostile; enforce resource limits and isolated processing where feasible.
- [ ] Revalidate tenant/document/version in the worker before reading storage.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Classify malformed, unsupported, timeout, resource-limit, encrypted/password-protected, and image-only outcomes.
- [ ] Retry only transient storage/worker failures, not deterministic malformed files unless parser version changes.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Golden extraction tests for each format and bilingual content.
- [ ] Malformed/encrypted/resource-limit tests.
- [ ] Idempotent re-run and parser-version upgrade tests.
- [ ] Storage/worker interruption tests using fakes.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Record parser name/version, duration, pages, characters, warnings, and safe failure category.
- [ ] Do not log extracted document text.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Use storage and job interfaces with local fakes.
- [ ] Publish frozen extraction fixtures/artifact schema so OCR, metadata, and chunking teams work without this implementation.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- OCR, semantic metadata, conflict detection, chunking, embeddings, or search indexing.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Supported files produce deterministic extraction artifacts
- [ ] Unsupported/corrupt files fail safely
- [ ] Artifacts are tenant-scoped
- [ ] Re-running is idempotent
- [ ] No OCR is required in this issue

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 14 — Implement OCR and Document Quality Analysis

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Document Intelligence |
| Suggested owner | AI/Backend |
| Complexity | Large |
| Branch | `feature/14-implement-ocr-and-document-quality-analysis` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Process scanned pages and produce quality/confidence signals.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- No OCR engine, scanned-page detection, extraction-quality scoring, review workflow, or OCR page quota logic currently exists.

## User and Product Outcomes

- Scanned or weak pages are identified and processed through OCR with measurable confidence.
- Admins can see quality warnings and approve/retry low-confidence results instead of silently indexing bad text.

## SRS Requirements Covered

- `FR-PROC-001..002`
- `FR-PROC-005`

## Current Code Areas to Inspect First

- `api/src/providers/ocr/`
- `api/src/modules/processing/`
- `workers/`
- `app/src/app/(dashboard)/dashboard/documents/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define an `OcrProvider` interface with a deterministic fake and one approved production adapter.
- [ ] Consume page-level extraction artifacts or frozen fixtures and decide which pages require OCR using deterministic heuristics.
- [ ] Support Arabic, English, and mixed-language OCR configuration.
- [ ] Persist page-level OCR text, confidence, bounding/source information where available, provider/model version, cost/usage, and warnings.
- [ ] Implement a Document Quality Agent that receives structured extraction/OCR metrics and proposes quality classification, but deterministic thresholds decide blocking vs warning states.
- [ ] Detect blank pages, unreadable pages, garbled text, broken table extraction, rotated pages, duplicated pages, and low-confidence language output where possible.
- [ ] Require human review/approval for low-confidence or sensitive outcomes before search indexing.
- [ ] Support page-level retry, provider fallback through an adapter, and parser/OCR version reprocessing.
- [ ] Integrate an `EntitlementChecker`/usage recorder port for OCR page limits without blocking development on quota implementation.
- [ ] Build a document quality panel showing page status, warnings, confidence, preview snippets, approval/retry actions, and audit history.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Detect OCR need
- [ ] Create OCR provider adapter
- [ ] Process selected pages
- [ ] Produce confidence and issue flags
- [ ] Implement Document Quality Agent contract
- [ ] Add review UI and test corpus

## Backend and Domain Implementation

- [ ] OCR is asynchronous and idempotent per document version/page/provider version.
- [ ] Do not send entire documents to an LLM when deterministic OCR is sufficient.
- [ ] Quality Agent outputs must be schema-validated and treated as recommendations.

### Recommended Code Ownership / Path Boundaries

- OCR provider/quality agent
- page result/review models
- OCR jobs and entitlement port
- quality review UI
- multilingual fixtures/tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Clearly distinguish `READY`, `READY_WITH_WARNINGS`, `REVIEW_REQUIRED`, and `FAILED`.
- [ ] Do not expose pages the viewer lacks document permission to access.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define OCR page result, quality assessment, review decision, and usage records.
- [ ] Add review/retry/status endpoints through existing document processing APIs.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Only approved providers and regions may receive document images.
- [ ] Redact provider logs and respect document classification/data-residency settings.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle unsupported language, provider timeout, quota denial, low confidence, partial page failure, and provider outage.
- [ ] Partial OCR must not mark the whole document searchable unless policy allows.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Scanned Arabic/English/mixed fixtures and rotated/blank/low-quality pages.
- [ ] Threshold, review-required, retry, provider fallback, and quota-port tests.
- [ ] Cross-tenant review/action tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Record page counts, provider/model, confidence distribution, duration, cost, retries, and review decisions.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume frozen extraction artifacts and expose OCR/quality artifacts.
- [ ] Use fake OCR, entitlement, agent, and job adapters so no dependency blocks implementation.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Semantic metadata, conflict detection, chunking, embeddings, or answer generation.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Scanned files produce page text and confidence
- [ ] Low quality requires review
- [ ] Provider failure is retryable
- [ ] Quality output is schema-valid
- [ ] Local fake OCR enables tests

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 15 — Implement Metadata, Version, and Conflict Agents

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Document Intelligence |
| Suggested owner | AI/Full-stack |
| Complexity | Large |
| Branch | `feature/15-implement-metadata-version-and-conflict-agents` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Propose metadata and identify duplicates, expiry, supersession, and contradictions.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Documents have limited metadata, but no mandatory Metadata Agent, Version/Conflict Agent, duplicate/supersession model, or human approval workflow exists.

## User and Product Outcomes

- Admins receive structured metadata suggestions and conflict warnings while retaining final control.
- The system understands versions, expiry, duplicates, and contradictory policy candidates before indexing.

## SRS Requirements Covered

- `FR-PROC-003..005`

## Current Code Areas to Inspect First

- `api/src/modules/processing/`
- `api/src/providers/llm/`
- `api/src/db/models/document.model.ts`
- `app/src/app/(dashboard)/dashboard/documents/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Implement `MetadataAgent` and `VersionConflictAgent` against the shared agent runtime contract, with deterministic fake adapters.
- [ ] Metadata output shall propose title, document type, department, effective/expiry dates, version, owner, language, confidentiality, tags, related documents, and access recommendations as structured candidates with confidence/evidence.
- [ ] Deterministically validate dates, enum values, tenant-owned references, and allowed classifications.
- [ ] Detect exact duplicates using checksum and near-duplicates using normalized text/fingerprint adapters.
- [ ] Model document relationships such as `VERSION_OF`, `SUPERSEDES`, `SUPERSEDED_BY`, `DUPLICATE_OF`, `RELATED_TO`, and `CONFLICTS_WITH`.
- [ ] Use rules plus agent assistance to identify likely conflicting clauses/numbers between active documents; store evidence references, not unsupported conclusions.
- [ ] Require Company Admin/Knowledge Manager approval for low-confidence metadata, access recommendations, supersession, and conflicts.
- [ ] Prevent an unapproved new version from silently replacing an active authoritative document.
- [ ] Build review queues and document detail UX for candidate comparison, approve/edit/reject, relationship history, conflict resolution, and audit.
- [ ] Expose approved metadata artifacts to chunking/retrieval through a stable contract.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create metadata schema
- [ ] Implement agent prompts/tools
- [ ] Add version/duplicate matching
- [ ] Add conflict findings
- [ ] Create human approval UI
- [ ] Add audit and evaluation tests

## Backend and Domain Implementation

- [ ] Agents propose; deterministic services validate and apply.
- [ ] Version activation/supersession must be transactional and tenant-scoped.
- [ ] Use frozen extraction fixtures if parsing is unavailable.

### Recommended Code Ownership / Path Boundaries

- metadata/conflict agent implementations
- candidate/review/relationship models
- approval services/APIs
- document review UI
- agent/domain tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Show original/extracted evidence beside every proposal.
- [ ] Bulk approval is allowed only for high-confidence non-sensitive fields and must be auditable.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define metadata candidate, review decision, document relationship, conflict finding, and authoritative-version schemas.
- [ ] Add review-list/detail/approve/reject/resolve endpoints.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Agents must not see documents outside tenant/access policy.
- [ ] Access recommendations never grant access automatically.
- [ ] Prevent cross-tenant relationship IDs.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle stale candidate after document update, conflicting simultaneous approvals, invalid relationship cycles, and missing authoritative version.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Structured output validation and deterministic fake-agent tests.
- [ ] Duplicate/version/relationship-cycle tests.
- [ ] Conflict evidence and approval transaction tests.
- [ ] Tenant/access isolation and review UI tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Trace agent model/prompt, candidate confidence, evidence IDs, approval latency, rejection reasons, and applied metadata changes.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume extraction/agent ports with fixtures/fakes.
- [ ] Publish approved metadata and relationship interfaces for chunking/retrieval without requiring those issues.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Automatic legal determination, unrestricted access grants, or final answer generation.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Agents return typed proposals with confidence
- [ ] Sensitive changes require approval
- [ ] Duplicate/version relationships are persisted
- [ ] Admin can accept/edit/reject
- [ ] No direct publication occurs without validation

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 16 — Implement Semantic Chunking, Embeddings, and Indexing

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Search |
| Suggested owner | AI/Backend |
| Complexity | Very Large |
| Branch | `feature/16-implement-semantic-chunking-embeddings-and-indexing` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Create searchable tenant-aware document chunks and index verification.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- No document chunk model implementation, embedding generation, vector store, keyword index, semantic chunking, or searchable-index verification exists.

## User and Product Outcomes

- Approved document versions become searchable through reproducible chunks, embeddings, and keyword indexes.
- Reprocessing is idempotent, access metadata is preserved, and stale indexes are safely replaced.

## SRS Requirements Covered

- `FR-PROC-006..007`

## Current Code Areas to Inspect First

- `api/src/db/models/documentChunk.model.ts`
- `api/src/providers/embeddings/`
- `api/src/modules/processing/`
- `api/src/modules/retrieval/`
- `workers/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define a semantic chunk schema preserving tenant, document/version, page, section, clause/table, language, category, department, classification, access policy version, source offsets, checksum, and text.
- [ ] Implement configurable chunking strategies for headings/paragraphs/clauses/tables with token limits and overlap; do not cut blindly across semantic boundaries.
- [ ] Support Arabic, English, and mixed content without losing source mapping.
- [ ] Define provider-neutral `EmbeddingProvider`, `VectorIndex`, and `KeywordIndex` interfaces with deterministic fakes.
- [ ] Generate embeddings in batches with retry, rate limits, model/version metadata, usage/cost events, and idempotency.
- [ ] Create vector and keyword indexes with mandatory tenant/access/version filter fields.
- [ ] Verify expected chunk/index counts before marking a document searchable.
- [ ] Implement atomic index generation/versioning: build a new index generation, validate it, switch active generation, then retire old data.
- [ ] Support delete, archive, access-policy change, re-embed, and full reindex without exposing stale unauthorized chunks.
- [ ] Persist chunk and index generation history sufficient for citations and rollback.
- [ ] Create fixture corpus and retrieval smoke tests without implementing hybrid retrieval ranking.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Implement semantic/header/table chunking
- [ ] Create embedding provider adapter
- [ ] Store chunk metadata and vectors
- [ ] Create keyword/vector indexes
- [ ] Add index verification and rollback
- [ ] Add multilingual retrieval fixtures

## Backend and Domain Implementation

- [ ] Never allow the LLM or embedding provider to receive chunks before document access/processing approval.
- [ ] Batch long-running work through job ports.
- [ ] Text stored in vector metadata must follow privacy policy; use IDs where provider supports external metadata storage.

### Recommended Code Ownership / Path Boundaries

- chunker/embedding/index adapters
- chunk/index-generation models
- indexing jobs
- status/reindex APIs
- corpus/contract/security tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Expose indexing status, model/version, chunk count, and safe retry/reindex actions through processing UI contracts.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define chunk, embedding reference, index generation, active generation, and processing result schemas/indexes.
- [ ] Publish search-index ports consumed by retrieval.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Tenant and access-policy fields are mandatory and immutable within a generation.
- [ ] Test stale index removal after permission revocation.
- [ ] Provider calls must obey data residency/classification policy.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle provider partial batch failure, rate limit, dimension mismatch, index outage, verification mismatch, cancellation, and policy change mid-run.
- [ ] Do not mark searchable until all required indexes are verified.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Golden chunking tests for headings, clauses, tables, Arabic/English, and page mapping.
- [ ] Embedding/vector/keyword contract tests with fakes.
- [ ] Idempotency, generation switch, rollback, stale access, and partial-failure tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Record chunk counts/sizes, model/version, token usage, cost, duration, retries, index generation, and verification result.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume frozen extraction/metadata/access-policy fixtures.
- [ ] Publish fake vector/keyword indexes and a frozen corpus for retrieval teams.
- [ ] Do not require live providers in CI.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Hybrid retrieval ranking, answer generation, chat, or citation verification.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Every chunk carries tenant/access/version metadata
- [ ] Re-indexing is idempotent
- [ ] Failed indexing does not mark ready
- [ ] Embedding usage is recorded
- [ ] Fake embedding adapter supports tests

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 17 — Implement Processing Progress, Retry, Reprocess, and Admin UI

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Documents |
| Suggested owner | Full-stack |
| Complexity | Large |
| Branch | `feature/17-implement-processing-progress-retry-reprocess-and-admin-ui` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Make document processing visible and operable.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Documents expose simple statuses but no complete processing state machine, persistent stage history, progress protocol, retry/reprocess/cancel controls, or real queue job management.

## User and Product Outcomes

- Admins can understand exactly where every document is in processing and safely recover failures.
- Retries and reprocessing do not duplicate artifacts or leave inconsistent searchable state.

## SRS Requirements Covered

- `FR-DOC-005..006`
- `NFR-REL-001`

## Current Code Areas to Inspect First

- `api/src/modules/documents/`
- `api/src/modules/processing/`
- `workers/`
- `app/src/app/(dashboard)/dashboard/documents/`
- `app/src/app/(dashboard)/super-admin/jobs/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define an explicit document processing state machine covering uploaded, security scanning, queued, extracting, OCR, quality review, metadata review, chunking, embedding, indexing, ready, ready-with-warnings, failed, canceled, archived, and reprocessing.
- [ ] Persist stage executions with attempt number, job ID, started/finished times, progress, safe error code, retryability, artifact versions, and trace ID.
- [ ] Expose current status and stage history APIs with pagination and tenant/permission filtering.
- [ ] Implement retry-stage, retry-from-stage, full reprocess, cancel-queued/running where safe, and resume-after-human-approval actions.
- [ ] Use a `JobDispatcher` port and fake processing handlers so UI/backend can be completed independently.
- [ ] Guarantee idempotency and artifact-generation rules when a stage repeats.
- [ ] Prevent reprocess from replacing the active searchable generation until the new generation succeeds.
- [ ] Build document list badges, progress view, stage timeline, error detail, retry/reprocess/cancel confirmations, and filters.
- [ ] Build Company Admin failed-processing dashboard and Super Admin queue/job correlation view.
- [ ] Provide polling and/or event-stream updates with backoff and reconnect behavior.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Define processing state machine
- [ ] Persist progress and attempts
- [ ] Add status/history/retry/reprocess APIs
- [ ] Add polling or event updates
- [ ] Build admin UI
- [ ] Add recovery tests

## Backend and Domain Implementation

- [ ] Centralize state transitions and reject invalid transitions.
- [ ] Worker progress updates must be authenticated/internal and scoped to the expected job/attempt.

### Recommended Code Ownership / Path Boundaries

- processing state machine/history models
- progress/retry/reprocess APIs
- worker progress protocol
- admin UI
- state/race tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Show actionable safe errors, not raw stack traces.
- [ ] Preserve user context while live status updates arrive.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define processing run/stage/attempt/status/progress contracts and transition API.
- [ ] Document which actions require Company Admin or custom permissions.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Employees may see only allowed document status and cannot retry/reprocess unless granted.
- [ ] Prevent forged progress/job callbacks.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle lost worker heartbeat, duplicate completion, out-of-order progress, cancellation race, stale approval, and failed new generation with old generation still active.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] State-machine transition tests.
- [ ] Duplicate/out-of-order worker event tests.
- [ ] Retry/reprocess generation safety tests.
- [ ] Frontend live-update/reconnect/error-action tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Measure time per stage, retry rates, failure categories, stuck jobs, and end-to-end processing latency.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Use fake queue and fake stage processors.
- [ ] Do not require actual extraction/OCR/indexing implementations; consume their documented artifact/result interfaces.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Implementing parser, OCR, metadata, chunking, embedding, or vector logic.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Admins see accurate state and reason
- [ ] Retry does not duplicate artifacts
- [ ] Authorized users can reprocess
- [ ] Failed jobs are actionable
- [ ] A simulator supports UI tests

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 18 — Implement Document Categories, Access Policies, and Permission UI

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Security/Documents |
| Suggested owner | Full-stack |
| Complexity | Large |
| Branch | `feature/18-implement-document-categories-access-policies-and-permission-ui` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Allow administrators to control document visibility with real policies.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Document-level access roles are limited, and there is no complete category, department, classification, explicit grant, policy version, or permission-management UI.

## User and Product Outcomes

- Companies can control who can discover, read, download, manage, and use each document in AI retrieval.
- Access-policy changes propagate safely to lists, downloads, chunks, retrieval, citations, and exports.

## SRS Requirements Covered

- `FR-RBAC-007`
- `FR-DOC-004..005`

## Current Code Areas to Inspect First

- `api/src/db/models/document.model.ts`
- `api/src/modules/documents/`
- `api/src/modules/roles/`
- `app/src/app/(dashboard)/dashboard/documents/`
- `app/src/app/(dashboard)/dashboard/roles/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define tenant-scoped departments, document categories, classifications, ownership, explicit user/role grants, and policy inheritance.
- [ ] Define permissions separately for discover/list, read/view, download, upload, update, delete, reprocess, manage access, and use in AI.
- [ ] Create a deterministic `DocumentAccessPolicyEvaluator` that compiles actor context plus policy into allow/deny decisions and query filters.
- [ ] Support policy versioning and effective timestamps so indexed chunks/citations can reference the correct policy.
- [ ] Default new documents to private/restricted until an authorized user approves access.
- [ ] Implement policy CRUD/preview/apply APIs and batch policy changes with dry-run impact counts.
- [ ] On policy tightening, immediately block API access and mark affected index generations for secure metadata update/reindex.
- [ ] On policy broadening, require explicit confirmation for sensitive classifications.
- [ ] Build category/department management, classification badges, access editor, effective-access preview, assigned users/roles, and batch policy UX.
- [ ] Integrate with list/detail/download APIs through a stable port and expose filters consumed by retrieval.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create category/department/classification models
- [ ] Create policy editor
- [ ] Apply custom-role and explicit grants
- [ ] Add policy preview
- [ ] Add backend enforcement
- [ ] Add audit and leakage tests

## Backend and Domain Implementation

- [ ] Compile access filters in repositories/search adapters; do not fetch all resources then filter in memory.
- [ ] Handle explicit deny/allow precedence deterministically and document it.

### Recommended Code Ownership / Path Boundaries

- department/category/classification/policy models
- policy evaluator/compiler
- policy APIs
- access editor/effective-access UI
- revocation/security tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Show why a user/role has access and the impact of proposed changes.
- [ ] Prevent display of unauthorized snippets/metadata.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define department, category, classification, access policy, grant, policy version, and effective-access DTOs.
- [ ] Add indexes supporting tenant/category/department/classification/grantee lookups.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Only authorized roles may manage policies.
- [ ] Test revocation across document API, downloads, chunks, retrieval, citation/source viewer, and exports through contracts/fakes.
- [ ] Never accept tenant ID from the client.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle deleted role/department references, conflicting grants, stale policy version, and partial batch update.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Policy precedence and scope unit tests.
- [ ] Cross-tenant grant and IDOR tests.
- [ ] Revocation propagation contract tests with fake index/retrieval adapters.
- [ ] Frontend effective-access preview and confirmation tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Audit every policy change, impact count, approval, and denied access.
- [ ] Track reindex/update required by policy changes.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Publish `DocumentAccessPolicyEvaluator` and search-filter contracts with in-memory implementation.
- [ ] Document, indexing, retrieval, and chat teams can consume these contracts independently.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- General enterprise IAM/SSO directory synchronization.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Policy changes affect read/download/search authorization
- [ ] Employees see only permitted documents
- [ ] Admin can preview impacted users
- [ ] Sensitive changes are audited
- [ ] Cross-tenant policies are impossible

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 19 — Implement Intent Detection and Bilingual Query Expansion Agent

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | RAG |
| Suggested owner | AI/Backend |
| Complexity | Large |
| Branch | `feature/19-implement-intent-detection-and-bilingual-query-expansion-agent` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Convert user questions into structured, multilingual search plans.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- No intent detection, follow-up query rewriting, bilingual expansion, query plan schema, or specialized intent agent currently exists.

## User and Product Outcomes

- Arabic, English, and mixed-language questions are converted into a safe structured retrieval plan.
- Follow-up questions use authorized conversation context without inventing facts.
- Non-knowledge intents and unsupported requests are routed or refused predictably.

## SRS Requirements Covered

- `FR-AGT-002..003`
- `FR-RAG-002`

## Current Code Areas to Inspect First

- `api/src/modules/chat/`
- `api/src/modules/retrieval/`
- `api/src/providers/llm/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Implement an `IntentQueryAgent` on the shared agent runtime with deterministic fake behavior for tests.
- [ ] Define intent classes such as knowledge question, follow-up, document-specific query, comparison, summarization, navigation, administrative action request, unsupported/general question, and unsafe request.
- [ ] Produce structured output containing normalized question, language, detected entities, temporal constraints, referenced documents, departments/categories, exact terms/numbers, semantic queries, keyword queries, and confidence.
- [ ] Use conversation context only from the authenticated user's accessible conversation and limit context length.
- [ ] Support Arabic-English terminology expansion while preserving proper nouns, policy names, clause numbers, dates, and quoted phrases.
- [ ] Do not translate or broaden sensitive constraints in a way that weakens access filtering.
- [ ] Detect ambiguity and return a clarification request when retrieval would otherwise be unreliable.
- [ ] Add deterministic validation/normalization after the agent output.
- [ ] Expose a tool/service contract consumed by retrieval and a debug view for authorized traces.
- [ ] Create a bilingual evaluation dataset with expected plans and failure cases.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Detect language/intent
- [ ] Resolve follow-up context
- [ ] Expand Arabic/English terminology
- [ ] Extract entities and filters
- [ ] Produce typed search plan
- [ ] Add evaluation dataset

## Backend and Domain Implementation

- [ ] Use structured schemas and maximum query counts/lengths.
- [ ] Do not perform retrieval or answer generation here.

### Recommended Code Ownership / Path Boundaries

- intent/query agent and schema
- conversation-context adapter
- bilingual evaluation corpus
- clarification contract
- agent tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Support clarification prompts and show safe progress states in chat adapters.
- [ ] Do not expose internal chain-of-thought; only structured user-facing clarification.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define query-plan, intent, entity, language, and clarification DTOs.
- [ ] Version prompt/model and plan schema.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Conversation context and referenced document IDs must be tenant/user authorized before use.
- [ ] Treat prompt injection text in user input as data and enforce system/tool policies.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle invalid structured output, low confidence, unsupported language, oversized context, and model outage with deterministic fallback.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Arabic, English, mixed, follow-up, exact clause/number, ambiguous, malicious, and document-specific cases.
- [ ] Cross-conversation/tenant context tests.
- [ ] Prompt/model version regression dataset.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Trace intent, confidence, generated query counts, language, clarification rate, tokens, cost, latency, and fallback usage.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Publish query-plan fixtures and fake agent.
- [ ] Retrieval can consume the contract without a live model or conversation implementation.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Search execution, reranking, answer writing, or compliance verification.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Agent output is schema-valid
- [ ] Mixed Arabic/English queries are supported
- [ ] Unsafe instructions do not become tools
- [ ] Low confidence is visible
- [ ] Fake retrieval tool supports tests

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 20 — Implement Tenant and Role Filtered Hybrid Retrieval

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | RAG |
| Suggested owner | AI/Backend |
| Complexity | Very Large |
| Branch | `feature/20-implement-tenant-and-role-filtered-hybrid-retrieval` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Combine semantic and keyword search without permission leakage.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- No vector search, keyword/BM25 retrieval, hybrid fusion, tenant/role filters, document-version filtering, or retrieval tool implementation currently exists.

## User and Product Outcomes

- Every search returns only evidence the authenticated user is allowed to use.
- Semantic and exact-term retrieval work together for Arabic/English policies, contracts, numbers, names, and clauses.
- Retrieval can be evaluated independently of answer generation.

## SRS Requirements Covered

- `FR-RAG-003..004`

## Current Code Areas to Inspect First

- `api/src/modules/retrieval/`
- `api/src/providers/embeddings/`
- `api/src/db/models/documentChunk.model.ts`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define a typed `HybridRetrievalService`/agent tool consuming the structured query plan and authenticated access context.
- [ ] Implement semantic vector retrieval and keyword retrieval through provider-neutral adapters; provide deterministic fixture indexes.
- [ ] Compile mandatory filters for tenant, active document version, document status, access policy, role/department/classification, explicit grants, and allowed AI-use.
- [ ] Fuse result lists using a documented deterministic algorithm such as reciprocal rank fusion with configurable weights.
- [ ] Support exact document/category/date/version filters from the query plan.
- [ ] Deduplicate identical/overlapping chunks and apply diversity/MMR only at the appropriate stage or expose candidates to Issue 21.
- [ ] Return candidates with scores, source IDs, page/section, access-policy version, retrieval method, and safe snippets.
- [ ] Set configurable candidate limits and token/latency budgets.
- [ ] Create no-result/low-confidence outcomes distinct from system errors.
- [ ] Build an offline evaluation corpus and metrics for recall@k, tenant leakage, exact-number/term retrieval, bilingual queries, and latency.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create retrieval service
- [ ] Apply tenant/permission/version filters
- [ ] Fuse vector and keyword scores
- [ ] Support metadata/date filters
- [ ] Record search traces
- [ ] Add leakage and relevance tests

## Backend and Domain Implementation

- [ ] Authorization filters must be applied by the datastore query, not after retrieval.
- [ ] Revalidate access before returning candidate text.
- [ ] Do not send evidence to a model in this issue.

### Recommended Code Ownership / Path Boundaries

- hybrid retrieval service/tool
- vector/keyword adapters
- filter compiler/fusion
- evaluation corpus
- leakage/contract tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] No employee-facing UI required; optional internal retrieval debugger must be permission-protected and redacted.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define retrieval request, candidate, score breakdown, filter summary, and result diagnostics.
- [ ] Expose as internal service/tool rather than a public unrestricted search endpoint.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Mandatory negative tests for cross-tenant chunks, revoked access, stale versions, and guessed document IDs.
- [ ] Never accept tenant/access filters from model output as authoritative.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle vector store outage, keyword index outage, partial mode degradation, malformed plan, excessive filters, and empty result.
- [ ] Define whether one search mode may continue when the other is unavailable.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Provider contract tests with fixture vector/keyword indexes.
- [ ] Tenant/access/version leakage suite.
- [ ] Arabic/English exact/semantic hybrid evaluation.
- [ ] Fusion determinism and latency budget tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Record search modes, filters, candidate counts, latency per backend, score distribution, no-result rate, and trace/evidence IDs.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume frozen query plans, chunk corpus, and access-filter interfaces.
- [ ] Publish candidate fixtures for reranking and answer-agent teams.
- [ ] Do not require live embeddings/vector database in CI.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Reranking, final evidence packaging, answer generation, citations, or chat UI.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Unauthorized chunks never reach agents
- [ ] Hybrid results outperform single-mode baseline on test set
- [ ] Current approved versions are preferred
- [ ] Search is explainable and traced
- [ ] Fixture index supports local tests

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 21 — Implement Reranking and Evidence Packaging

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | RAG |
| Suggested owner | AI/Backend |
| Complexity | Large |
| Branch | `feature/21-implement-reranking-and-evidence-packaging` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Return concise, diverse, high-quality evidence packages for answer generation.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- No reranking model/provider, diversity control, evidence token budgeting, version preference, or stable evidence-bundle contract exists.

## User and Product Outcomes

- Retrieved candidates are converted into a compact, diverse, high-quality evidence package suitable for answer generation.
- Old, duplicated, irrelevant, and unauthorized evidence is excluded before the Answer Writer receives it.

## SRS Requirements Covered

- `FR-RAG-003`
- `FR-RAG-005`

## Current Code Areas to Inspect First

- `api/src/modules/retrieval/`
- `api/src/modules/citations/`
- `api/src/providers/llm/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define a provider-neutral `Reranker` interface with deterministic lexical/fixture fallback and optional production model adapter.
- [ ] Consume hybrid retrieval candidates and revalidate tenant/access/version state before ranking.
- [ ] Rank by semantic relevance, exact-term support, source authority, active version, recency/effective date, document quality, and query intent using documented features.
- [ ] Implement diversity/MMR or equivalent to avoid redundant adjacent chunks while preserving necessary neighboring context.
- [ ] Detect and group conflicting evidence rather than silently selecting one side.
- [ ] Construct an `EvidenceBundle` containing ordered evidence items, source metadata, score explanation, conflict flags, access-policy version, token count, and citation anchors.
- [ ] Apply deterministic token/context budgets and truncate only at safe semantic boundaries.
- [ ] Support neighbor expansion when a clause/table requires context, while preserving access filters.
- [ ] Return explicit `SUFFICIENT`, `WEAK`, `CONFLICTING`, or `NO_EVIDENCE` assessment with reasons.
- [ ] Build an offline reranking evaluation set and comparison metrics.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create reranker adapter
- [ ] Remove duplicate/overlapping chunks
- [ ] Apply diversity and version preference
- [ ] Build evidence package schema
- [ ] Add confidence thresholds
- [ ] Add evaluation tests

## Backend and Domain Implementation

- [ ] Reranking is an internal service/agent tool and must not expose unrestricted text.
- [ ] Do not generate the answer here.

### Recommended Code Ownership / Path Boundaries

- reranker/evidence bundle service
- conflict/diversity/token budgeting
- internal debugger
- evaluation tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Optional internal evidence debugger may show ranked items and score explanations to authorized developers/admins.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define rerank request/result, evidence item, bundle, conflict group, citation anchor, and sufficiency DTOs.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Recheck access before and after neighbor expansion.
- [ ] Do not let a model override active-version or authorization rules.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle reranker outage with deterministic fallback, oversized candidate sets, missing source metadata, and stale policy/version.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Ordering, deduplication, diversity, conflict grouping, token-budget, and fallback tests.
- [ ] Access-revocation during reranking test.
- [ ] Offline relevance metrics against fixed corpus.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Record provider/model, candidate-to-evidence reduction, score changes, conflicts, token budget, latency, cost, and fallback use.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume candidate fixtures and publish evidence-bundle fixtures.
- [ ] Answer/citation agents can develop against the frozen bundle without live retrieval.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Answer writing, claim extraction, citation verification, or user-facing chat.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Evidence package is deterministic under fake reranker
- [ ] Duplicate evidence is reduced
- [ ] Unsupported/weak sets are flagged
- [ ] Permission metadata is preserved
- [ ] Latency and cost are recorded

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 22 — Implement Answer Writer, Citation Verification, and Compliance Agents

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | RAG |
| Suggested owner | AI/Backend |
| Complexity | Very Large |
| Branch | `feature/22-implement-answer-writer-citation-verification-and-compliance-agents` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Generate grounded answers and reject unsupported output.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Answer generation, citation verification, compliance checking, evidence-only prompts, refusal mode, and claim-to-source mapping are not implemented.

## User and Product Outcomes

- Employees receive concise answers grounded only in authorized evidence, with verifiable citations.
- Unsupported, conflicting, injected, unsafe, or unauthorized answers are refused or qualified.
- Every important claim can be mapped to source document, version, page, section, chunk, and allowed snippet.

## SRS Requirements Covered

- `FR-RAG-005..009`
- `FR-AGT-002`

## Current Code Areas to Inspect First

- `api/src/modules/chat/`
- `api/src/modules/citations/`
- `api/src/modules/retrieval/`
- `api/src/providers/llm/`
- `api/src/db/models/citation.model.ts`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Implement separate Answer Writer, Citation Verification, and Compliance agents using the controlled runtime; responsibilities must remain distinct even if one model provider is reused.
- [ ] Answer Writer consumes only an approved `EvidenceBundle`, user question, language, and safe conversation context.
- [ ] Require structured draft output with claims, claim IDs, answer text segments, proposed citation anchors, uncertainty, and refusal candidate.
- [ ] Citation Verification independently checks each material claim against evidence and returns supported/partially supported/unsupported plus corrected anchors.
- [ ] Compliance checks authorization metadata, prompt-injection indicators, unsupported claims, unsafe disclosure, conflicting evidence handling, language requirements, and refusal rules.
- [ ] Finalizer produces either approved answer + verified citations, a conflict-aware response, a clarification, or grounded refusal.
- [ ] Never expose evidence or snippets the user cannot view; source viewer permissions are rechecked later.
- [ ] Support Arabic, English, and mixed-language answers while preserving document names, clause numbers, and quoted terms.
- [ ] Create prompt/model/version configurations, deterministic fakes, and a regression evaluation dataset.
- [ ] Integrate Knowledge Gap port: refusal/weak/conflict outcomes emit a structured gap candidate without requiring Issue 24.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Implement Answer Writer agent
- [ ] Create claim/citation schema
- [ ] Implement Citation Verification agent
- [ ] Implement Compliance agent
- [ ] Implement refusal rules
- [ ] Add prompt-injection and citation evaluation tests

## Backend and Domain Implementation

- [ ] Use typed agent tools and strict maximum tool/model steps.
- [ ] Do not permit free-form database or network access.
- [ ] Persist answer-generation trace and claim/citation map.

### Recommended Code Ownership / Path Boundaries

- answer/citation/compliance agents
- claim/citation schemas
- finalizer/refusal contract
- evaluation corpus
- security/groundedness tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Provide response DTOs that clearly distinguish answer, refusal, clarification, and conflict states.
- [ ] User-facing UI belongs primarily to Issue 23, but include fixtures and rendering examples.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define draft answer, claim, verified citation, compliance result, final answer, refusal, and gap-candidate schemas.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Treat retrieved document instructions as untrusted data.
- [ ] Authorization is deterministic; agents cannot expand access.
- [ ] Redact sensitive trace content and prohibit hidden prompt disclosure.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle invalid structured output, citation mismatch, unsupported claim, model outage, budget exhaustion, compliance disagreement, and evidence revocation mid-run.
- [ ] On verification failure, retry/rewrite within strict limits or refuse.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Claim-level citation support tests using fixed evidence.
- [ ] Prompt injection, unauthorized snippet, stale version, conflict, no-evidence, weak-evidence, and multilingual tests.
- [ ] Deterministic agent/fallback/provider contract tests.
- [ ] Regression evaluation for groundedness, citation precision/coverage, refusal correctness, latency, and cost.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Trace all agents, prompts, tool calls, claims, verification results, compliance decisions, tokens, cost, latency, retries, and final outcome.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume frozen evidence bundles and agent-runtime interfaces with fakes.
- [ ] Publish final answer stream/DTO fixtures for chat and knowledge-gap teams.
- [ ] Do not require live retrieval, chat persistence, or knowledge-gap storage.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Conversation UI, vector retrieval, document parsing, or unrestricted general chatbot behavior.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Every material claim maps to evidence
- [ ] Unauthorized citations are rejected
- [ ] Unsupported answers refuse
- [ ] Prompt injection tests pass
- [ ] Arabic/English output follows user language

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 23 — Build Conversations, Streaming Chat, and Source Viewer

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Chat |
| Suggested owner | Full-stack |
| Complexity | Very Large |
| Branch | `feature/23-build-conversations-streaming-chat-and-source-viewer` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Deliver the complete employee-facing chat experience.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- The employee chat page is a coming-soon placeholder, and conversation/message models and routes are empty.
- No streaming protocol, source viewer, persistence, sharing policy, or recoverable user experience exists.

## User and Product Outcomes

- Employees can create conversations, ask questions, watch progress/streamed answers, inspect authorized sources, and manage their own history.
- The UI works against a fake answer stream before live RAG is connected.
- Conversation and source access remain tenant/user/permission scoped.

## SRS Requirements Covered

- `FR-RAG-001`
- `FR-RAG-008`
- `NFR-PERF-001`

## Current Code Areas to Inspect First

- `api/src/db/models/conversation.model.ts`
- `api/src/db/models/message.model.ts`
- `api/src/modules/chat/`
- `app/src/app/chat/page.tsx`
- `app/src/services/chat.service.ts`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define conversation and message models with tenant, owner, title, status, timestamps, language, archived/deleted state, and optional authorized share grants.
- [ ] Persist user messages, assistant final states, refusal/clarification/conflict outcomes, verified citation references, trace ID, model summary, and feedback linkage.
- [ ] Define a versioned streaming protocol using SSE or an equally appropriate transport with events for accepted, planning, retrieving, reranking, drafting, verifying, final answer, citation, refusal, error, canceled, and heartbeat.
- [ ] Create conversation CRUD: list, create, detail/history, rename, archive/restore, delete, and authorized share/revoke if sharing is in scope.
- [ ] Users see their own conversations by default; any shared/team visibility requires explicit permission and grant.
- [ ] Create a pluggable `AnswerOrchestrator`/stream adapter with fake deterministic implementation and live adapter placeholder.
- [ ] Build responsive bilingual chat UI with conversation sidebar, composer, streaming state, retry/cancel, empty state, refusal/clarification/conflict rendering, and accessible keyboard behavior.
- [ ] Build source viewer showing document title, active version, page, section, chunk/snippet, and download/open action only after fresh authorization.
- [ ] Handle reconnect/resume or safe retry when a stream drops; never create duplicate user messages/agent runs on retry.
- [ ] Add message-level feedback hooks consumed by Issue 24.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create conversation/message persistence
- [ ] Add streaming/progress protocol
- [ ] Build chat UI
- [ ] Build citation/source viewer
- [ ] Add rename/archive/delete/share rules
- [ ] Add E2E and responsive tests

## Backend and Domain Implementation

- [ ] Use idempotency key per submitted user message.
- [ ] Separate persisted final result from transient progress events.
- [ ] Reauthorize source access at view/download time.

### Recommended Code Ownership / Path Boundaries

- conversation/message/share models
- chat/stream API
- answer orchestrator adapter
- chat/source UI
- browser/security tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Do not display internal chain-of-thought; progress events are high-level workflow statuses.
- [ ] Support mobile sidebar/drawer, RTL/LTR, long citations, code/table formatting where safe, and screen-reader announcements.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define conversation/message/share/citation reference schemas and all REST/stream contracts.
- [ ] Provide a fake stream fixture package or module for isolated frontend tests.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Tenant/user ownership on every conversation/message query.
- [ ] Protect against IDOR, unauthorized sharing, source revocation, XSS/unsafe markdown, and prompt content leakage.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle rate limit, quota denial, orchestrator outage, stream interruption, cancellation race, stale conversation, and source permission revoked after answer.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] API integration for CRUD/ownership/idempotency.
- [ ] Streaming protocol parser/reconnect/cancel tests.
- [ ] Browser E2E for ask/refusal/clarification/source viewing using fake stream.
- [ ] XSS, cross-tenant conversation/source, and accessibility/responsive tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Correlate user message, stream, agent run, citations, errors, cancel, retry, and feedback.
- [ ] Measure first-event latency, first-token/final latency, abandonment, and source-open rate.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Use a fake `AnswerOrchestrator` and fixed final-answer fixtures.
- [ ] Do not wait for agent runtime, retrieval, or answer agents.
- [ ] Expose a stable adapter for later live integration.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Implementing retrieval, answer-agent internals, document processing, or general-purpose non-grounded chat.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Employees see only authorized conversations
- [ ] Streaming errors are recoverable
- [ ] Sources show version/page/section
- [ ] Refusals are clear
- [ ] A fake answer service supports UI tests

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 24 — Implement Knowledge Gap Agent, Feedback, and Resolution Workflow

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Knowledge |
| Suggested owner | AI/Full-stack |
| Complexity | Large |
| Branch | `feature/24-implement-knowledge-gap-agent-feedback-and-resolution-workflow` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Turn unanswered and low-quality questions into actionable knowledge work.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Knowledge-gap backend/model files are empty and the current dashboard page is static/demo content.
- Feedback persistence and a gap clustering/resolution lifecycle are not implemented.

## User and Product Outcomes

- Refused, weak, conflicting, and negatively rated questions become actionable knowledge gaps.
- Company Admins can triage, assign, resolve, dismiss, reopen, and verify whether new documents improved coverage.
- Employees can give simple feedback without seeing administrative data.

## SRS Requirements Covered

- `FR-GAP-001..004`
- `FR-FB-001`

## Current Code Areas to Inspect First

- `api/src/db/models/knowledgeGap.model.ts`
- `api/src/modules/knowledge-gaps/`
- `api/src/modules/feedback/`
- `app/src/app/(dashboard)/dashboard/knowledge-gaps/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define gap candidate inputs from answer workflows: question, normalized intent, outcome, evidence summary IDs, confidence, conflict type, tenant, actor/department where allowed, and trace.
- [ ] Persist knowledge gaps with status, severity, topic, department, cluster key, count, first/last occurrence, assignee, due date, linked documents, resolution notes, and audit history.
- [ ] Implement a Knowledge Gap Agent that proposes topic, duplicate/cluster match, department, severity, required document type, and suggested action using structured output.
- [ ] Use deterministic similarity/threshold validation and human review; the agent must not silently merge unrelated gaps.
- [ ] Implement feedback on assistant messages: thumbs up/down and optional comment/category, with permission/privacy rules.
- [ ] Create lifecycle actions: assign, prioritize, link document, resolve, dismiss, reopen, merge/split cluster, and verify.
- [ ] On new/reprocessed documents, provide a reevaluation job/port that tests representative gap questions and records improved/not-improved evidence without auto-closing unless policy allows.
- [ ] Build Employee feedback UI and Company Admin gap dashboard with filters, cluster detail, occurrences, linked answers/documents, assignment, resolution, and trend views.
- [ ] Expose safe aggregate metrics to dashboards/analytics.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create gap/feedback models
- [ ] Cluster similar questions
- [ ] Implement gap agent
- [ ] Build admin list/filters/assignment
- [ ] Support resolve/dismiss/reopen
- [ ] Measure resolution after document updates

## Backend and Domain Implementation

- [ ] Store representative question safely; consider redaction/retention for sensitive content.
- [ ] Gap Agent outputs are proposals; deterministic service owns lifecycle.

### Recommended Code Ownership / Path Boundaries

- feedback/gap models and services
- knowledge-gap agent
- lifecycle/reevaluation APIs
- employee/admin UI
- clustering/security tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Employees can see their feedback status but not other users' gap details.
- [ ] Admin UI must distinguish system-generated evidence from agent recommendations.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define feedback, gap, occurrence, cluster, resolution, reevaluation result, and agent proposal schemas.
- [ ] Add feedback and gap CRUD/lifecycle/filter endpoints.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Tenant/permission scope on all gaps and feedback.
- [ ] Restrict raw user/question content and conversation links according to privacy policy.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle duplicate occurrences, stale merge/split, deleted linked documents, reevaluation failure, and agent low confidence.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Gap creation from refusal/weak/conflict fixtures.
- [ ] Clustering/merge/split/lifecycle tests.
- [ ] Feedback ownership and tenant isolation tests.
- [ ] Browser E2E for feedback and admin resolution using fake agent/reevaluation.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Track gap creation source, clustering confidence, lifecycle duration, recurrence, reevaluation outcome, and feedback trends.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume final-answer/gap-candidate fixtures and fake agent/reevaluation ports.
- [ ] Do not wait for live chat/RAG/document processing.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Automatically authoring or publishing company policy documents.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Refusals and negative feedback create/update gaps
- [ ] Similar gaps are grouped
- [ ] Admin actions are audited
- [ ] Resolution links to evidence/document
- [ ] Fake agent supports deterministic tests

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 25 — Implement Entitlement and Concurrency-Safe Quota Enforcement

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Commercial |
| Suggested owner | Backend/Full-stack |
| Complexity | Very Large |
| Branch | `feature/25-implement-entitlement-and-concurrency-safe-quota-enforcement` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Enforce package limits consistently across product operations.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Packages store some limits, but no centralized entitlement service, usage reservation, concurrency-safe counters, quota middleware, or upgrade-aware denial flow exists.

## User and Product Outcomes

- Every tenant action is allowed or denied consistently according to the active subscription snapshot.
- Concurrent requests cannot exceed employee, document, storage, AI, token, OCR, export, or model limits.
- Users receive clear limit information and safe upgrade guidance.

## SRS Requirements Covered

- `FR-PAY-005..006`

## Current Code Areas to Inspect First

- `api/src/db/models/package.model.ts`
- `api/src/db/models/subscription.model.ts`
- `api/src/modules/platform/`
- `api/src/modules/users/`
- `api/src/modules/documents/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define canonical entitlement keys and quota dimensions: admins, employees, documents, storage bytes, max file size, monthly AI queries, prompt/completion/embedding tokens, OCR pages, allowed models, analytics level, exports, retention, and feature flags.
- [ ] Create an immutable `EntitlementSnapshot` derived from the authoritative subscription/package version.
- [ ] Implement an `EntitlementService` with `check`, `reserve`, `commit`, `release`, `consume`, and `getUsage` semantics.
- [ ] Use atomic database/Redis operations or transactions for concurrency-safe counters and reservations.
- [ ] Define billing periods/time zones, reset behavior, trial/grace/past-due behavior, and manual Super Admin overrides.
- [ ] Integrate through middleware/service guards for user invitation/import, document upload/storage, processing/OCR, AI query/model selection, analytics/export, and retention jobs.
- [ ] Support soft warnings at configurable thresholds and hard denials with stable upgrade-aware error payloads.
- [ ] Reconcile counters from authoritative records/events and provide repair tooling.
- [ ] Build company usage/limits UI and contextual upgrade prompts; Super Admin sees overrides and discrepancies.
- [ ] Emit usage events compatible with analytics without double-counting retries.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Create central entitlement service
- [ ] Implement atomic usage counters
- [ ] Enforce user/document/storage/OCR/AI/model/export limits
- [ ] Add upgrade-aware errors
- [ ] Build usage UI
- [ ] Add concurrency/security tests

## Backend and Domain Implementation

- [ ] Do not query package documents directly in every feature; consume one snapshot/service.
- [ ] Use idempotency keys so retries do not double-consume.
- [ ] Define reservation expiry and cleanup.

### Recommended Code Ownership / Path Boundaries

- entitlement snapshot/service
- atomic counters/reservations
- feature integration ports/middleware
- usage UI
- concurrency/reconciliation tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Show current/limit/period/reset and the exact blocked capability.
- [ ] Do not promise an upgrade action the user lacks billing permission to perform.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define entitlement snapshot, usage counter, reservation, override, reconciliation, and denial DTOs.
- [ ] Provide internal ports plus company/super-admin read APIs.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Tenant scope and permission on usage/override queries.
- [ ] Clients cannot choose limits or mark usage committed.
- [ ] Audit manual overrides and quota bypass.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle subscription state change during reservation, expired reservation, counter store outage, reconciliation mismatch, and provider webhook delay.
- [ ] Choose fail-open/fail-closed explicitly per capability; security/cost-sensitive operations generally fail closed.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Concurrent limit tests, reservation/commit/release/idempotency tests.
- [ ] Period reset, trial/grace/past-due, override, and reconciliation tests.
- [ ] Integration contract tests for fake user/document/AI/OCR actions.
- [ ] Frontend denial/usage/upgrade UX tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Track checks, warnings, denials, reservations, expiries, reconciliation drift, and per-entitlement usage.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume documented subscription snapshots or local fixtures.
- [ ] Publish an in-memory entitlement adapter for all other issues.
- [ ] Do not wait for real payments or analytics persistence.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Charging customers, refunds, invoice generation, or pricing strategy decisions.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Concurrent requests cannot exceed hard limits
- [ ] Every restricted operation uses the service
- [ ] Admins see current/limit values
- [ ] Plan changes update access safely
- [ ] Tests cover race conditions

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 26 — Complete Super Admin Company, Package, and Subscription Operations

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Super Admin |
| Suggested owner | Full-stack |
| Complexity | Large |
| Branch | `feature/26-complete-super-admin-company-package-and-subscription-operations` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Make the platform console complete, real, and internally consistent.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- A broad Super Admin console exists with real database-backed pages, but company/tenant UIs are duplicated and operations are incomplete.
- Jobs are represented by document status rather than real queue jobs, cost metrics are estimated, and settings may not affect runtime.

## User and Product Outcomes

- Super Admin has one coherent, permission-protected platform console for tenants, packages, subscriptions, payments, jobs, providers, usage, audit, and system health.
- Destructive or support actions are explicit, confirmed, time-limited where needed, and auditable.

## SRS Requirements Covered

- `FR-SA-001..005`

## Current Code Areas to Inspect First

- `api/src/modules/platform/`
- `api/src/modules/admin/`
- `app/src/app/(dashboard)/super-admin/`
- `app/src/app/(dashboard)/platform/`
- `app/src/services/super-admin.service.ts`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Consolidate duplicate company/tenant routes/pages/services into one canonical information architecture.
- [ ] Implement tenant detail covering status, admins/users, package/subscription/payment summary, usage/limits, documents, jobs, audit, provider issues, and support notes.
- [ ] Support suspend/reinstate with reason, effective timing, impact preview, and audit. Define delete/archive/data-retention policy; implement only if approved.
- [ ] Complete package version management and subscription manual override through normalized domain interfaces.
- [ ] Display verified payment/webhook/invoice summaries through provider-neutral ports; do not calculate fake costs.
- [ ] Display real queue/worker/job health through a `QueueOperationsPort`; support safe retry/cancel/replay subject to policy.
- [ ] Make system/AI/provider settings typed, validated, versioned, audited, and connected to runtime configuration ports.
- [ ] Implement optional support-access/impersonation only if approved: explicit tenant consent or policy, reason, time limit, visible banner, no secret exposure, and full audit.
- [ ] Add real filters, pagination, exports, loading/error/empty states, mobile layout, and overflow-safe cards/dialogs/tables.
- [ ] Remove hardcoded metrics and duplicate service paths.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Consolidate duplicate tenant/company screens
- [ ] Add create/suspend/reactivate/delete policies
- [ ] Complete package/version operations
- [ ] Add subscription drilldown and overrides
- [ ] Add real jobs/health views
- [ ] Add audit and responsive tests

## Backend and Domain Implementation

- [ ] Aggregate through dedicated platform services with pagination and bounded queries.
- [ ] All routes require `SUPER_ADMIN` and sensitive operations require step-up confirmation semantics where practical.

### Recommended Code Ownership / Path Boundaries

- canonical platform API/services
- consolidated Super Admin routes/pages
- provider/queue/analytics adapters
- destructive/support flows
- browser/security tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Use one design system, responsive layout, confirmation flows, and clear operational status.
- [ ] Never imply a provider/job is healthy when the adapter cannot verify it.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define consolidated tenant summary/detail, platform health, queue jobs, provider status, and operation request DTOs.
- [ ] Consume interfaces/fakes for payment, queue, entitlement, analytics, and settings.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Audit every platform change and support access.
- [ ] Redact tenant secrets, token values, raw payment data, and document content.
- [ ] Prevent arbitrary tenant-context mutation from client-supplied IDs without server authorization.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle partial provider outage, stale tenant state, conflicting admin actions, failed suspension hooks, and unavailable aggregate source.
- [ ] Show partial-data status rather than presenting zeros as truth.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Super Admin authorization on every route.
- [ ] Consolidated API integration and pagination/filter tests.
- [ ] Destructive/support audit tests.
- [ ] Responsive/browser tests for company management cards, dialogs, tables, and error states.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Trace platform operations and aggregate-source failures.
- [ ] Measure page/API latency and failed admin actions.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Use provider-neutral ports and fixture adapters for payment, queue, entitlement, analytics, and runtime settings.
- [ ] Do not wait for those feature implementations.
- [ ] Own only canonical Super Admin pages/services; avoid modifying Company Admin modules.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Employee-facing features or implementing underlying RAG/payment/queue engines.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] No static platform metric remains where a real source exists
- [ ] Duplicate screens are removed
- [ ] Destructive actions require confirmation
- [ ] Overrides require reason and audit
- [ ] All pages are responsive

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 27 — Complete Company Admin Dashboard, Settings, and Custom-Role UX

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Company Admin |
| Suggested owner | Full-stack |
| Complexity | Large |
| Branch | `feature/27-complete-company-admin-dashboard-settings-and-custom-role-ux` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Replace placeholders with real tenant operations and analytics.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Company Admin pages exist for users, roles, documents, and placeholders, while the main dashboard/analytics/settings/knowledge-gap content is partly static or coming soon.
- Custom roles are not yet effective in the current code, but this issue can consume a permission-management contract.

## User and Product Outcomes

- Company Admin gets one complete, real-data workspace for company operations.
- Every page reflects permissions, subscription entitlements, processing state, and real backend data.
- Static metrics and dead controls are removed.

## SRS Requirements Covered

- `FR-COMP-001..004`

## Current Code Areas to Inspect First

- `app/src/app/(dashboard)/dashboard/`
- `api/src/modules/users/`
- `api/src/modules/roles/`
- `api/src/modules/documents/`
- `api/src/modules/platform/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Create a real tenant dashboard summary with users/invitations, documents/status, AI usage, knowledge gaps, emails/imports, quota warnings, and recent audited activity through bounded APIs.
- [ ] Complete employee management UX: invite, resend/revoke, suspend/reactivate, update, remove, role assignment, filters/search/pagination, and import entry points.
- [ ] Complete custom-role UX using the permission catalog/editor/assignment contracts, including inherited vs explicit access and usage counts.
- [ ] Complete document overview integration with upload, statuses, versions, access policies, quality/review, retry/reprocess links, and permission-based actions.
- [ ] Complete company settings for profile, branding, default language, email branding, AI/runtime preferences allowed to tenant, retention where entitled, and notification settings.
- [ ] Add billing/subscription read view, usage/limits, invoice/portal links when the actor has permission, and upgrade requests.
- [ ] Integrate knowledge-gap and analytics summaries through fixture/provider ports.
- [ ] Replace all static metrics, fake activities, placeholder actions, `#` links, and coming-soon panels relevant to this scope.
- [ ] Ensure responsive mobile navigation, tables, cards, dialogs, drawers, RTL/LTR, loading/error/empty states, and accessibility.
- [ ] Create consistent route-level permission guards and refresh authorization after role changes.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Build real overview metrics
- [ ] Add company profile/settings
- [ ] Complete custom-role permission editor
- [ ] Add employee/document/import widgets
- [ ] Add subscription usage panel
- [ ] Add responsive/E2E tests

## Backend and Domain Implementation

- [ ] Create tenant-scoped dashboard/settings aggregation endpoints with explicit fields and pagination.
- [ ] Settings must be typed and actually consumed by runtime ports where applicable; otherwise label as stored-only and avoid pretending.

### Recommended Code Ownership / Path Boundaries

- tenant dashboard/settings aggregates
- Company Admin routes/pages
- role/user/document/billing/gap adapters
- responsive/RTL UX
- browser/permission tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Use feature adapters/fixtures to avoid waiting for live analytics, gaps, payment, import, email, or processing.
- [ ] Do not duplicate Super Admin company management.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define company dashboard summary, settings, branding, notification, billing summary, and recent activity DTOs.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Only Company Admin or explicit custom permissions access each panel/action.
- [ ] Employee routes must not accidentally inherit admin layout access.
- [ ] Audit settings, role, employee, billing-request, and destructive actions.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle partial dashboard source outage with per-widget status.
- [ ] Prevent stale form overwrite using version/updatedAt conflict handling.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Permission-matrix and tenant-isolation integration tests.
- [ ] Browser E2E for dashboard, settings, roles, users, and mobile/RTL layouts using fixtures.
- [ ] Static/mock-content detection test where feasible.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Track dashboard source failures, admin actions, settings changes, and page performance.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Consume stable ports with fixture adapters for incomplete services.
- [ ] Own Company Admin routes/components and aggregation endpoints only.
- [ ] Do not wait for live RAG/payment/analytics implementations.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Implementing the underlying agent, retrieval, payment, queue, or analytics engines.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] No mock KPIs remain
- [ ] Settings persist and affect runtime where applicable
- [ ] Role editor prevents escalation
- [ ] Dashboard obeys permissions
- [ ] Empty/error/loading states are complete

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 28 — Implement Token, Cost, Latency, Quality Analytics and Insight Agent

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Analytics |
| Suggested owner | AI/Full-stack |
| Complexity | Very Large |
| Branch | `feature/28-implement-token-cost-latency-quality-analytics-and-insight-agent` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Provide accurate operational and AI quality analytics.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Current usage data is coarse; token counts, provider/model cost, latency, retrieval quality, citations, refusal, agent traces, and company analytics are not fully recorded.
- Some Super Admin cost metrics are hard-coded estimates.

## User and Product Outcomes

- Authorized admins understand real AI/document/email/job usage, cost, latency, quality, and trends.
- An Analytics Insight Agent can propose evidence-based observations without taking destructive actions.
- Metrics are derived from actual events and can be reconciled.

## SRS Requirements Covered

- `FR-ANA-001..004`
- `FR-AUD-001`

## Current Code Areas to Inspect First

- `api/src/db/models/usageLog.model.ts`
- `api/src/modules/analytics/`
- `api/src/modules/platform/platform.service.ts`
- `app/src/app/(dashboard)/dashboard/analytics/`
- `app/src/app/(dashboard)/super-admin/usage/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Define a canonical usage/event model for prompts, completions, embeddings, OCR pages, agent runs/tools, retrieval, reranking, citations, refusals, feedback, document processing, emails, imports, jobs, and provider costs.
- [ ] Record provider, model/version, tenant, actor/department where allowed, document/evidence IDs, tokens/units, cost in minor units/currency, latency, success/failure, trace, and idempotency key.
- [ ] Create event ingestion interfaces used by all feature adapters and prevent duplicate counting on retries.
- [ ] Build aggregation pipelines/materialized summaries for date, tenant, department, user (permission-limited), model, provider, document, workflow, and outcome.
- [ ] Calculate real cost from provider usage/pricing snapshots; label estimated vs invoiced vs reconciled cost.
- [ ] Implement quality metrics such as no-evidence rate, refusal correctness sample, citation coverage/precision signals, feedback, retrieval recall evaluation, and processing quality.
- [ ] Provide filters, comparison periods, drill-down, bounded export, and quota/forecast views.
- [ ] Implement an Analytics Insight Agent that consumes aggregated sanitized metrics and returns structured insight, evidence metric IDs, confidence, and recommended action; no automatic billing/security changes.
- [ ] Build Company Admin and Super Admin dashboards with real APIs, partial-data indicators, and permission-aware exports.
- [ ] Provide backfill/reconciliation tooling for event gaps.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Expand usage event schema
- [ ] Record model/provider/tokens/cost/latency/retrieval/citations/refusal
- [ ] Build aggregations and filters
- [ ] Build tenant/platform dashboards
- [ ] Implement Insight Agent
- [ ] Add accuracy and privacy tests

## Backend and Domain Implementation

- [ ] Separate raw immutable events from aggregates.
- [ ] Use asynchronous aggregation where needed.
- [ ] Do not store chain-of-thought or unnecessary raw document/question content.

### Recommended Code Ownership / Path Boundaries

- usage event/pricing/aggregate models
- ingestion and aggregation
- analytics insight agent
- dashboards/exports
- cost/security tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Clearly label data freshness, estimated cost, missing providers, and confidence.
- [ ] Support responsive charts/tables without relying on static demo data.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define usage event, pricing snapshot, aggregate, quality metric, export job, and insight proposal schemas.
- [ ] Expose permission-scoped analytics APIs.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Tenant isolation, department/user privacy, export permissions, and retention.
- [ ] Redact questions/document text unless explicitly needed and permitted.
- [ ] Insight Agent receives aggregate data only.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle late/out-of-order events, unknown pricing, currency mismatch, duplicate events, missing provider usage, and partial aggregate failure.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Idempotent event ingestion and aggregation correctness tests.
- [ ] Cost/pricing snapshot/reconciliation tests.
- [ ] Tenant/permission/export tests.
- [ ] Insight Agent structured evidence tests.
- [ ] Browser dashboard/date/filter/partial-data tests.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Monitor event ingestion lag, duplicate rate, aggregation lag/failure, export duration, and cost reconciliation drift.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Publish `UsageEventWriter` and fixture event corpus.
- [ ] Other issues can emit events without waiting for storage/aggregation.
- [ ] Use fake insight agent and provider-pricing adapters.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Automatic plan changes, refunds, user discipline, or security blocking based solely on an agent insight.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Costs use provider/model pricing versions
- [ ] Tenant data remains isolated
- [ ] Dashboards support date/model/department filters
- [ ] Insight statements cite underlying metrics
- [ ] Exports respect permission

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 29 — Implement Billing Portal, Invoices, Cancellation, Reactivation, and Refunds

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Payments |
| Suggested owner | Full-stack |
| Complexity | Large |
| Branch | `feature/29-implement-billing-portal-invoices-cancellation-reactivation-and-refunds` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Complete customer-facing and Super Admin billing operations.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Checkout and webhook synchronization are planned separately, while billing portal, invoices, receipts, cancellation, reactivation, proration, payment-method changes, and refunds are not implemented.

## User and Product Outcomes

- Authorized company users can manage billing through secure provider-hosted flows and view synchronized invoices/receipts.
- Cancellation, reactivation, upgrades/downgrades, and refunds are deterministic, confirmed, auditable, and webhook-reconciled.
- Super Admin can perform tightly controlled manual billing support actions.

## SRS Requirements Covered

- `FR-PAY-002..004`
- `FR-PAY-007`

## Current Code Areas to Inspect First

- `api/src/db/models/subscription.model.ts`
- `api/src/modules/platform/`
- `app/src/app/(dashboard)/super-admin/subscriptions/`
- `app/src/app/(dashboard)/dashboard/settings/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Extend the provider-neutral `PaymentProvider` contract for customer portal sessions, invoice listing/download links, payment method update, subscription update, cancellation/reactivation, refund request/status, and proration preview.
- [ ] Implement provider-hosted billing portal where appropriate rather than handling sensitive payment details directly.
- [ ] Expose synchronized invoice/receipt history with status, amount, currency, dates, and secure provider links/locally stored safe metadata.
- [ ] Support upgrade/downgrade with preview of effective date, proration, entitlements, and confirmation.
- [ ] Support cancel immediately or at period end according to product policy, reactivation before effective cancellation, grace/past-due behavior, and renewal state.
- [ ] Support refund workflow with permission, reason, amount validation, provider idempotency, state tracking, and Super Admin confirmation.
- [ ] Treat verified provider webhooks as authoritative and reconcile every requested action with resulting provider events.
- [ ] Build Company Admin billing UI gated by billing permissions and Super Admin support UI with full audit.
- [ ] Prevent duplicate actions from double clicks/retries and show pending states until webhook confirmation.
- [ ] Provide fake provider and fixture invoices for local development and E2E.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Add portal session
- [ ] List/download invoices and receipts
- [ ] Cancel now/period end
- [ ] Reactivate
- [ ] Record refund requests/results
- [ ] Add permission/approval/audit and tests

## Backend and Domain Implementation

- [ ] Never store card details.
- [ ] Use idempotency keys and explicit billing operation records.
- [ ] Validate actions against current subscription state and package version.

### Recommended Code Ownership / Path Boundaries

- billing operation/provider extensions
- invoice/portal/plan/cancel/refund services
- company/super-admin billing UI
- webhook reconciliation
- provider/E2E tests

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Show exact consequences, dates, proration estimates, and confirmation before plan/cancel/refund actions.
- [ ] Only display actions allowed by permissions and provider/subscription state.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Define billing operation, invoice summary, portal session, proration preview, cancellation, reactivation, and refund records/DTOs.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Company billing access requires explicit permission; refunds/manual overrides require Super Admin or stronger policy.
- [ ] Verify return URLs and provider event signatures.
- [ ] Audit all billing views and actions as required by policy.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Handle stale preview, out-of-order webhook, portal/session expiry, payment failure, partial refund, provider outage, already-canceled state, and duplicate request.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Provider contract and fake-provider E2E tests.
- [ ] State transition/idempotency/webhook reconciliation tests.
- [ ] Permission and cross-tenant invoice tests.
- [ ] Browser tests for portal, plan change, cancellation, reactivation, invoice, and refund flows.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Trace billing operation request, provider call, webhook confirmation, failure, and final local state.
- [ ] Track pending duration, reconciliation failures, payment failures, cancellation, and refund metrics.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Use documented package/subscription/payment contracts or local fixtures if Issues 04/10 are not merged.
- [ ] Do not require real checkout in CI.
- [ ] Publish billing summary/portal adapters consumed by admin UIs.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Accounting ledger, tax filing, marketplace payouts, or direct card-data handling.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] Billing state follows provider events
- [ ] Unauthorized employees cannot act
- [ ] Refund/cancel actions require confirmation
- [ ] Invoices are tenant-isolated
- [ ] Failure/pending states are clear

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.


---

# Issue 30 — Build Production Platform, Quality Gates, Deployment, Backup, and Recovery

> **This file is intended to be pasted directly into GitHub and given to a coding model.**  
> The assignee must inspect the current repository before editing code. The paths below are evidence and navigation hints, not permission to assume the implementation has not changed.

## Issue Metadata

| Field | Value |
|---|---|
| Epic | Production |
| Suggested owner | DevOps/QA |
| Complexity | Very Large |
| Branch | `feature/30-build-production-platform-quality-gates-deployment-backup-and-recovery` |
| Delivery unit | One feature issue → one branch → one pull request |
| Base roles | `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` only |
| Primary sources | `DOCUMIND_AI_SRS_UPDATED_V2`, `PROJECT_IMPLEMENTATION_STATUS.md`, current repository code |

## Mission

Create the production platform and quality infrastructure required to deploy, validate, observe, back up, restore, and recover DOCUMIND AI without waiting for every product feature to be completed.

The result must be a complete, reviewable vertical slice. Do not split database, backend, frontend, tests, and documentation into separate blocking issues when they are required for this feature.

## Why This Issue Exists — Current Repository State

- Docker Compose and CI designs exist, but there is no complete production target, reverse proxy/TLS setup, durable object storage deployment, backup/restore automation, disaster-recovery test, or end-to-end release quality gate.
- The worker baseline is currently broken, but this issue must build deployment/quality infrastructure using service contracts and health probes rather than waiting for every product feature.

## User and Product Outcomes

- The current product and future feature modules can be deployed through a repeatable, secure, observable pipeline.
- Backups and restores are tested, not merely documented.
- Every release has explicit automated quality gates and rollback criteria.

## SRS Requirements Covered

- `NFR-SEC-001..004`
- `NFR-REL-001`
- `NFR-SCALE-001`
- `NFR-A11Y-001`
- `NFR-TEST-001`

## Current Code Areas to Inspect First

- `.github/workflows/ci.yml`
- `docker-compose.yml`
- `api/Dockerfile`
- `app/Dockerfile`
- `workers/Dockerfile`
- `api/src/app.ts`
- `workers/src/health.ts`
- `app/src/app/health/`
- `app/src/app/ready/`

Do not limit the audit to these paths. Search route registration, models, services, API clients, tests, environment configuration, Docker, and documentation for related behavior.

## Required Discovery Before Coding

The coding model must first:

- [ ] Read the issue completely.
- [ ] Inspect the current implementation and route registration.
- [ ] Identify existing models, indexes, services, adapters, UI pages, tests, and documentation that overlap this feature.
- [ ] Run `git status` and record any pre-existing changes without overwriting them.
- [ ] Detect the package manager and available scripts.
- [ ] Write a short implementation plan naming the files/modules it expects to add or change.
- [ ] State any conflict between this issue and the current repository before making changes.
- [ ] Preserve existing public behavior unless this issue explicitly replaces it.
- [ ] Avoid installing a provider-specific dependency when a provider-neutral port plus fake adapter is sufficient.

After discovery, continue implementation without asking routine questions. Ask only when a product decision is genuinely missing and cannot be represented behind an interface.

## Detailed Functional Requirements

- [ ] Choose/document the target deployment topology for web, API, workers, MongoDB, Redis, object storage, email/payment/AI providers, proxy/TLS, DNS, secrets, and observability.
- [ ] Create production-grade container builds with non-root users, minimal runtime dependencies, health checks, graceful shutdown, immutable tags, and vulnerability scanning.
- [ ] Create environment-specific configuration and managed secret integration; no production fallback to localhost or committed files.
- [ ] Implement reverse proxy/ingress, HTTPS, secure headers, CORS/cookie domain policy, request/body limits, and trusted proxy configuration.
- [ ] Implement private durable object storage configuration, lifecycle/retention, encryption, and backup policy through provider-neutral adapters.
- [ ] Create CI/CD stages for lint, typecheck, unit/integration/E2E/security/accessibility/visual tests, all workspace builds, images, migrations/checks, deploy, smoke, and rollback.
- [ ] Define disposable integration environments or test containers for MongoDB/Redis and fake external providers.
- [ ] Implement database/index/object backup schedules, encrypted storage, retention, restore automation, and regular restore verification.
- [ ] Create deployment smoke tests for web/API/worker/readiness, queue sample job, storage round-trip, auth, and provider adapter health.
- [ ] Define SLOs/alerts for availability, latency, errors, queue depth, stuck jobs, storage, database, provider failures, agent/payment/email webhooks, and backup failures.
- [ ] Create incident response, rollback, credential rotation, data recovery, and disaster-recovery runbooks.
- [ ] Perform a documented recovery exercise with measured RPO/RTO against a safe test environment.

## Existing High-Level Scope

The original issue plan included the following scope. It remains required unless the detailed specification above explicitly refines it:

- [ ] Complete browser E2E/security/a11y/visual/load suites
- [ ] Build all images
- [ ] Deploy web/API/workers
- [ ] Configure TLS/proxy/secrets/storage/backups
- [ ] Add monitoring/alerts/runbooks
- [ ] Perform restore and failure drills

## Backend and Domain Implementation

- [ ] Services must expose honest liveness/readiness and dependency status.
- [ ] Schema/index changes need versioned rollout and backward-compatible deployment strategy.

### Recommended Code Ownership / Path Boundaries

- production containers/infra config
- CI/CD and quality gates
- secret/network/TLS/storage setup
- backup/restore/DR automation
- smoke/load/security/runbooks

Use repository conventions. If a suggested path does not exist, create the equivalent module in the existing architecture rather than forcing a conflicting structure.

## Frontend and UX Requirements

- [ ] Build-time/runtime configuration must be explicit, and health/smoke checks must validate correct API connectivity.
- [ ] Provide safe maintenance/degraded states where required.

For every relevant interface, implement:

- [ ] Loading state.
- [ ] Empty state.
- [ ] Validation state.
- [ ] Permission-denied state.
- [ ] Network/server failure state.
- [ ] Success and recovery actions.
- [ ] Responsive behavior on mobile, tablet, and desktop.
- [ ] Arabic RTL and English LTR behavior where text is user-facing.
- [ ] Accessible labels, focus behavior, keyboard operation, and semantic feedback.

If this issue has no user-facing UI, document that explicitly in the pull request and provide a diagnostic/test interface only where required.

## Data Model, API, and Contract Requirements

- [ ] Document migration/index/backup ownership and restore validation.
- [ ] No new business API is required except operational probes/metrics.

Every API added or changed must document:

- HTTP method and route.
- Authentication requirement.
- Required permission/base role.
- Tenant-scoping rule.
- Request schema.
- Success response schema.
- Stable error codes.
- Idempotency behavior where relevant.
- Pagination/filtering behavior where relevant.
- Frontend caller or reason it is backend-only.
- Automated test coverage.

## Security and Multi-Tenancy Requirements

- [ ] Managed secrets, least-privileged identities, network segmentation, encryption in transit/at rest, image/dependency scanning, audit retention, and access review.
- [ ] Do not expose internal health details publicly beyond safe status.

Additionally:

- [ ] Derive tenant identity from authenticated context, never from a trusted client body field.
- [ ] Recheck authorization inside deterministic services/tools/workers, not only at the route or UI.
- [ ] Validate every tenant-owned referenced ID belongs to the authenticated tenant.
- [ ] Do not expose secrets, raw tokens, internal stack traces, or unauthorized document content.
- [ ] Add cross-tenant and privilege-escalation tests appropriate to this feature.
- [ ] Add audit events for sensitive state changes and denials where useful.

## Failure, Retry, and Recovery Behavior

- [ ] Define behavior for failed deploy, unhealthy worker, unavailable provider, database failover, Redis loss, storage outage, and partial rollback.
- [ ] Deployment must stop/rollback when mandatory smoke checks fail.

The happy path alone is not sufficient. Partial success, duplicate requests, stale state, provider/worker interruption, and retry behavior must be explicit and tested wherever they can occur.

## Automated Test Plan

- [ ] Pipeline tests and dry-run deployment.
- [ ] Container security/health tests.
- [ ] Backup restore and disaster-recovery exercise.
- [ ] E2E smoke with fake providers and contract fixtures for unfinished modules.
- [ ] Load and failure-injection tests for critical paths.

Also run and report the affected workspace commands:

- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit tests.
- [ ] Integration/security tests.
- [ ] Frontend/browser tests where applicable.
- [ ] Production build for affected workspaces.
- [ ] Docker/Compose validation when infrastructure changed.

Do not claim a command passed unless it was executed successfully. When a command is blocked by environment or external infrastructure, record the exact blocker and still run all independent checks.

## Observability and Audit Requirements

- [ ] Centralize logs/metrics/traces with environment, release, service, tenant-safe context, and alert routing.
- [ ] Track deploy frequency/failure/rollback, restore success, RPO/RTO, and SLO error budgets.

Use correlation/trace identifiers and safe structured fields. Do not log sensitive payloads merely to make debugging easier.

## Parallel-Safety Contract — No Waiting on Another Issue

- [ ] Build infrastructure against current service health/contracts and fake external providers.
- [ ] Do not require all 29 product issues to be complete before this infrastructure merges.
- [ ] Final product release certification is a milestone/checklist that consumes this platform, not a blocking dependency inside the issue.

Mandatory parallel-development rules:

- [ ] Define the required interface/port locally in the owning domain.
- [ ] Ship a deterministic fake or in-memory adapter in the same PR.
- [ ] Add contract tests that both fake and production adapters must satisfy.
- [ ] Use fixtures for unavailable upstream/downstream systems.
- [ ] Do not block waiting for another feature branch.
- [ ] Do not directly import another unfinished issue's internal implementation.
- [ ] Freeze request/response/event schemas used by other teams and document version changes.
- [ ] Keep temporary adapters clearly named and replaceable; they must not silently become production providers.

## Explicitly Out of Scope

- Implementing missing product features inside deployment work.
- Guaranteeing a specific cloud provider unless the team formally selects one.

Also out of scope:

- Unrelated repository-wide refactors.
- Changing the three approved base roles.
- Adding production credentials to source control.
- Marking a feature complete with mocked production behavior and no clear adapter boundary.
- Implementing work assigned to another issue unless required to provide a small interface/fake.

## Acceptance Criteria

The feature is accepted only when all detailed requirements above are met and the following outcomes are true:

- [ ] All workspaces pass CI
- [ ] Production smoke tests pass
- [ ] Backup restore is demonstrated
- [ ] Worker and webhook recovery are tested
- [ ] Critical alerts and runbooks exist
- [ ] No known P0/P1 issue remains

Additional acceptance criteria:

- [ ] Real backend behavior exists for the part owned by this issue.
- [ ] Required frontend behavior is connected to the real API or to an explicitly documented fake adapter when the live downstream implementation belongs elsewhere.
- [ ] Tenant isolation and permission checks are proven by tests.
- [ ] Idempotency/retry/recovery behavior is proven where relevant.
- [ ] No hardcoded demo data is presented as real product data.
- [ ] Stable contracts and fixtures are documented for parallel teams.
- [ ] Documentation is updated to distinguish current implementation from remaining target behavior.
- [ ] A reviewer can demonstrate the feature end-to-end using documented local steps.

## Definition of Done

- [ ] Backend/domain implementation is complete.
- [ ] Frontend integration is complete where applicable.
- [ ] Tenant and permission rules are verified.
- [ ] Validation and all material failure states are implemented.
- [ ] Unit, integration, security, and user-flow tests appropriate to risk pass.
- [ ] Observability and audit events are added.
- [ ] API/data contracts and module documentation are updated.
- [ ] Lint, typecheck, tests, and production builds pass for every affected workspace.
- [ ] `git diff` contains no unrelated changes, secrets, generated junk, or temporary debug code.
- [ ] The pull request explains how the feature was tested and which adapters are fake vs production-ready.

## Instructions for the Coding Model

1. Do not merely describe the implementation; inspect and modify the repository.
2. Do not rewrite stable modules unnecessarily.
3. Prefer small domain interfaces and explicit adapters over hidden cross-module coupling.
4. Do not weaken authorization, tenant filtering, validation, or audit to make tests pass.
5. Do not treat an LLM/agent decision as authorization or deterministic execution.
6. Do not use hardcoded metrics, fake success responses, or placeholder UI as the final implementation.
7. Preserve backward compatibility or provide a migration/backfill with dry-run and rollback guidance.
8. Keep the PR focused on this issue while completing all layers needed for a usable vertical slice.
9. Update tests as part of implementation, not after the feature is considered done.
10. End with an evidence-based completion report.

## Required Final Response From the Coding Model

The final response must include:

- Summary of implemented behavior.
- Files added/changed.
- Data migrations/backfills and how to run them.
- API routes/contracts added or changed.
- Security and tenant-isolation decisions.
- Fake adapters/fixtures created for parallel work.
- Commands executed with pass/fail/blocked status.
- Remaining limitations that are explicitly outside this issue.
- `git status --short`.
- Confirmation that no secrets were printed or committed.
