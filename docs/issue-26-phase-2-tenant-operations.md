# Issue 26 Phase 2 — Tenant Detail and Safe Lifecycle Operations

## Overview

Phase 2 implements the Super Admin tenant detail contract, suspend/reinstate lifecycle operations with idempotent transitions, impact previews, audit logging, and a frontend detail page with lifecycle controls.

## Backend Routes

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/platform/tenants/:id/detail` | `COMPANY_SETTINGS_READ` | Enriched tenant detail |
| GET | `/platform/tenants/:id/preview/suspend` | `COMPANY_SETTINGS_READ` | Suspend impact preview |
| GET | `/platform/tenants/:id/preview/reinstate` | `COMPANY_SETTINGS_READ` | Reinstate impact preview |
| POST | `/platform/tenants/:id/suspend` | `COMPANY_SETTINGS_UPDATE` | Suspend a tenant |
| POST | `/platform/tenants/:id/reinstate` | `COMPANY_SETTINGS_UPDATE` | Reinstate a suspended tenant |

## Tenant Detail Data Sources

The `GET /platform/tenants/:id/detail` endpoint aggregates:

- **Tenant core**: id, name, slug, status, plan, isSystemTenant, createdAt, updatedAt
- **User summary**: total count, active count, company admin count, employee count (via aggregation)
- **Package summary**: populated from subscription.packageId if available
- **Subscription summary**: subscriptionId, status, provider, periodStart, periodEnd, trialEnd, cancelAtPeriodEnd
- **Usage**: document count, storage bytes (sum of fileSize), question count
- **Recent audit**: last 10 audit log entries for the tenant (action, actorEmail, actorRole, outcome, createdAt)

The detail route returns the standard success envelope:

```json
{
  "success": true,
  "data": {
    "id": "tenant ObjectId",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "status": "active",
    "plan": "free",
    "isSystemTenant": false,
    "createdAt": "ISO-8601 timestamp",
    "updatedAt": "ISO-8601 timestamp",
    "users": {
      "total": 5,
      "active": 4,
      "companyAdmins": 1,
      "employees": 4
    },
    "package": null,
    "subscription": null,
    "usage": {
      "documents": 12,
      "storageBytes": 2048,
      "questions": 30
    },
    "recentAudit": []
  }
}
```

## Protected Tenant Rules

The following tenants cannot be suspended, reinstated, or have their detail viewed:

- Any tenant with `isSystemTenant === true`
- Any tenant with slug matching `PLATFORM_TENANT_SLUG`
- Any tenant with a slug in `LEGACY_PLATFORM_TENANT_SLUGS`

Protected tenant checks use `findAnyTenantById` (unfiltered) so the 403 response is returned instead of a 404 from the platform-filtered `findTenantById`.

## Preview Contract

`GET /platform/tenants/:id/preview/{suspend|reinstate}` returns:

```json
{
  "data": {
    "tenantId": "string",
    "tenantName": "string",
    "currentStatus": "active",
    "targetStatus": "suspended",
    "transitionAllowed": true,
    "alreadyInTargetState": false,
    "totalUsersAffected": 5,
    "activeUsersAffected": 4,
    "activeCompanyAdminsAffected": 1,
    "currentSubscriptionStatus": "active",
    "documentCount": 12,
    "warnings": ["All user access to this tenant will be blocked."],
    "blockingReasons": []
  }
}
```

Previews are read-only and do not modify any data.

An already-target state is represented by `transitionAllowed: true` and
`alreadyInTargetState: true`. It has no blocking reason and matches the
idempotent HTTP 200 mutation behavior. Other invalid transitions return
`transitionAllowed: false` with at least one `blockingReasons` entry.

## Mutation Request and Response Contracts

Both mutation routes accept the same strict JSON body:

```json
{
  "reason": "Reviewed and approved by platform operations"
}
```

Successful transitions and idempotent repeats return HTTP 200:

```json
{
  "success": true,
  "data": {
    "id": "tenant ObjectId",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "status": "suspended",
    "plan": "free",
    "createdAt": "ISO-8601 timestamp",
    "updatedAt": "ISO-8601 timestamp"
  }
}
```

`alreadyInTargetState` is present and `true` for an idempotent repeat. It may
be omitted for a transition that changed the persisted status.

## Reason Validation

All suspend/reinstate operations require a `reason` field in the JSON body:

- Must be a string
- Trimmed of leading/trailing whitespace
- Must be between 3 and 500 characters (inclusive)
- Whitespace-only strings are rejected with `TENANT_MISSING_REASON`
- Too-short or too-long reasons are rejected with `TENANT_INVALID_REASON`
- Unknown body fields are rejected with a strict schema

## Allowed Transitions

### Suspend (`POST /suspend`)

| Current Status | Allowed |
|---------------|---------|
| `active` | Yes |
| `trial` | Yes |
| `pending` | Yes |
| `pending_verification` | Yes |
| `suspended` | Idempotent (alreadyInTargetState) |

### Reinstate (`POST /reinstate`)

| Current Status | Allowed |
|---------------|---------|
| `suspended` | Yes |
| `active` | Idempotent (alreadyInTargetState) |
| `trial` | No — returns HTTP 409 `TENANT_INVALID_TRANSITION` |
| `pending` | No |
| `pending_verification` | No |

## Concurrency and Repeated-Transition Behavior

- Status updates use `findOneAndUpdate` with `{ _id, status: currentStatus }` filter — atomic and race-condition-safe
- If the status changed between the read and the write, the atomic update returns null and the endpoint returns HTTP 409
- Idempotent transitions (already in target state) return HTTP 200 with `alreadyInTargetState: true` — no audit event is written
- The second concurrent suspend of the same active tenant returns 200 (idempotent) since the first request already moved it to suspended

## Authorization

All lifecycle endpoints enforce:

1. `authenticate` middleware — validates JWT access token (must include `type: "access"`)
2. `requirePlatformTenant` — verifies the authenticated user belongs to the platform tenant
3. `requirePermission(COMPANY_SETTINGS_READ)` for detail/previews, or `requirePermission(COMPANY_SETTINGS_UPDATE)` for mutations
4. `authorizePlatformOperation` — service-level authorization with audit actor context

The actor must have base role `SUPER_ADMIN`, belong to the active canonical
platform tenant, and hold the permission required by the route. Billing
permissions are not required for tenant lifecycle operations. All target
lookups are restricted to non-platform tenants, and explicit protected-tenant
checks prevent system, canonical platform, and legacy platform tenants from
being viewed or mutated through these routes.

## Audit Events

| Action | When Written |
|--------|-------------|
| `TENANT_SUSPENDED` | After successful atomic status update to `suspended` |
| `TENANT_REINSTATED` | After successful atomic status update to `active` |

Each audit entry includes:
- `resourceType: "Tenant"`
- `resourceId`: tenant ID
- `changes`: `{ previousStatus, newStatus, reason }`
- `actorId`, `actorEmail`, `actorRole`, `actorKind`
- `metadata`: `{ traceId, requestId }`

No audit event is written when:
- The tenant is already in the target state (idempotent)
- The atomic status update fails (concurrent change)
- Validation fails before the service is reached

## Error Contracts

| HTTP Status | Error Code | When |
|------------|-----------|------|
| 400 | `VALIDATION_ERROR` | Invalid tenant ID, unknown body field, or malformed request |
| 400 | `TENANT_MISSING_REASON` | Reason is absent, null, empty, or whitespace-only |
| 400 | `TENANT_INVALID_REASON` | Reason is not a string or trimmed length is outside 3–500 |
| 401 | `UNAUTHORIZED` | Access token is missing or invalid |
| 403 | `FORBIDDEN` | Actor is not a platform Super Admin or the platform tenant is inactive |
| 403 | `PERMISSION_REQUIRED` | Required read/update permission is absent |
| 403 | `TENANT_PROTECTED` | Target is a system, canonical platform, or legacy platform tenant |
| 404 | `NOT_FOUND` | Tenant does not exist |
| 409 | `TENANT_INVALID_TRANSITION` | Status transition is invalid or the status changed concurrently |

## Frontend Workflow

The tenant detail page at `/super-admin/companies/[companyId]` provides:

- **Detail view**: tenant identity, user summary, package, subscription, usage stats, recent audit
- **LifecycleDialog**: preview → reason textarea → confirm/cancel
- **Loading states**: skeleton loaders during data fetch and action submission
- **Error states**: inline accessible alerts for preview and mutation errors
- **Success states**: detail reload and accessible notice after successful suspend/reinstate
- **Duplicate-submission prevention**: action button disabled while submitting
- **Permission-aware controls**: suspend/reinstate buttons only visible to SUPER_ADMIN with COMPANY_SETTINGS_UPDATE
- **Dialog behavior**: one cancelable preview request per tenant/action, explicit retry, blocked confirmation, initial focus, focus restoration, Escape/backdrop close when not pending
- **Reason behavior**: client and server both trim for validation and enforce 3–500 characters
- **No archive, delete, permanent deletion, or impersonation** actions

## Tests

### Backend (`admin.lifecycle.test.ts`) — 29 behavioral tests

1. Rejects unauthenticated detail requests
2. Rejects non-platform tenant users for detail
3. Returns real tenant identity in detail
4. Returns accurate user counts
5. Hides platform/system tenants from detail
6. Handles missing subscription safely (null)
7. Returns persisted usage values (documents, storage, questions)
8. Suspend rejects missing reason
9. Suspend rejects whitespace-only reason
10. Suspend rejects unknown fields
11. Suspend rejects protected tenants
12. Rejects non-string and out-of-range reasons
13. Reinstate rejects protected tenants
14. Suspend changes ACTIVE to SUSPENDED
15. Suspend returns alreadyInTargetState for already suspended
16. Suspend records trimmed audit data
17. Reinstate changes SUSPENDED to ACTIVE
18. Reinstate returns alreadyInTargetState for already active
19. Reinstate rejects invalid transitions with a stable conflict
20. Reinstate records audit data
21. Preview suspend returns correct data
22. Preview reinstate returns correct data
23. Suspend rejects invalid tenant IDs
24. Suspend rejects non-existent tenant
25. Suspend from pending_verification is allowed
26. Suspended tenants are accepted by the list filter
27. Non-platform tenant actors cannot mutate lifecycle state
28. Preview and mutation share idempotent target-state rules
29. Repeated suspend requests return the documented idempotent result

### Frontend (`platform-lifecycle.service.test.ts`) — 16 Vitest tests

Covers detail/preview routes, POST request bodies, suspended list parsing,
blocked confirmation, trimmed reason validation, completed-transition reload,
and preview request deduplication across rerenders.

## Manual Verification

1. Sign in through the normal platform Super Admin flow and open
   `/super-admin/companies`.
2. Select the `Suspended` status filter and confirm suspended tenants are
   returned and display the suspended status pill.
3. Open a non-platform active or trial tenant. Confirm the enriched user,
   package/subscription, usage, and audit sections load.
4. Open Suspend. Confirm exactly one preview request occurs, then rerender the
   page (for example by changing and restoring the reason) and confirm no new
   preview request is sent.
5. Exercise preview error and Retry, then verify Escape, backdrop, close button,
   initial focus, and focus restoration. None may close while a mutation is
   pending.
6. Verify a blocked preview has blocking reasons and no enabled confirmation.
7. Enter a whitespace/short reason and confirm submission remains disabled;
   enter a valid 3–500 character reason and suspend the tenant.
8. Confirm the detail reloads to `suspended`, the success notice is announced,
   and one `TENANT_SUSPENDED` audit event contains the trimmed reason.
9. Repeat through Reinstate and confirm status `active` plus one
   `TENANT_REINSTATED` audit event.
10. Call the same mutation again and confirm HTTP 200 with
    `alreadyInTargetState: true` and no additional transition audit event.
11. Verify non-platform actors, actors without the required permission, and
    protected system/platform tenant IDs receive the documented stable errors.

## Deferred Work

The following items are explicitly **not** part of Phase 2 and are deferred to later phases:

- Tenant archive operations
- Tenant deletion (soft or permanent)
- Tenant impersonation
- Subscription/package override
