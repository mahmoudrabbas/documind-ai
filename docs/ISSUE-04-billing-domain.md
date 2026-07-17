# Issue 04 — Billing & Subscription Domain

## Overview

Issue 04 introduces a fully isolated **Billing Domain** with subscription lifecycle management, package versioning, and platform admin billing controls.

## Requirements (FR-PAY-001 / FR-PAY-004)

| Requirement | Description |
|---|---|
| **FR-PAY-001** | Billing package must store granular entitlements (employees, admins, documents, storage, file size, queries, tokens, OCR), annual pricing, trial days, visibility, supported models, analytics level, retention days, and support level. Version history is tracked as immutable snapshots. |
| **FR-PAY-004** | Subscriptions follow a 9-state lifecycle: `TRIALING → INCOMPLETE → ACTIVE → PAST_DUE → PAUSED → CANCEL_AT_PERIOD_END → CANCELED → EXPIRED → UNPAID` with strictly defined legal transitions enforced by a state machine. |

## Architecture

```
api/src/modules/billing/           ← Bounded context (clean domain)
├── billing.types.ts               ← PackageSnapshot, SubscriptionStatus (9 states), SubscriptionTransition
├── package.service.ts             ← createPackage, getPackage, createVersion, archivePackage, mapToSnapshot
├── subscription.service.ts        ← createSubscription, transitionSubscription (state machine), getSubscription
├── registration.service.ts        ← provisionSubscription (orchestrates free-package bootstrap + subscription creation)
├── ports/
│   ├── subscription-provisioning.port.ts   ← Port interface (provision, getEntitlement, transition, processProviderEvent)
│   └── fakes/
│       ├── fake-subscription-provisioning.ts ← In-memory fake for contract testing
│       └── __tests__/
│           └── fake-subscription-provisioning.contract.test.ts ← 20 contract tests
├── __tests__/
│   ├── package.service.test.ts             ← 20 tests
│   ├── subscription.service.test.ts        ← 97 tests (exhaustive 9×9 state machine)
│   └── registration.service.test.ts        ← 5 tests
└── billing.routes.ts             ← Billing API routes (not yet wired)

api/src/modules/public/            ← Public-facing API (no auth)
├── public.types.ts                ← PublicPackageDTO, PublicPackageEntitlement (sanitised subset)
├── public.service.ts              ← listPublicPackages (active + public filter, DTO mapping)
├── public.controller.ts           ← activePackagesController
├── public.routes.ts               ← GET /public/packages
└── __tests__/
    └── public.routes.test.ts      ← 5 integration tests

api/src/modules/platform/          ← Platform admin API (SUPER_ADMIN only, updated routes)
├── platform.routes.ts             ← GET/POST/PATCH /packages, GET/PATCH /subscriptions
├── platform.validator.ts          ← packageBodySchema with FR-PAY-001 fields
├── platform.routes.test.ts        ← Static analysis tests (7 tests)
├── platform.validator.test.ts     ← Unit tests (4 tests)
└── platform.service.ts            ← Delegates to billing domain services
```

## State Machine — 9 × 9 Legal Transitions

| From ↓ \ To → | TRIALING | INCOMPLETE | ACTIVE | PAST_DUE | PAUSED | CANCEL_AT_PE | CANCELED | EXPIRED | UNPAID |
|---|---|---|---|---|---|---|---|---|---|
| **TRIALING** | ✗ | ✗ | ✅ | ✅ | ✗ | ✅ | ✗ | ✗ | ✗ |
| **INCOMPLETE** | ✗ | ✗ | ✅ | ✅ | ✗ | ✗ | ✗ | ✅ | ✗ |
| **ACTIVE** | ✗ | ✗ | ✗ | ✅ | ✅ | ✅ | ✗ | ✅ | ✗ |
| **PAST_DUE** | ✗ | ✗ | ✅ | ✗ | ✅ | ✗ | ✗ | ✅ | ✅ |
| **PAUSED** | ✗ | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ | ✅ | ✗ |
| **CANCEL_AT_PE** | ✗ | ✗ | ✅ | ✗ | ✗ | ✗ | ✅ | ✅ | ✗ |
| **CANCELED** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **EXPIRED** | ✗ | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✅ |
| **UNPAID** | ✗ | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ | ✅ | ✗ |

