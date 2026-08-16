# Billing Domain — API Contracts

> Module: `api/src/modules/billing/`  
> Issue: 04 — Normalize Package and Subscription Domain  
> Status: Existing package/checkout/webhook behavior plus Issue 29 Phases 1–3 billing foundation, billing read experience, and customer subscription mutations

## Overview

The billing module provides a coherent package/subscription domain with versioned packages, granular entitlements (FR-PAY-001), 9-state subscription lifecycle, provider-neutral ports (FR-PAY-004), and registration integration.

## Domain Services

### `package.service.ts`

| Service | Description |
|---|---|
| `createPackage(data, actor?)` | Create a new package with version=1 and initial snapshot |
| `getPackage(id)` | Get package by ID |
| `listPackages()` | List ALL packages (active + inactive) |
| `listActivePackages()` | List only active, public packages |
| `getPackageByCode(code)` | Find active package by code |
| `createVersion(id, actor?)` | Bump version (+1) and snapshot current state |
| `archivePackage(id, actor?)` | Set package active=false |
| `mapToSnapshot(pkg)` | Create immutable PackageSnapshot from document |

### `subscription.service.ts`

| Service | Description |
|---|---|
| `createSubscription(tenantId, packageId, packageVersion, status?, actor?)` | Create subscription; defaults to TRIALING |
| `transitionSubscription(tenantId, targetState, options?, actor?)` | Transition subscription (validates legal transition) |
| `getSubscription(tenantId)` | Get subscription by tenant ID |
| `listSubscriptions(filter?)` | List subscriptions with optional status/tenant filter |
| `getLegalTransitions(fromStatus)` | Get legal target states from a given status |

### `registration.service.ts`

| Service | Description |
|---|---|
| `provisionSubscription(tenantId, packageCode?, actor?)` | Create initial TRIALING subscription on registration; idempotent |

## Public Endpoints

### `GET /public/packages`

- **Auth:** Public (no authentication required)
- **Response:** `{ success: true, data: PublicPackageDTO[] }`
- **DTO fields:** id, name, code, description, monthlyPrice, annualPrice, currency, trialDays, entitlements (employees, documents, storageMb, queriesPerMonth), supportedModels, analyticsLevel, supportLevel, retentionDays
- **Excluded:** version history, admins, fileSizeMb, tokensPerMonth, ocrPagesPerMonth, active, visibility
- **Filter:** Only packages with `active: true` and `visibility: "public"`
- **Test:** `api/src/modules/public/__tests__/public.routes.test.ts`

## Platform (Super Admin) Endpoints

### `GET /platform/packages`

- **Auth:** SUPER_ADMIN
- **Response:** `{ success: true, data: PackageDocument[] }`
- All packages (active + inactive) with full fields including version history

### `POST /platform/packages`

- **Auth:** SUPER_ADMIN
- **Request body (FR-PAY-001):**

```json
{
  "name": "Professional",
  "code": "pro-2026",
  "description": "Production package",
  "monthlyPrice": 49,
  "annualPrice": 490,
  "currency": "USD",
  "trialDays": 14,
  "visibility": "public",
  "entitlements": {
    "employees": 25,
    "admins": 3,
    "documents": 1000,
    "storageMb": 10240,
    "fileSizeMb": 20,
    "queriesPerMonth": 5000,
    "tokensPerMonth": 100000,
    "ocrPagesPerMonth": 500
  },
  "supportedModels": ["basic", "advanced"],
  "analyticsLevel": "advanced",
  "retentionDays": 90,
  "supportLevel": "standard"
}
```

- **Response:** `{ success: true, data: PackageDocument }` (status 201)
- **Backward compat:** Accepts legacy `limits` object if `entitlements` absent

### `GET /platform/packages/:id`

- **Auth:** SUPER_ADMIN
- **Response:** Single package with full fields

### `PATCH /platform/packages/:id`

