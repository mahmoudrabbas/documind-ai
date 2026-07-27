# Issue 26 Phase 5 — Final Integration Verification

## Scope and prior phases

Issue 26 now provides the Super Admin control plane delivered across:

- Phase 1: platform access and control-center foundations.
- [Phase 2 tenant operations](./issue-26-phase-2-tenant-operations.md).
- [Phase 3 package operations](./issue-26-phase-3-package-operations.md).
- [Phase 4 subscription operations](./issue-26-phase-4-subscription-operations.md).

Phase 5 verified integration, corrected settings error/audit correlation gaps, and did not add billing self-service or provider mutation features.

## Final route and permission matrix

All `/platform` routes require authentication, the platform tenant, and persisted-actor authorization. Frontend control visibility is convenience only; API authorization is authoritative.

| Area | Routes | Read permission | Mutation permission |
| --- | --- | --- | --- |
| Settings | `GET/PATCH /platform/settings` | `COMPANY_SETTINGS_READ` | `COMPANY_SETTINGS_UPDATE` |
| Tenant detail | `GET /platform/tenants/:id/detail` | `COMPANY_SETTINGS_READ` | — |
| Tenant lifecycle | `GET .../suspend-impact`, `POST .../suspend`, `GET .../reinstate-impact`, `POST .../reinstate` | `COMPANY_SETTINGS_READ` | `COMPANY_SETTINGS_UPDATE` |
| Packages | `GET /platform/packages`, `GET /platform/packages/:id`, `POST /platform/packages`, `PATCH /platform/packages/:id`, `POST .../versions`, `GET .../impact`, `POST .../archive`, `POST .../activate` | `BILLING_READ` | `BILLING_MANAGE` |
| Subscriptions | `GET /platform/subscriptions`, `GET /platform/subscriptions/:tenantId`, `GET .../impact`, `POST /platform/subscriptions/:tenantId`, `PATCH /platform/subscriptions/:tenantId` | `BILLING_READ` | `BILLING_MANAGE` |
| Public packages | `GET /public/packages` | Public, filtered DTO | None |

No package or subscription DELETE route exists.

## Domain invariants

### Tenant lifecycle

- The system/platform tenant is excluded and cannot be suspended or reinstated.
- Preview and mutation share transition rules.
- Reasons are strict, trimmed, and audited.
- Repeated target-state requests use the documented stable idempotent response.
- Suspended tenants remain listable through the suspended status filter.

### Package lifecycle and versions

- Package code is normalized, unique, and immutable.
- Versioned changes append immutable snapshots; previous snapshots are not rewritten.
- `expectedVersion` protects edits and lifecycle operations from stale writes.
- Archive/activate are explicit audited transitions; no hard delete is available.
- Archived/internal packages are unavailable for new public selection while historical subscription references remain valid.
- Provider synchronization failure archives/hides a created package instead of destroying its history.

### Subscription provisioning and updates

- `POST` explicitly provisions a missing subscription; `PATCH` never creates one.
- Provisioning stores the exact current package version, initializes revision/idempotency state, and creates no fabricated provider identifiers.
- Package-only changes omit unchanged status, preserve status, update package and package version atomically, and increment revision.
- Status changes use the existing legal transition table and side effects.
- Mutations require a trimmed reason, `expectedVersion`, and `Idempotency-Key`.
- Same-key/same-payload replay returns the stored result without duplicate mutation or success audit; a different payload conflicts.
- Provider-managed unsupported changes fail closed with `SUBSCRIPTION_PROVIDER_ACTION_REQUIRED`; webhooks remain authoritative.

## Stable errors

Validation failures map to 400, authorization failures to 403, missing resources to 404, duplicate/stale/no-change/invalid lifecycle conditions to 409, and genuine provider dependency failures only to 502/503. The focused contracts cover protected tenants, duplicate package codes, stale package/subscription versions, lifecycle conflicts, inactive packages, missing/existing subscriptions, no-change, invalid transitions, idempotency conflict, and provider-action-required behavior. Exact codes and response bodies remain documented in the Phase 2–4 documents.

## Audit coverage

Defined actions include tenant suspend/reinstate, package create/update/version/archive/activate, subscription provision/package change/status override/combined update/denial, and platform setting update. Mutation audits carry authoritative actor identity, resource identity, outcome, safe old/new values, trimmed reason where required, and request correlation metadata. Idempotent subscription replay does not add a duplicate success audit. Raw provider responses, provider secrets, and credentials are not stored in these audit payloads.

