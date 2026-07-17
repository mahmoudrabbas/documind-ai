# Billing Domain — API Contracts

> Module: `api/src/modules/billing/`  
> Issue: 04 — Normalize Package and Subscription Domain  
> Status: **COMPLETE** (domain scaffolding; no real payment provider)

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

- **Auth:** SUPER_ADMIN
- **Request body:** Partial package fields (any subset of the FR-PAY-001 fields)
- **Behavior:** Applies field changes, then bumps version + snapshot
- **Response:** `{ success: true, data: { ...package, versionBumped: true } }`

### `GET /platform/subscriptions`

- **Auth:** SUPER_ADMIN
- **Response:** All subscriptions with populated tenant (name, slug, status) and package (name, code, version, monthlyPrice, currency) references

### `PATCH /platform/subscriptions/:tenantId`

- **Auth:** SUPER_ADMIN
- **Request body:** `{ packageId: ObjectId, status: SubscriptionStatus, renewsAt?: ISO date }`
- **Status values:** trialing, incomplete, active, past_due, paused, cancel_at_period_end, canceled, expired, unpaid
- **Behavior:** Validates legal transition via state machine; maps legacy lowercase to UPPERCASE model values

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

## Known Limitations

- No real payment provider (Stripe/PayPal) — planned for Issues 10/29
- Tenant `plan` string is deprecated but still present for backward compatibility
- No quota enforcement middleware — planned for Issue 25
- No auto-expiry/renewal/cancel cron jobs
- No billing portal, invoices, or refunds — planned for Issue 29
