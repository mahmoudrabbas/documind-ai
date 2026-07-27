# Issue 26 Phase 4 — Super Admin Subscription Operations

## Authorization and routes

All routes require `authenticate` and `requirePlatformTenant`. Persisted platform `SUPER_ADMIN` authorization remains authoritative. Read routes require `BILLING_READ`; mutations require `BILLING_MANAGE`. The platform/system tenant cannot be a target.

| Method | Route | Purpose |
|---|---|---|
| GET | `/platform/subscriptions` | List subscriptions with populated tenant/package summaries and masked provider state |
| GET | `/platform/subscriptions/:tenantId` | Tenant drilldown; returns `subscription: null` when the tenant has none |
| GET | `/platform/subscriptions/:tenantId/impact?action=...&packageId=...&targetStatus=...&expectedVersion=...` | Read-only deterministic preview |
| POST | `/platform/subscriptions/:tenantId` | Explicitly provision a missing local subscription |
| PATCH | `/platform/subscriptions/:tenantId` | Change package and/or legally transition an existing local subscription |

There is no DELETE route. PATCH never provisions a missing subscription.

## Contracts and invariants

POST requires an `Idempotency-Key` header and strict body:

```json
{
  "packageId": "ObjectId",
  "status": "trialing | active",
  "expectedVersion": 0,
  "reason": "trimmed administrative reason"
}
```

The UI selects `trialing` when the selected package has positive `trialDays`; otherwise it selects `active`. A requested trial is rejected when the package has no trial. Provisioning stores the active package's exact current immutable `packageVersion`, never fabricates provider identifiers, and relies on the unique tenant subscription index to resolve concurrent creates safely.

PATCH requires an `Idempotency-Key` header and strict body:

```json
{
  "expectedVersion": 3,
  "reason": "trimmed administrative reason",
  "packageId": "optional active package ObjectId",
  "status": "optional legal target status"
}
```

Unknown keys and empty updates are rejected. Reasons are 10–1000 trimmed characters. Package-only updates omit `status`, preserve current status, and atomically persist `packageId` with the selected current `packageVersion`. Status-only updates omit `packageId`. Same-status plus a real package change is a package-only update; otherwise unchanged values return `SUBSCRIPTION_NO_CHANGE`.

Every subscription write advances `revision`. Detail exposes it as `version`; mutations atomically match `expectedVersion`. A mismatch returns `SUBSCRIPTION_STALE_VERSION`, protecting against concurrent admin or webhook changes.

Idempotency keys are SHA-256 referenced, not logged raw. The operation fingerprint, resulting package/version/status, and resulting revision are stored atomically with the subscription. Same-key/same-payload replay returns the original stable result without a second audit. Same-key/different-payload returns `SUBSCRIPTION_IDEMPOTENCY_CONFLICT`.

## Lifecycle and provider behavior

The existing `LEGAL_TRANSITIONS` table in `subscription.service.ts` is the only status state machine. Detail and preview return its legal targets. Terminal `CANCELED` remains terminal. Existing transition side effects for trial completion, cancellation, and expiry are preserved.

Subscriptions with any provider customer, subscription, or price ownership marker are provider-managed. The current provider port does not offer a safe price/status override operation, so admin mutations fail closed with `SUBSCRIPTION_PROVIDER_ACTION_REQUIRED`. Raw provider identifiers and metadata are not returned; the UI receives booleans only. Webhooks remain authoritative and reconciliation remains diagnostic/read-only.

## Impact preview

Preview uses the same deterministic decision function as mutation and reports tenant/subscription presence, current and target package/version/entitlements, entitlement increases/decreases, current status/version, legal targets, provider ownership booleans, operation mode, warnings, blocking reasons, and `transitionAllowed`. It also indicates when checkout/provider action is required.

## Stable errors

| Code | Status | Meaning |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Malformed ID/header/body, unknown key, invalid reason/status/version, or empty update |
| `SUBSCRIPTION_NOT_FOUND` | 404 | PATCH target has no subscription |
| `PACKAGE_NOT_FOUND` | 404 | Target package does not exist |
| `SUBSCRIPTION_PROTECTED_TENANT` | 404 | Tenant is missing or is a protected platform tenant |
| `SUBSCRIPTION_ALREADY_EXISTS` | 409 | POST target already has a subscription |
| `SUBSCRIPTION_NO_CHANGE` | 409 | Update contains no effective change |
| `SUBSCRIPTION_INVALID_TRANSITION` | 409 | State transition is illegal or trial is unsupported |
| `SUBSCRIPTION_STALE_VERSION` | 409 | Optimistic concurrency check failed |
| `SUBSCRIPTION_IDEMPOTENCY_CONFLICT` | 409 | Key was reused with a different payload |
| `SUBSCRIPTION_PACKAGE_INACTIVE` | 409 | Target package is archived/inactive |
| `SUBSCRIPTION_PROVIDER_ACTION_REQUIRED` | 409 | Provider-managed change cannot safely execute locally |

## Audit events

Successful operations emit one of `SUBSCRIPTION_PROVISIONED`, `SUBSCRIPTION_PACKAGE_CHANGED`, `SUBSCRIPTION_STATUS_OVERRIDDEN`, or `SUBSCRIPTION_COMBINED_UPDATED`. The audit includes platform actor identity, target tenant/subscription, previous/new package and immutable version, previous/new status, trimmed reason, `triggeredBy: admin`, safe idempotency hash, trace/request IDs, and `SUCCESS` outcome. Idempotent replay does not emit a duplicate audit.

## Manual browser verification

1. Log in through the existing platform Super Admin session and open **Subscriptions**.
2. Select a non-platform tenant without a subscription; verify the UI says `no subscription` and only offers **Provision Subscription**.
3. Select an active package, open preview, enter a reason of at least 10 characters, confirm, and verify exactly one subscription with the displayed package version.
4. Repeat the same request/key at API level and verify stable replay with no duplicate subscription/audit; reuse the key with another payload and verify HTTP 409.
5. Select an existing ACTIVE local subscription, choose another package, and verify PATCH omits status and preserves ACTIVE.
6. Open status change and verify only `legalTransitions` appear. Confirm a legal transition and verify the revision increments.
7. Open two sessions at the same revision; complete one and verify the second receives `SUBSCRIPTION_STALE_VERSION` and reloads.
8. Select an archived package or provider-managed subscription and verify preview blocks confirmation with safe guidance.
9. Verify raw provider IDs, metadata, webhook payloads, and secrets are absent from responses/UI.

Billing portal, invoices, refunds, payment methods, proration, promotions, and customer self-service remain Issue 29 scope.
