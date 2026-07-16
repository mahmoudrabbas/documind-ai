# Role Phase 1 Migration

These migrations are never run by application startup. Both are dry-run by default and their reports contain only aggregate counts and MongoDB ObjectIds, never names, email addresses, or permission provenance values.

## Role Grants

1. Take a database snapshot and retain it until authorization checks have been verified.
2. Run `npm run migrate:roles:phase1 --workspace api` for all tenants, or append `-- --tenant-id <tenantObjectId>` for one tenant.
3. Review `malformed`, `actorless`, `crossTenantActor`, `quarantined`, and `legacyPermissionEntriesRemoved`. Use `lastScannedId` with `--after-id <roleObjectId>` to resume strictly after the last scanned role.
4. Run `npm run migrate:roles:phase1:apply --workspace api`, preferably one tenant at a time with `-- --tenant-id <tenantObjectId>`.
5. Repeat the dry-run. Successfully migrated rows are reported as `alreadyMigrated`; conditional source-state updates make retries safe.
6. Verify that role listing succeeds, quarantined roles are visible with their safe migration reason, assigned users retain no more effective access than before, and evaluator checks deny archived/quarantined roles.

Legacy `permissions` and global `scopes` become canonical per-permission `grants` using `normalizeRoleGrants`, with `contractVersion: 1`. Unknown, inactive, deprecated, non-tenant-grantable, and scope-incompatible entries are removed. Scope-incompatible entries are dropped rather than made unscoped, so migration cannot broaden their access. Legacy fields are removed after conversion. Only explicit `active` and `archived` source statuses are accepted; missing, disabled, inactive, unknown, malformed, or invalid-version records are archived and quarantined with empty grants.

Valid missing provenance uses a deterministic same-tenant user, preferring an assigned user. Malformed roles, actorless roles, and roles with cross-tenant provenance fail closed: they are archived with empty grants, `migrationState: "quarantined"`, a non-sensitive `migrationReason`, and nullable provenance. Complete roles always have valid same-tenant provenance. Quarantine also fills the fields required for safe role-list serialization.

## Legacy Users

1. Run `npm run migrate:users:employee --workspace api`, optionally with `-- --tenant-id <tenantObjectId>` and/or `--after-id <userObjectId>`.
2. Review `invalidCustomRolesCleared`, `wouldUpdate`, and the safe user ID lists.
3. Apply with `npm run migrate:users:employee:apply --workspace api`, using the same filters.
4. Repeat the dry-run; converted users are no longer selected.

The user migration changes legacy `role: "USER"` to `role: "EMPLOYEE"`, clears `customRoleId`, and sets `permissionBaseline: "legacy-none"`. This baseline has no inherited or custom permissions, so the complete effective permission set cannot increase. Access can be granted later only through a separate authorized administration flow.

Changing a user's base role changes authorization claims. Apply first persists `roleMigrationState: "pending-session-revocation"`; that state authorizes nothing and remains selected on retries. Refresh records with null or missing `revokedAt` are then revoked before the state becomes `complete`. Apply refuses to start without a refresh collection. Users must reauthenticate after their current access token expires; existing access tokens are not centrally revocable.

## Recovery

The safest rollback is restoring a tested pre-apply snapshot that includes roles, users, and refresh tokens from the same point in time. Before apply, verify the snapshot can be listed and restored in an isolated environment. Before restore, stop writes and retain an export of the failed post-migration state for investigation. After restore, verify collection counts, role-list availability, assignment references, active Company Admin presence, evaluator defaults/custom grants, and refresh-token revocation state before reopening traffic. Do not broadly unset new fields or rewrite user roles: that can damage records created or edited after deployment.

Failures print only a stable code and `resumeAfterId`. The checkpoint is the last successfully processed ID, so resuming strictly after it retries the failed record. A run may also safely restart the tenant from the beginning. Reconcile `skippedConcurrentChange` before proceeding; rerun after pausing writes or inspect the named ObjectId through an approved administrative channel.

## Quarantine Remediation

1. Keep the role archived while investigating its ObjectId and `migrationReason`; never edit raw grants in place.
2. `ACTORLESS_PROVENANCE`: select valid same-tenant creator/updater users. `CROSS_TENANT_PROVENANCE`: remove foreign references and select valid same-tenant actors. Invalid identity records require a controlled export/repair because they cannot be safely tenant-filtered.
3. `MALFORMED_GRANTS` or legacy scope/permission failures: construct a new canonical grant list from currently documented tenant-grantable permissions. Invalid status/version records require an explicit approved status and version of at least one.
4. Validate the repaired candidate using the Role model in an isolated database, including normalized name, grants, provenance, status, contract version, and uniqueness.
5. Prefer creating a new validated role and deliberately reassigning users. If an in-place operational repair is approved, use a dedicated audited remediation command, set `migrationState: "complete"` only after validation, and reactivate only through the version-checked role API.
6. Repeat dry-run and permission evaluation before reopening access. Quarantined records never authorize merely because fields were partially repaired.
