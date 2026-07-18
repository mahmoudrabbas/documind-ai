# Authentication and Authorization Hardening Plan

This file captures the focused implementation plan for the current auth/authz pass before additional code edits.

## Files to Change

- `api/src/common/auth/platformTenant.ts`: define the reserved platform tenant slug and helper checks for `documind.ai`.
- `api/src/common/middlewares/platformTenant.middleware.ts`: enforce that Super Admin API access uses a trusted `SUPER_ADMIN` session bound to the reserved platform tenant.
- `api/src/modules/auth/*`: block reserved slug misuse in customer flows, bind Super Admin login to `documind.ai`, keep tenant-scoped token/session handling, and extend tests.
- `api/src/modules/bootstrap/*` and `api/src/scripts/seed-super-admin*`: create/seed the reserved platform tenant using `documind.ai` only.
- `api/src/modules/platform/*`, `api/src/modules/admin/*`, `api/src/modules/jobs/*`, `api/src/modules/agents/*`, `api/src/modules/payment-webhooks/*`, `api/src/modules/reconciliation/*`: apply the platform tenant guard to Super Admin route groups.
- `api/src/modules/users/*`: preserve invitation-purpose separation, add resend/reissue recovery, and prevent customer invitation flows from operating in the reserved platform tenant.
- `api/src/scripts/migrate-platform-tenant-invariants.ts` and `api/package.json`: provide a dry-run-first migration/backfill script for platform tenant invariant detection/fixes without executing it.
- `app/src/app/(auth)/*`, `app/src/app/set-password-from-invite/*`, `app/src/components/auth/*`, `app/src/lib/*`: add resend-verification UI, disable retry-spam during 429 windows, improve invite reissue recovery, and tighten safe guest return behavior while preserving design.
- `docs/auth-authorization-matrix.md`: document changed auth/authz contracts, route requirements, tenant scope, and error behavior.

## Boundaries

- Do not run lint, typecheck, tests, builds, Docker, migrations, installs, servers, or seed scripts.
- Do not modify unrelated dirty files in dashboard roles, worker config, Docker Compose, or permission utility work unless auth/authz invariants directly require it.
- Preserve exactly three base roles and do not add dependencies.