- **Auth:** platform SUPER_ADMIN with `BILLING_MANAGE`
- **Request body:** `expectedVersion` plus any versioned fields; `code` and lifecycle state are rejected
- **Behavior:** Atomically appends an immutable snapshot and rejects stale writers with `PACKAGE_VERSION_CONFLICT`
- **Response:** `{ success: true, data: { ...package, versionBumped: true } }`

`POST /platform/packages/:id/versions` is the explicit immutable-version endpoint and uses the same request contract. Impact preview and audited archive/activate operations are documented in `docs/issue-26-phase-3-package-operations.md`.

### `GET /platform/subscriptions`

- **Auth:** SUPER_ADMIN
- **Response:** All subscriptions with populated tenant (name, slug, status) and package (name, code, version, monthlyPrice, currency) references

### `PATCH /platform/subscriptions/:tenantId`

- **Auth:** SUPER_ADMIN
- **Request body:** `{ packageId: ObjectId, status: SubscriptionStatus, renewsAt?: ISO date }`
- **Status values:** trialing, incomplete, active, past_due, paused, cancel_at_period_end, canceled, expired, unpaid
- **Behavior:** Validates legal transition via state machine; maps legacy lowercase to UPPERCASE model values

Phase 4 replaces the legacy generic mutation contract with explicit `POST` provisioning and strict `PATCH` existing-subscription updates. Both mutations require `Idempotency-Key`, a trimmed reason, and optimistic concurrency. See `docs/issue-26-phase-4-subscription-operations.md` for the complete contract.

## Auth (Registration) Integration

### `POST /auth/register`

- **Behavior change (Issue 04):** Registration now calls `provisionSubscription` to create an initial TRIALING subscription
- **Request field:** `packageCode` (optional) — selects the package; omits for default free package
- **Idempotent:** If a subscription already exists for the tenant, returns existing (no duplicate)
- **Default free package:** If no free package exists, auto-creates with sensible defaults

## Subscription States

The 9-state lifecycle machine:

| State | Description | Legal Transitions |
|---|---|---|
| TRIALING | Initial state on registration | ACTIVE, INCOMPLETE, PAST_DUE, CANCEL_AT_PERIOD_END |
| INCOMPLETE | Payment incomplete | ACTIVE, PAST_DUE, EXPIRED |
| ACTIVE | Active subscription | PAST_DUE, PAUSED, CANCEL_AT_PERIOD_END, EXPIRED |
| PAST_DUE | Payment past due | ACTIVE, PAUSED, EXPIRED, UNPAID |
| PAUSED | Manually paused | ACTIVE, EXPIRED |
| CANCEL_AT_PERIOD_END | Scheduled cancellation | ACTIVE, CANCELED, EXPIRED |
| CANCELED | Terminally canceled | (none — terminal) |
| EXPIRED | Subscription expired | ACTIVE, UNPAID |
| UNPAID | Payment failed | ACTIVE, EXPIRED |

## Provider-Neutral Ports

### `SubscriptionProvisioningPort` (`ports/subscription-provisioning.port.ts`)

| Method | Description |
|---|---|
| `provision(tenantId, packageId)` | Create local subscription record |
| `getEntitlement(tenantId)` | Get current entitlement snapshot |
| `transition(tenantId, targetState)` | Direct/forced state transition (Super Admin) |
| `processProviderEvent(event)` | FR-PAY-004: Process verified provider webhook event (idempotent) |

### `EntitlementSnapshotPort` (`ports/entitlement-snapshot.port.ts`)

Provides the current entitlement snapshot for a tenant based on their active subscription.

### Fake Adapters

- `ports/fakes/fake-subscription-provisioning.ts` — In-memory fake with contract tests at `ports/fakes/__tests__/fake-subscription-provisioning.contract.test.ts`

## Issue 29 Phase 1 foundation

