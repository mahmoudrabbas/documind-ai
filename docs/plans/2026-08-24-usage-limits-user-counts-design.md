# Usage & Limits User Counts Design

## Problem

The company Usage & Limits page can show a stale employee count and omit the
Admins dimension entirely after users are invited or accept an invitation.
Overview is correct because it reads user data directly. The entitlement usage
endpoint currently reads only existing quota-counter rows, and the UI renders
only dimensions present in that sparse response.

## Design

Keep the entitlement counter as the response and enforcement source, but repair
the user-seat dimensions before a Usage & Limits read returns. The read path
will reconcile `employees` and `admins` against the existing authoritative
`UserModel` queries through `ReconciliationService.reconcileAtLeast`, then read
the current-period counters. This creates missing zero-valued rows and raises
stale-low counters without changing the existing non-disabled counting rules.

The repair is best effort, matching existing request-path reconciliation
behavior. If reconciliation cannot run, the endpoint still returns the current
counter data rather than failing the page. The UI contract remains unchanged;
it will receive the same flat `current` map, now containing the user-seat
dimensions whenever entitlement usage is available.

## Data Flow

1. `GET /entitlement/usage` resolves the tenant and current billing period.
2. The entitlement service reconciles `employees` and `admins` for that period.
3. The service reads all current-period quota counters.
4. The controller adds its existing document-count correction and returns the
   usage/limit payload.
5. The Usage & Limits page renders both seat dimensions from `current`.

## Error Handling

Reconciliation remains non-fatal. Existing `reconcileSnapshotUsage` catches
reconciliation errors, so transient user-count or counter failures preserve the
current read behavior. No new user-facing error state is introduced.

## Testing

Add a focused entitlement-service regression test that starts with no employee
or admin counter rows, provides authoritative user counts through the existing
reconciliation seam, calls `getUsage`, and asserts both dimensions are present
with the authoritative values. Add a stale-low case to prove a newly accepted
employee is reflected. Run the focused entitlement tests, then API typecheck and
the full API test command.
