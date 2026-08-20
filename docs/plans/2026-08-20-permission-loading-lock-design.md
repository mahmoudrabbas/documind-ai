# Permission Loading Lock and Tenant Top Bar Cleanup Design

## Goal

Prevent authenticated dashboard sessions from remaining permanently in the
permission-loading state, and remove duplicate company-admin navigation from the
tenant top bar while keeping the sidebar authoritative.

## Proven Failure

`PermissionProvider.refreshPermissions` currently increments a generation for
every call and immediately sets `status: "loading"`. A background 403 can notify
`subscribePermissionDenied` while the initial `/permissions/me` request is still
running. The notification starts another refresh and invalidates the first
response. If the replacement is interrupted by a mount lifecycle transition,
neither request is guaranteed to publish a terminal state. There is also no
timeout, so `PermissionBoundary` and `AppNavigation` never reach their existing
error/retry rendering.

The backend catalog already includes `knowledge-gaps:read` in the `EMPLOYEE`
defaults. No backend role broadening is required.

## Permission Request Design

Maintain one active permission request per authenticated identity. Every refresh
for that identity receives the same promise while it is pending, including
permission-denied notifications. The request owns an identity-scoped token; only
the currently active identity/token may publish state. This replaces the loose
generation counter without weakening stale-response protection.

Wrap the API call in an eight-second timeout. A timeout clears the active request
and publishes `status: "error"` with `Permissions check timed out`. The existing
boundary and navigation error states expose retry, and manual retry starts a
fresh request. Late completion from a timed-out request is ignored.

Permission-denied notifications are coalesced through a short debounce. The
callback requests one refresh after the burst and reuses an already active
permission request rather than creating competing fetches.

Identity changes and unauthenticated transitions invalidate the active token and
clear timers. React StrictMode cleanup prevents state publication after unmount,
while a remounted provider performs its own request for the authenticated
identity.

## UI Design

`PermissionBoundary` continues to show its current loading state during the
bounded request and its existing localized failed state with Retry after timeout
or request failure. `AppNavigation` keeps the skeleton only during bounded
loading and shows its error/retry alert for terminal errors. Its retry copy will
use translations instead of hard-coded English.

For `COMPANY_ADMIN` in tenant context, the top bar becomes a utility bar: remove
the decorative search input and duplicate Overview, Documents, and Users links.
Those routes remain available and permission-filtered in the sidebar. Employee
and platform authorization behavior is unchanged; the cleanup removes no route
guard and grants no permission.

## Testing

- Render the real provider with a deferred permission request and fire rapid
  denial notifications. Assert one API call and eventual ready state.
- Advance fake timers to eight seconds. Assert error state, timeout message, and
  successful manual retry with a new request.
- Unmount/remount around an active request and assert stale completion cannot
  corrupt the remounted provider.
- Assert the employee base-role catalog contains `knowledge-gaps:read`.
- Assert the boundary and sidebar/navigation error states expose working Retry.
- Assert company-admin top bar contains no search, Overview, Documents, or Users
  shortcuts while the sidebar contract remains unchanged.

## Data Safety

This work changes client request lifecycle and navigation presentation only. It
requires no database migration, seed, tenant cleanup, data deletion, or full
Compose startup. Tests are frontend unit tests plus a read-only catalog contract.