`PaymentProvider` is the provider-neutral boundary. Money is always an integer in minor units and currency is an uppercase ISO code. Provider IDs are opaque adapter references and are never part of the Company billing summary. The contract now includes portal sessions, invoice reads/secure links, subscription reads and previews, plan changes, cancellation/reactivation, and refund reads/mutations. Every mutation receives a `ProviderOperationContext`; the Stripe adapter forwards its idempotency key through Stripe request options. The deterministic fake has explicit fixtures, clock/IDs, replay conflicts, timeouts, and failures. Stripe tests use a mocked SDK client and never perform network calls.

`BillingOperation` owns asynchronous intent, retry, correlation, and idempotency. Its state machine is `REQUESTED -> PROVIDER_PENDING -> CONFIRMED`, with `RETRY_PENDING`, `FAILED`, and `SUPERSEDED` recovery outcomes. The raw idempotency key is never stored: a SHA-256 hash and a canonical normalized-request fingerprint are persisted. Same key/same request replays; same key/different request conflicts. Plan changes, cancellation, and reactivation share the `SUBSCRIPTION_MUTATION` conflict group and cannot overlap for one subscription. Refunds have no subscription-mutation conflict group, so independent valid partial refunds are not falsely blocked; their financial validity remains invoice/payment scoped. Invoice synchronization is not a billing mutation operation. Intent is persisted before a provider call.

`Invoice` is a tenant-scoped synchronized projection. `Refund` is the permanent business record and supports partial/multiple refunds; provider attempt and retry state remains in `BillingOperation`. Secure links are excluded from ordinary queries and later routes must validate tenant ownership before selecting them.

Provider events are verified and persisted first, then treated as synchronization triggers. Event IDs and creation timestamps are diagnostics/deduplication keys, never provider sequence numbers. Current provider state is read, ownership checked, normalized, and projected; deterministic observed-state evidence is required to reject a stale projection. Provider-read failure records `BILLING_PROVIDER_UNAVAILABLE`, leaves matching operations retryable, does not project the event payload, and allows a failed event delivery to be reprocessed idempotently.

Lifecycle access is separate from Issue 25 quotas. `ACTIVE` and unexpired `TRIALING` remain eligible; scheduled cancellation remains eligible until its effective period end; `PAST_DUE` uses `BILLING_PAST_DUE_GRACE_DAYS` (default 7); `PAUSED`, `UNPAID`, `CANCELED`, `EXPIRED`, and `INCOMPLETE` fail closed.

Refund confirmation uses platform-only `billing:refund-confirm`, cannot be delegated to tenant roles, and requires requester/confirmer separation. Audit metadata contains only local safe references and normalized states—never card data, raw provider payloads, signatures, secrets, or provider customer IDs.

### Index migration

Run `npm run migrate:billing:issue29` for the default dry run. Only an explicit `npm run migrate:billing:issue29:apply` creates missing indexes. Repeated apply is idempotent and conflicting names/definitions fail without replacement. The migration makes no provider calls, backfills no invoices/refunds, and changes no subscription or entitlement data.

Rollback the application independently. If necessary, an operator may explicitly remove only Issue 29 indexes after confirming no compatible application version uses them. Billing operations, invoices, and refunds are business/audit records and must not be automatically deleted. Subscription state and entitlements must remain untouched.

## Issue 29 Phase 2 billing read experience

Phase 2 adds authenticated, tenant-derived routes under `/billing`:

| Route | Permission | Contract |
|---|---|---|
| `GET /billing/summary` | `billing:read` | Sanitized subscription, lifecycle/grace decision, safe Phase 2 capabilities, pending-operation summary, and local invoice counts |
| `POST /billing/portal-sessions` | `billing:manage` | Strict `{ flow: "general" | "payment_method_update" }`; returns only `{ url, expiresAt }` |
| `GET /billing/invoices` | `billing:read` | Tenant-local projection, newest first; `page`, `pageSize` (maximum 50), optional status/date/local-subscription filters |
| `GET /billing/invoices/:invoiceId` | `billing:read` | Tenant-local invoice DTO with hidden-404 semantics |
| `GET /billing/invoices/:invoiceId/links` | `billing:read` | Fresh provider ownership validation and allowlisted secure links |

