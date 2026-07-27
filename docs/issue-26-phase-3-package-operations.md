# Issue 26 Phase 3 — Super Admin Package Operations

## Authorization

Every `/platform` route requires authentication and `requirePlatformTenant`. The service re-resolves the persisted active actor and active system/platform tenant. Package reads require `BILLING_READ`; create, version, archive, and activate require `BILLING_MANAGE`. UI visibility is convenience only and is not an authorization boundary.

## Routes

| Method | Route | Permission | Contract |
|---|---|---|---|
| GET | `/platform/packages` | `BILLING_READ` | All active and archived packages |
| GET | `/platform/packages/:id` | `BILLING_READ` | Package detail and immutable `versions` history |
| POST | `/platform/packages` | `BILLING_MANAGE` | Create version 1; HTTP 201 |
| PATCH | `/platform/packages/:id` | `BILLING_MANAGE` | Compatibility alias for an optimistic immutable version update |
| POST | `/platform/packages/:id/versions` | `BILLING_MANAGE` | Explicit immutable version creation |
| GET | `/platform/packages/:id/impact?action=archive\|activate` | `BILLING_READ` | Lifecycle/usage preview |
| POST | `/platform/packages/:id/archive` | `BILLING_MANAGE` | Archive after preview using the shared transition rules |
| POST | `/platform/packages/:id/activate` | `BILLING_MANAGE` | Explicitly reactivate an archived package |
| GET | `/public/packages` | Public | Active packages with `visibility=public` only |

There is intentionally no package DELETE route.

## Request contracts

Create requires `name`, normalized unique `code`, `monthlyPrice`, and all entitlements. It accepts `description`, `annualPrice`, three-letter `currency`, `trialDays`, `visibility`, `supportedModels`, `analyticsLevel`, `retentionDays`, and `supportLevel`. Unknown top-level and nested keys are rejected. Prices must be finite and non-negative; `0` means the billing interval is unavailable/free. Monthly and annual prices are independently optional commercial intervals—no implicit discount is imposed. Counts and days are bounded integers; employees is at least 1. Supported models are trimmed, non-empty, unique strings.

Version requests require `expectedVersion` and at least one editable field. Package `code`, `active`, provider identifiers, and history are not accepted. The server atomically matches `expectedVersion`, increments the version, updates current fields, and appends a complete snapshot.

Lifecycle mutation body:

```json
{ "expectedVersion": 3, "reason": "Retired after commercial review" }
```

Reason is trimmed and must contain 3–500 characters.

Responses use `{ "success": true, "data": ... }`. A version response includes the current package and `versionBumped: true`. A preview contains package id/name/code/version/state, subscription count, counts by subscription state, landing visibility impact, warnings, blocking reasons, and `transitionAllowed`.

## Invariants and transitions

- Code is normalized at creation and immutable because subscriptions, registration, checkout, and provider metadata use it as an identifier.
- Version snapshots are append-only. Historical snapshots are never rewritten, including legacy snapshots.
- Optimistic concurrency prevents a stale editor from overwriting a newer version.
- Active packages may be archived. Archived packages may be activated. Repeating either transition returns a stable conflict.
- Archive changes only `active`; it removes a public package from new public selection while existing subscriptions keep their package id/version references.
- In-use packages are not deleted or rewritten. Preview warns with usage/state counts; archive remains compatible because existing references are retained.
- Provider product/price creation remains in the existing Stripe synchronization boundary. Provider responses and secrets are not returned. Failed initial sync preserves history by making the package inactive/internal instead of deleting it.

## Stable errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Strict body/query/id validation failed |
| 403 | `PERMISSION_REQUIRED` | Persisted platform actor/tenant or permission check failed |
| 404 | `PACKAGE_NOT_FOUND` | Package does not exist |
| 409 | `PACKAGE_CODE_CONFLICT` | Normalized code is already used |
| 409 | `PACKAGE_VERSION_CONFLICT` | `expectedVersion` is stale |
| 409 | `PACKAGE_ALREADY_ARCHIVED` | Archive repeated/invalid |
| 409 | `PACKAGE_ALREADY_ACTIVE` | Activate repeated/invalid |
| 409 | `PACKAGE_TRANSITION_BLOCKED` | A lifecycle rule blocks the requested action |

## Audit events

`PACKAGE_CREATED`, `PACKAGE_VERSION_CREATED`, `PACKAGE_ARCHIVE_PREVIEWED`, `PACKAGE_ARCHIVED`, `PACKAGE_ACTIVATE_PREVIEWED`, and `PACKAGE_ACTIVATED` record the persisted actor and package. Lifecycle events include old/new state, version, reason, usage impact, outcome, and request trace context. Stable conflicts emit `DENIED`; successful operations emit `SUCCESS`. Permission middleware records authorization denials.

## Frontend and landing behavior

The Super Admin pages load the real list/detail, expose create/version forms only with `BILLING_MANAGE`, show current version/history, reload after a successful version, and reload rather than overwrite after `PACKAGE_VERSION_CONFLICT`. Archive/activate uses an accessible impact dialog with loading, error/retry, blocking, validation, pending, Escape/backdrop close, and focus restoration behavior.

Landing pricing and checkout consume `/public/packages`; no package name, code, price, entitlement, or fallback card is hardcoded. Archived/internal packages are excluded by the backend query.

## Manual verification

1. Sign in through `/super-admin/login` as the configured platform Super Admin.
2. Open `/super-admin/packages`; verify loading, empty/error retry, active/archived status, and permission-controlled actions.
3. Create a package and confirm normalized code/version 1 and its initial snapshot.
4. Open the detail page, create a version, and confirm the previous snapshot is unchanged.
5. Submit an older `expectedVersion`; confirm HTTP 409 `PACKAGE_VERSION_CONFLICT` and UI reload.
6. Open archive preview; compare subscription counts/states and landing impact, enter a reason, and archive.
7. Confirm the package disappears from `/public/packages` but existing subscription package/version references remain.
8. Confirm repeated archive returns `PACKAGE_ALREADY_ARCHIVED`; activate explicitly and verify public visibility returns when package visibility is public.
9. Inspect audit records for actor, package, state/version/reason, outcome, trace ID, and request ID.