✅ = Legal transition enforced by LEGAL_TRANSITIONS map  
CANCELED is a terminal state (no outgoing transitions)

## Provider Event → Status Mappings

| Provider Event | Current Status | → New Status |
|---|---|---|
| `payment_method.attached` | INCOMPLETE | ACTIVE |
| `invoice.payment_failed` | ACTIVE | PAST_DUE |
| `invoice.paid` | PAST_DUE | ACTIVE |
| `subscription.canceled` | CANCEL_AT_PERIOD_END | CANCELED |
| `subscription.updated` (cancel_at_period_end=true) | ACTIVE | CANCEL_AT_PERIOD_END |
| `subscription.updated` (cancel_at_period_end=false) | CANCEL_AT_PERIOD_END | ACTIVE |
| `customer.subscription.deleted` | ACTIVE / PAST_DUE / PAUSED | EXPIRED |

## New API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/public/packages` | None | List active + public packages with sanitised DTO |
| `GET` | `/platform/packages` | SUPER_ADMIN | List all packages |
| `POST` | `/platform/packages` | SUPER_ADMIN | Create package (FR-PAY-001 fields) |
| `GET` | `/platform/packages/:id` | SUPER_ADMIN | Get package by ID |
| `PATCH` | `/platform/packages/:id` | SUPER_ADMIN | Update package (bumps version) |
| `GET` | `/platform/subscriptions` | SUPER_ADMIN | List all subscriptions |
| `PATCH` | `/platform/subscriptions/:tenantId` | SUPER_ADMIN | Update subscription state |

## Test Coverage

| Test Suite | Runner | Tests | Scope |
|---|---|---|---|
| `subscription.service.test.ts` | vitest | 97 | State machine (23 legal + 67 illegal + 7 edge cases) |
| `package.service.test.ts` | vitest | 20 | CRUD, versioning, snapshot mapping |
| `registration.service.test.ts` | vitest | 5 | Provisioning, idempotency, free-package bootstrap |
| `fake-subscription-provisioning.contract.test.ts` | vitest | 20 | Port contract + provider event processing |
| `public.routes.test.ts` | node:test | 5 | Public packages DTO sanitisation, sorting, filtering |
| `platform.validator.test.ts` | node:test | 4 | Package/settings/subscription validation |
| `platform.routes.test.ts` | node:test | 7 | Route registration & billing domain linkage |
| `auth-integration.test.ts` | node:test | 1* | Registration with packageCode creates subscription |

\* Integration test within auth-integration.test.ts covering billing cross-module registration flow.

**Total: 142 unit tests (vitest) + 17 integration tests (node:test) = 159 tests**

## Data Flow

```
Registration
  → POST /auth/register (packageCode optional)
    → registration.service.provisionSubscription(packageCode)
      → package.service (getPackageByCode)
      → subscription.service.createSubscription
      → provisioning port adapter (provision)

Public Packages
  → GET /public/packages (no auth)
    → public.service.listPublicPackages
      → PackageModel.find({active:true, visibility:"public"})
      → mapToPublicDTO (sanitises to 4 entitlement fields)

Platform Package CRUD (SUPER_ADMIN)
  → POST /platform/packages
    → platform.service.createPackage
      → billing package.service.createPackage (version=1 + snapshot)
  → PATCH /platform/packages/:id
    → platform.service.updatePackage
      → billing package.service.createVersion (bump + snapshot)

Platform Subscription Management (SUPER_ADMIN)
  → PATCH /platform/subscriptions/:tenantId
    → billing subscription.service.transitionSubscription
      → LEGAL_TRANSITIONS state machine validation
      → Side-effect fields (trialEnd, cancelledAt, periodEnd)
```

## Frontend Changes

- **`app/src/lib/api/billing.ts`** — API slice with `getPublicPackages()` using fetch
- **`app/src/app/packages/page.tsx`** — Public package listing page (grid of plan cards)
- **`app/src/components/billing/plan-comparison.tsx`** — Side-by-side plan comparison table with annual pricing, trial days, entititlements