Tenant identity never comes from route/query/body input. Normal invoice DTOs contain a local invoice ID, normalized status, uppercase ISO currency, integer minor-unit amounts, dates, and link-availability booleans. They exclude provider customer/subscription/price/event/invoice IDs, raw payloads, reconciliation metadata, and URLs. Link lookup accepts only the local invoice ID, verifies the local tenant and subscription, retrieves current provider invoice ownership, and returns HTTPS links accepted by the provider adapter. URLs and provider identifiers are excluded from audit metadata.

Portal return URLs are configured by `STRIPE_BILLING_PORTAL_RETURN_URL`, must match `BILLING_PORTAL_ALLOWED_ORIGIN`, and default locally to `/dashboard/settings/billing`. Browser input cannot override the return URL or provider flow configuration. Stripe `payment_method_update` flow data and Stripe URL allowlisting stay inside the Stripe adapter. DocuMind never relies on Stripe's default Billing Portal configuration. Both portal flows require an explicit, restricted Stripe Billing Portal configuration ID:

- The `general` portal flow requires `STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID` — a restricted configuration that must not expose plan changes, cancellation, quantity changes, or other Phase 3/4 mutations.
- The `payment_method_update` flow requires a separate `STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID` — a configuration whose `features.payment_method_update.enabled` is `true`.

If either configuration ID is absent, the backend fails safe: the corresponding flow is rejected with `BILLING_PROVIDER_CONFIGURATION_INVALID` and no Stripe API call is made. The two configuration IDs are independent and must not be interchanged. Configuration IDs belong to a Stripe account/mode and must be updated when changing Stripe accounts. No card data is collected by this application.

`InvoiceSynchronizationService` treats `invoice.created`, `invoice.finalized`, `invoice.updated`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, and `invoice.marked_uncollectible` as verified synchronization triggers. It retrieves normalized current provider state, validates customer/subscription ownership, and idempotently projects by `(provider, providerInvoiceId)`. Provider observation time—not lexical event ID order—guards stale writes. Failures retain local history, mark the durable webhook event failed for replay, emit a stable `BILLING_PROVIDER_UNAVAILABLE` code, and never project the unverified webhook payload.

The existing Super Admin reconciliation architecture also exposes bounded `POST /super-admin/reconciliation/invoices/:tenantId` with platform isolation and `billing:manage`. It scans at most 200 invoices per invocation using provider cursors, continues across per-invoice projection errors, reports examined/created/updated/unchanged/failed counts plus a bounded sanitized aggregation of stable failure codes, and never deletes invoices or changes subscriptions, entitlements, provider subscriptions, or refunds.

The Company Admin page is `/dashboard/settings/billing`. Navigation and direct access require `billing:read`; portal actions additionally require `billing:manage`. It has independent summary/invoice loading and recovery states, a no-provider state, pending/grace messages, responsive table/cards, pagination, secure external invoice actions, duplicate portal-click protection, semantic headings/table headers/live regions/focusable errors, and localized English LTR/Arabic RTL dates, money, labels, and statuses. The dashboard `SubscriptionWidget` remains a compact summary and links to this page.

For local Stripe webhook forwarding use:

```sh
stripe listen --forward-to http://localhost:5000/webhooks/payment/stripe
```

The deterministic fake supplies invoice pagination, current invoice reads, availability/secure-link fixtures, portal intents, and configurable invoice-read failures. Stripe adapter tests use a mocked SDK; Phase 2 tests and reconciliation use fakes or the disposable MongoDB harness and make no provider network calls.

### Deferred after Phase 2

Phase 2 exposes no plan-change, proration, cancellation, reactivation, or refund HTTP routes/actions. Those subscription mutations remain Phase 3; refund request/confirmation routes and Super Admin refund UI remain Phase 4; broader browser E2E/full security verification remains Phase 5. Phase 1 provider mutation contracts stay disconnected from customer APIs.

