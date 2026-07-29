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
| TRIALING | Initial state on registration | ACTIVE, PAST_DUE, CANCEL_AT_PERIOD_END |
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

Portal return URLs are configured by `STRIPE_BILLING_PORTAL_RETURN_URL`, must match `BILLING_PORTAL_ALLOWED_ORIGIN`, and default locally to `/dashboard/settings/billing`. Browser input cannot override the return URL or provider flow configuration. Stripe `payment_method_update` flow data and Stripe URL allowlisting stay inside the Stripe adapter. The Phase 2 `general` portal flow is enabled only when `STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID` points to a restricted Stripe Billing Portal configuration that does not expose plan changes, cancellation, quantity changes, or other Phase 3/4 mutations. If that configuration ID is absent, the backend fails safe and exposes only the payment-method-update portal flow. No card data is collected by this application.

`InvoiceSynchronizationService` treats `invoice.created`, `invoice.finalized`, `invoice.updated`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, and `invoice.marked_uncollectible` as verified synchronization triggers. It retrieves normalized current provider state, validates customer/subscription ownership, and idempotently projects by `(provider, providerInvoiceId)`. Provider observation time—not lexical event ID order—guards stale writes. Failures retain local history, mark the durable webhook event failed for replay, emit a stable `BILLING_PROVIDER_UNAVAILABLE` code, and never project the unverified webhook payload.

The existing Super Admin reconciliation architecture also exposes bounded `POST /super-admin/reconciliation/invoices/:tenantId` with platform isolation and `billing:manage`. It scans at most 200 invoices per invocation using provider cursors, continues across per-invoice projection errors, reports examined/created/updated/unchanged/failed counts, and never deletes invoices or changes subscriptions, entitlements, provider subscriptions, or refunds.

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
| `POST /billing/refund-requests` | `billing:manage` | `{ invoiceId, mode: "FULL" \| "PARTIAL", amountMinor?, reason, idempotencyKey }` → tenant-scoped local refund request DTO |
| `GET /billing/refund-requests` | `billing:read` | tenant-scoped paginated refund request history |
| `GET /billing/refund-requests/:refundId` | `billing:read` | tenant-scoped safe refund detail |
| `GET /super-admin/refunds` | `billing:read` | platform refund review list with safe tenant/invoice/package metadata |
| `GET /super-admin/refunds/:refundId` | `billing:read` | platform refund review detail |
| `POST /super-admin/refunds/:refundId/confirm` | `billing:refund-confirm` | durable provider refund execution request |
| `POST /super-admin/refunds/:refundId/reject` | `billing:refund-confirm` | terminal rejection without provider mutation |
| `POST /super-admin/refunds/:refundId/retry` | `billing:refund-confirm` | retryable provider refund execution replay using the original durable operation context |

Tenant routes accept only local invoice/refund identifiers. They never accept tenant IDs, provider invoice/payment/refund IDs, arbitrary currencies, or refund status from the browser. Server-side validation recalculates refundable balance from confirmed paid amount minus confirmed successful refunds and reserved pending refunds; multiple partial refunds are allowed only within that balance.

`Refund` is the permanent business record with states `REQUESTED`, `PROVIDER_PENDING`, `SUCCEEDED`, `FAILED`, `REJECTED`, and `RETRY_PENDING`. Technical retry/idempotency/provider-correlation state remains in `BillingOperation`. The requester and confirmer must be different actors, and provider confirmation remains platform-only through `billing:refund-confirm`.

Provider execution stays authoritative. The confirm route persists or replays the durable refund operation before calling the provider. Local invoice aggregates (`refundedAmountMinor`, `reservedRefundAmountMinor`, `remainingRefundableMinor`) update only after authoritative provider refund synchronization. Refund-related webhook events are triggers for `retrieveRefund`-based reconciliation; they are not treated as final truth on their own.

The Company Admin billing page at `/dashboard/settings/billing` now exposes refund requests only for eligible local invoices and displays refund history/status without any provider IDs or card data. The Super Admin page at `/super-admin/refunds` adds the review/confirm/reject/retry surface using the same safe local DTOs. Both UIs remain localized, accessible, and explicit about pending provider confirmation.

### Deferred after Phase 4

Broader Phase 5 browser E2E, deployment, and extended security-suite work remain deferred.

## Known limitations

- Tenant `plan` string remains deprecated for backward compatibility.
- Phase 1 plan/cancel/reactivate/refund adapter methods remain deliberately disconnected from customer-facing routes.
- Invoice reconciliation is bounded and operator-triggered; normal invoice page reads remain local and do not perform unbounded provider backfills.