Phase 5 corrected `PLATFORM_SETTING_UPDATED` so `traceId` and `requestId` are retained in audit metadata. The settings UI now presents safe API validation messages and stable codes, while unknown failures retain a generic message.

## Runtime and manual evidence

Verified on 2026-07-27 against the running local Docker stack:

- MongoDB, Redis, API, app, and worker services reported healthy.
- Persisted global settings contained all five supported values and an authoritative updater reference; support email was inspected only as a presence boolean.
- The system tenant remained `active` with `isSystemTenant=true`; tenant status counts included active and suspended tenants.
- Persisted packages included immutable version histories (including multi-version packages with stable codes), six active/public packages, and one active/internal package.
- `GET /public/packages` returned HTTP 200 with exactly six packages and excluded the known internal package.
- Persisted local subscription evidence showed exact package versions, revisions, status changes, and no fabricated provider identifiers.
- Successful tenant, package, and subscription audits had authoritative Super Admin actor/resource fields, SUCCESS outcomes, correlation identifiers, and trimmed reasons where required.
- The successful provisioning idempotency reference grouped to exactly one audit record.

Authenticated browser checkpoint:

- Opened the ACTIVE provider-managed subscription for tenant `Ai` and requested Change Package impact.
- UI displayed: `Provider-managed subscriptions must be changed through the billing provider.`
- API logs recorded `GET /platform/subscriptions/:tenantId/impact?...` with HTTP 200 and no following PATCH.
- The subscription remained ACTIVE at package version 1 and revision 2 with `providerManaged=true`.
- No subscription mutation success/denial audit was added because confirmation was blocked before a mutation request.

Automated UI contracts cover no repeated previews, provision POST versus update PATCH, omission of unchanged fields, stable idempotency keys, blocked confirmation, stale reloads, permissions, Escape/backdrop behavior, accessible dialog roles/labels, and public package data loading. Visual focus restoration and responsive RTL/LTR rendering remain final human smoke checks across supported browsers.

## Automated command evidence

| Command | Result |
| --- | --- |
| `npm run lint --workspace api` | PASS |
| `npm run typecheck --workspace api` | PASS |
| `npm run test --workspace api` | PASS (exit 0; final Vitest phase 21 files / 463 tests; one unrelated replica-set listener case skipped after local startup timeout) |
| `npm run build --workspace api` | PASS |
| `npm run lint --workspace app` | PASS |
| `npm run typecheck --workspace app` | PASS |
| `npm run test --workspace app` | PASS (38 files / 529 tests) |
| `npm run build --workspace app` | PASS (48 pages generated; required running outside the filesystem sandbox because Turbopack binds an internal local port) |
| `npm run lint --workspace workers` | PASS |
| `npm run typecheck --workspace workers` | PASS |
| `npm run test --workspace workers` | PASS (all 16 test files) |
| `npm run build --workspace workers` | PASS |

## Runtime/generated files excluded

The following are runtime/generated and remain untracked and unstaged: `api/uploads/`, root `eng.traineddata`, and worker Arabic/English trained-data files. Their contents were not inspected or modified. No session export was present.

## Issue 29 exclusions

Company Admin subscription self-service, upgrade/downgrade proration, scheduled downgrade, customer cancellation/reactivation, billing portal, invoices, refunds, payment methods, coupons/promotions, Stripe customer self-service, and unsupported provider subscription mutation remain Issue 29 scope.

## Rollback considerations

- Application rollback does not require deleting package versions, subscriptions, idempotency records, or audits.
- Never roll back by hard-deleting package/version or subscription history.
- Provider-managed records must remain provider-owned; a rollback must not rewrite them as local/manual.
- Global settings remain compatible because Phase 5 changed only UI error presentation and audit correlation metadata.

## PR checklist

- [x] Phase 1–4 and OCR commits preserved.
- [x] Platform/system tenant protection and persisted-actor authorization preserved.
- [x] Package/version and subscription concurrency/idempotency contracts verified.
- [x] Provider-managed mutation blocks before local persistence.
- [x] Public package endpoint excludes internal/archived packages.
- [x] Full API, app, and worker lint/typecheck/test/build gates pass.
- [x] Runtime/generated files excluded from staging.
- [x] No commit or push performed during Phase 5.
- [ ] Complete final visual focus restoration and responsive RTL/LTR smoke checks in supported browsers.