## Issue 29 Phase 3 customer subscription mutations

Phase 3 connects the Phase 1 provider-neutral mutation contracts to authenticated tenant APIs under `/billing`:

| Route | Permission | Contract |
|---|---|---|
| `POST /billing/subscription-change-previews` | `billing:manage` | `{ targetPackageId, billingInterval }` → provider-derived local preview with expiry, target/current package versions, proration amount/credit in minor units, next billing date, entitlement impact, and subscription revision |
| `POST /billing/subscription-changes` | `billing:manage` | `{ previewId, idempotencyKey }` → durable `PLAN_CHANGE` operation DTO |
| `POST /billing/cancellations` | `billing:manage` | `{ cancellationType: "PERIOD_END" \| "IMMEDIATE", idempotencyKey }` → durable cancellation operation DTO |
| `POST /billing/reactivations` | `billing:manage` | `{ idempotencyKey }` → durable reactivation operation DTO |
| `GET /billing/operations/:operationId` | `billing:read` | tenant-scoped safe operation status for pending polling and recovery |

All routes derive tenant identity from authenticated context only. Browser input never selects a tenant, provider object ID, amount, currency, Stripe price, or return URL.

Plan-change previews are provider-derived reads. The local `BillingPreview` record stores target/current package metadata, the expected subscription revision, preview expiry, normalized proration result, and entitlement deltas. Confirmation rejects expired previews, subscription revision drift, target package version drift, currency mismatches, inactive targets, and same-plan requests. A preview never changes entitlements or local subscription state.

Plan changes, cancellations, and reactivations all run through `BillingOperation`. The operation intent is stored before any provider mutation, then moved to `PROVIDER_PENDING`. The UI and summary remain pending until authoritative provider confirmation arrives through webhook-triggered/current-provider reconciliation. Same key/same request replays; same key/different request conflicts; incompatible concurrent subscription mutations are rejected. `REFUND` remains separate and unexposed in tenant APIs.

Lifecycle eligibility remains distinct from Issue 25 quota ownership. `ACTIVE` and `TRIALING` remain eligible, `CANCEL_AT_PERIOD_END` stays eligible until the confirmed period end, `PAST_DUE` still uses `BILLING_PAST_DUE_GRACE_DAYS`, and `PAUSED`, `UNPAID`, `CANCELED`, `EXPIRED`, and `INCOMPLETE` fail closed. Plan entitlements change only after authoritative provider state projection; the mutation response itself is not treated as confirmation.

The Company Admin billing page at `/dashboard/settings/billing` now adds provider-backed Phase 3 controls for change-plan preview/confirmation, cancel at period end, cancel immediately, and reactivation before the scheduled cancellation becomes effective. Actions remain capability-driven from the sanitized billing summary, localized for English LTR and Arabic RTL, keyboard-accessible, and safe against duplicate submission. The UI polls `GET /billing/operations/:operationId` and does not present success purely because the initial mutation call returned.

## Issue 29 Phase 4 refund requests and platform confirmation

Phase 4 adds the refund workflow on top of the existing invoice projection and `BillingOperation` foundation:

| Route | Permission | Contract |
|---|---|---|
| `POST /billing/refund-eligibility-previews` | `billing:manage` | `{ invoiceId }` → expiring server-calculated remaining-balance preview |
| `POST /billing/refund-requests` | `billing:manage` | `{ previewId, idempotencyKey }` → tenant-scoped local refund request DTO |
| `GET /billing/refund-requests` | `billing:read` | tenant-scoped paginated refund request history |
| `GET /billing/refund-requests/:refundId` | `billing:read` | tenant-scoped safe refund detail |
| `GET /super-admin/refunds` | `billing:read` | platform refund review list with safe tenant/invoice/package metadata |
| `GET /super-admin/refunds/:refundId` | `billing:read` | platform refund review detail |
| `POST /super-admin/refunds/:refundId/confirm` | `billing:refund-confirm` | durable provider refund execution request |
| `POST /super-admin/refunds/:refundId/reject` | `billing:refund-confirm` | terminal rejection without provider mutation |
| `POST /super-admin/refunds/:refundId/retry` | `billing:refund-confirm` | retryable provider refund execution replay using the original durable operation context |

