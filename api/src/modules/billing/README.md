# Billing Domain — API Contracts

> Module: `api/src/modules/billing/`  
> Issue: 04 — Normalize Package and Subscription Domain  
> Status: Existing package/checkout/webhook behavior plus Issue 29 Phase 1 billing foundation

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

### Deferred after Phase 1

Phase 1 adds no customer mutation HTTP routes or UI. Company invoice routes/backfill and billing page are Phase 2; plan change, cancellation/reactivation routes and UI are Phase 3; refund request/confirmation routes and Super Admin UI are Phase 4; browser E2E and full security verification are Phase 5. Existing checkout, Billing Portal, verified webhooks, reconciliation, package/subscription administration, permissions, and quota behavior remain in service.

## Known limitations

- Tenant `plan` string remains deprecated for backward compatibility.
- The Phase 1 adapter mutation methods are deliberately not connected to customer-facing routes.
- Invoice/refund provider event handlers and live invoice backfill are deferred.