Tenant routes accept only local invoice/refund identifiers. They never accept tenant IDs, provider invoice/payment/refund IDs, arbitrary currencies, refund status, reason, mode, amount, or subscription impact from the browser. The server calculates one remaining refundable balance from authoritative usage and elapsed subscription time, then reserves exactly that amount; a zero balance cannot create a provider refund.

`Refund` is the permanent business record with states `REQUESTED`, `PROVIDER_PENDING`, `SUCCEEDED`, `FAILED`, `REJECTED`, and `RETRY_PENDING`. Technical retry/idempotency/provider-correlation state remains in `BillingOperation`. The requester and confirmer must be different actors, and provider confirmation remains platform-only through `billing:refund-confirm`.

Provider execution stays authoritative. The confirm route persists or replays the durable refund operation before calling the provider. Local invoice aggregates (`refundedAmountMinor`, `reservedRefundAmountMinor`, `remainingRefundableMinor`) update only after authoritative provider refund synchronization. Refund-related webhook events are triggers for `retrieveRefund`-based reconciliation; they are not treated as final truth on their own.

The Company Admin billing page at `/dashboard/settings/billing` exposes one refund action for eligible local invoices: it displays the immutable calculation breakdown and the exact remaining balance, with no reason selector, full/partial mode, or editable amount. After authoritative success the paid subscription is canceled and the tenant moves to the canonical Free plan. Historical refund reasons remain readable for audit. The Super Admin page at `/super-admin/refunds` provides approve/reject/retry using read-only amount, calculation, and impact data. Both UIs remain localized, accessible, and explicit about pending provider confirmation.

### Usage-aware refund eligibility

Tenant refund requests now begin with `POST /billing/refund-eligibility-previews`. The server persists an expiring, tenant/invoice/subscription-scoped snapshot under policy version `2026-07-usage-v1`; `POST /billing/refund-requests` accepts that local preview ID and never accepts usage, currency, provider references, or a client-selected subscription impact.

The automatic voluntary-cancellation calculation includes queries, tokens, and OCR pages. Issue 25 counter keys are formatted `YYYY-MM`, but the key labels the month containing the subscription-period start; it is not a calendar-month event bucket. Refund snapshots canonicalize that key in UTC and also detect the historical process-local key at UTC month boundaries without treating it as another usage bucket. Refund eligibility therefore does not sum adjacent month-labelled rows. It counts query and OCR ledger records over the exact half-open invoice period (`createdAt >= periodStart && createdAt < periodEnd`) and reconciles those counts with the matching Issue 25 counter so direct reservations are not ignored. A counter surplus or duplicate legacy/canonical value that cannot be assigned to a non-calendar-aligned exact period fails closed. Tokens currently have no exact timestamped ledger: an absent counter is authoritative zero under the adapter's upsert-on-first-consume contract, while non-zero token usage for a non-calendar-aligned period requires review. Database failures, malformed counters, and missing quota definitions also require review. Disabled zero-limit dimensions, seats, documents, storage, and file-size limits are excluded. Existing USD cost fields are estimates or are not an immutable invoice-period minor-unit ledger, so direct provider cost is not used and live pricing is never fetched or inferred.

Ratios are stored as integer basis points. The consumed ratio is the greater of elapsed-period and included-usage ratios. Money is calculated in integer minor units using ceiling division; confirmed refunds and pending refund reservations cap the result. Confirmation recalculates against current usage and rejects a decreased maximum instead of silently reducing the amount.

New tenant requests use the canonical `SYSTEM_REMAINING_BALANCE_REFUND` policy only: the server calculates the unused balance, mandates `CANCEL_AND_MOVE_TO_FREE`, and rejects legacy reason, mode, amount, and impact fields. Historical reason-coded refunds remain readable and their platform review behavior remains supported for audit compatibility. Local paid access is disabled only after provider-authoritative refund success, then a separate durable cancellation operation is created; pending cancellation never restores paid access.

`BILLING_GOODWILL_REFUND_CAP_MINOR` is the non-negative platform policy cap for a discretionary goodwill credit. It defaults to `0` (disabled), is interpreted in invoice minor units, and does not grant tenants access to the platform-only reason.

Refund reconciliation first retrieves current provider state and validates ownership, amount, and currency. A successful manual provider read is idempotent and triggers any required subscription-impact operation. Webhook signature verification remains mandatory. For local Stripe testing:

```sh
stripe listen --forward-to http://localhost:5000/webhooks/payment/stripe
```

The Stripe CLI signing secret must match `STRIPE_WEBHOOK_SECRET`; never commit the value.

### Deferred after Phase 4

Broader Phase 5 browser E2E, deployment, and extended security-suite work remain deferred.

## Known limitations

- Tenant `plan` string remains deprecated for backward compatibility.
- Phase 1 plan/cancel/reactivate/refund adapter methods remain deliberately disconnected from customer-facing routes.
- Invoice reconciliation is bounded and operator-triggered; normal invoice page reads remain local and do not perform unbounded provider backfills.

## Issue 29 Phase 5 finalization

Phase 5 adds final integration evidence rather than new billing features.

### HTTP integration coverage

Route-level integration tests now run through the real Express app/router stack with disposable MongoDB state. The suite covers:

- tenant billing summary, portal session, invoice list/detail/links
- tenant plan preview/change, cancellation, reactivation, operation status
- tenant refund request/list/detail
- platform invoice reconciliation
- platform refund list/detail/confirm/reject/retry

The suite verifies authentication, tenant isolation, hidden `404` semantics, permission boundaries, request validation, idempotent replay, and DTO sanitization. It specifically rejects provider/customer/subscription/invoice/refund identifier leakage in tenant and platform HTTP responses.

### Browser E2E expectations

The repository’s official browser framework is Playwright (`playwright.config.ts`). Billing E2E uses the existing application routes and must run only with local fixtures, the fake provider or mocked provider reads, and a disposable/local development database. It must not perform real Stripe financial mutations.

The current browser fixture explicitly covers upgrade behavior. Downgrade preview/confirmation is covered by deterministic fake-provider tests; a downgrade-specific browser fixture remains manual UAT until the fixture exposes a lower public package without changing the upgrade scenario.

For local execution, the environment must provide:

- `PAYMENT_PROVIDER=fake` or an equivalent mocked provider setup
- a seeded Super Admin credential pair for platform flows
- running app/api services reachable at the Playwright base URLs

If those prerequisites are absent, browser E2E should be reported as blocked rather than bypassed with production credentials or real provider state.

### Migration and rollback evidence

Phase 5 verification must continue using the dry-run-first Issue 29 migration:

```sh
npm run migrate:billing:issue29
npm run migrate:billing:issue29:apply
```

Validation expectations:

- dry run on a clean disposable database
- apply on a clean disposable database
- repeated apply is idempotent
- dry run after apply reports the existing compatible indexes
- conflicting index definitions fail safely
- no provider calls occur
- no subscription or entitlement state changes occur
- no invoice, preview, operation, or refund business data is deleted automatically

Rollback remains application-first. Optional index removal is an explicit operator action only after confirming no compatible application version depends on the indexes.

### PR evidence checklist

Before merge, capture:

- the exact verification commands and their PASS/FAIL/BLOCKED status
- git diff for the Issue 29 branch scope only
- confirmation that no real Stripe mutation was sent
- confirmation that no developer or production database was modified
- confirmation that no secrets or provider URLs were printed or committed
