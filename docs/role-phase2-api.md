# Role Phase 2 API

Phase 2 provides the database-backed permission evaluator and tenant custom-role backend. All routes require an access token and derive tenant identity only from authenticated middleware. No request body, query, or path value can select the tenant. Responses use the canonical `{success,data}` or `{success:false,error:{code,...}}` envelope.

The permission contract version is `PERMISSION_CONTRACT_VERSION` from `api/src/modules/permissions/permissions.catalog.ts`. There are exactly three base roles: `SUPER_ADMIN`, `COMPANY_ADMIN`, and `EMPLOYEE`. Custom roles are additive bundles constrained to `COMPANY_ADMIN` or `EMPLOYEE`; assignment never changes `User.role`.

## Routes

| Method | Route | Required permission | Request | Success data |
| --- | --- | --- | --- | --- |
| `GET` | `/permissions` | authenticated actor | none | `{contractVersion,groups[]}` containing active tenant-grantable permissions |
| `GET` | `/permissions/me` | authenticated actor | none | current database-backed effective permissions, grants, base role, role ID/version |
| `GET` | `/roles` | `roles:read` | none | `{roles: RolePublicView[]}` |
| `GET` | `/roles/:id` | `roles:read` | ObjectId path | `{role}` |
| `GET` | `/roles/:id/usage` | `roles:read` | ObjectId path | `{roleId,assignedUserCount}` |
| `POST` | `/roles` | `roles:create` | `{name,baseRole,grants?}` | `201 {role}` |
| `PATCH` | `/roles/:id` | `roles:update` | `{version,name?,baseRole?,grants?,status?}` | `{role}` |
| `POST` | `/roles/:id/clone` | `roles:create` | `{name,version}` | `201 {role}` |
| `POST` | `/roles/:id/archive` | `roles:update` | `{version}` | `{role}` |
| `POST` | `/roles/:id/reactivate` | `roles:update` | `{version}` | `{role}` |
| `DELETE` | `/roles/:id` | `roles:delete` | `{version}` | `{success:true}` |
| `POST` | `/roles/:id/assignments` | `users:assign-role` | `{userId,roleVersion}` | `{userId,roleId,changed}` |
| `DELETE` | `/roles/:id/assignments` | `users:assign-role` | `{userId,roleVersion}` | `{userId,roleId:null,changed}` |
| `POST` | `/roles/:id/user-migrations` | `users:assign-role` | `{destinationRoleId,sourceVersion,destinationVersion}` | `{sourceRoleId,destinationRoleId,affected,skipped,conflicted}` |

`RolePublicView` contains `id`, `tenantId`, `name`, `baseRole`, canonical `grants`, `contractVersion`, `status`, domain `version`, safe provenance IDs, migration state/reason, assigned-user count, and timestamps. Role list ordering is by name. Phase 2 has no list filters or pagination because tenant role sets are expected to remain bounded; adding either is an API-compatible future extension.

Bodies are strict. Names are 2-50 characters, normalized case-insensitively for tenant uniqueness, and cannot use reserved base-role names. Grants contain a canonical permission plus optional `selfOnly`, `departmentIds`, `documentCategories`, and `documentClassifications`. Unknown, deprecated, inactive, platform, non-tenant-grantable, incompatible, malformed, and nondelegable grants are rejected.

## Isolation And Delegation

Every repository lookup includes the authenticated tenant. Cross-tenant role and user IDs return a non-disclosing denial or `NOT_FOUND`; they never return foreign data. Services repeat permission and delegation checks even when route middleware has already succeeded. Sensitive checks and writes are serialized with `Tenant.roleGuardVersion` transactions.

An actor can delegate only an active tenant-grantable permission they currently hold, and only at an equal or narrower scope. Company Admin base defaults do not make catalog entries marked nondelegable assignable. Tenant roles never grant platform-level Super Admin authority. Archived, quarantined, unsupported-contract, stale, mismatched-base, cross-tenant, and missing roles are not assignable.

## Assignment And Migration

Assignment validates actor, target user, role tenant, role status, migration state, permission contract version, role version, base-role compatibility, and delegation. It changes only `customRoleId`; it never changes the target's approved base role. Super Admin targets are rejected with `ROLE_NOT_ASSIGNABLE`.

The dedicated `/roles/:id/assignments` route is the sole custom-role assignment contract. The legacy `POST /users` invitation request accepts `{name,email,role}` with an explicit base role and rejects `customRoleId`; `PATCH /users/:id` accepts only base `role` and/or `status` and likewise rejects `customRoleId`. Neither user mutation accepts `tenantId`.

The users page implements a minimal compatibility workflow, not a role editor. For a custom-role invitation it reads the selected active role's authoritative `id`, `baseRole`, and `version`, sends `POST /users` with that `baseRole`, reads the returned user ID, and then sends `POST /roles/:roleId/assignments` with `{userId,roleVersion}`. If assignment fails after invitation succeeds, the UI preserves the user ID, reports the invitation as successful and assignment as failed, and offers an assignment-only retry after refreshing role data. Retrying never resends the invitation.

For an existing user, selecting a base role uses `PATCH /users/:id`; this also clears any old custom assignment through the backend's existing safe behavior. Selecting a custom role uses the dedicated assignment endpoint. If its `baseRole` differs from the user's current base role, the client patches the base role first and then assigns the custom role. A failed assignment is not rendered as a successful custom-role transition.

Removal requires the current role version and may remove archived assignments. If the user no longer has that exact role, removal succeeds with `changed:false`. Assignment to the already assigned role likewise returns `changed:false`.

Migration requires distinct same-tenant source/destination roles, exact versions, matching base-role constraints, and an active complete destination on the current contract. `affected` counts moved compatible users, `skipped` counts persisted source assignments whose base role is incompatible, and `conflicted` is zero while the transaction owns the tenant role lock. A retry after success reports zero affected users because no matching source assignments remain. Migration does not alter base roles or silently delete/archive the source.

## Concurrency And Retry

Every role mutation requires the observed positive domain version. For wire compatibility, the pre-Phase-2 `PATCH /roles/:id` and `DELETE /roles/:id` contracts return `409 STALE_ROLE_VERSION`. New Phase 2 clone, archive/reactivate, assignment/removal, and migration operations return `409 ROLE_VERSION_CONFLICT`. Role writes and assignment paths share a tenant serialization lock and commit transactionally.

Create and clone have no idempotency key. Clone rereads its same-tenant source inside the role transaction and requires the exact version, active status, complete migration, current contract, canonical grants, valid tenant provenance, and fully delegable grants. Archived or otherwise invalid sources return `ROLE_NOT_ASSIGNABLE`, and no clone is created. A retry with the same normalized name deterministically returns `DUPLICATE_ROLE_NAME`. Legacy update/delete retries return `STALE_ROLE_VERSION`; new lifecycle retries return `ROLE_VERSION_CONFLICT`. Assignment/removal are idempotent through `changed`; `changed:false` does not emit a mutation-success audit event. Migration is state-idempotent and returns counts for the state observed under the lock. A role with assignments returns `ROLE_IN_USE` on delete and requires explicit user migration or removal first.

Stable security and lifecycle codes include `PERMISSION_REQUIRED`, `SCOPE_MISMATCH`, `INVALID_PERMISSION`, `UNKNOWN_PERMISSION`, `ROLE_NOT_ASSIGNABLE`, `STALE_ROLE_VERSION`, `ROLE_VERSION_CONFLICT`, `ROLE_IN_USE`, `DUPLICATE_ROLE_NAME`, `MALFORMED_OBJECT_ID`, `NOT_FOUND`, `PRIVILEGE_ESCALATION`, and `VALIDATION_ERROR`. All failures use `{success:false,error:{code,message,...}}`; authentication failures are `401 UNAUTHORIZED`, permission failures are `403`, validation/malformed identifiers are `400`, concealed cross-tenant resources are `404 NOT_FOUND`, and version/lifecycle conflicts are `409`.

## Audit

The backend emits `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_CLONED`, `ROLE_ARCHIVED`, `ROLE_REACTIVATED`, `ROLE_DELETED`, `ROLE_ASSIGNED`, `ROLE_ASSIGNMENT_REMOVED`, `ROLE_USERS_MIGRATED`, `ROLE_ESCALATION_BLOCKED`, and safe `ROLE_ACCESS_DENIED` events. Fields are limited to tenant/actor/target IDs, permission identifiers, versions, counts, safe reasons, and request/trace correlation. The shared audit writer redacts sensitive keys and never logs tokens, secrets, document content, arbitrary request payloads, permission arrays, or email addresses on its failure path.

Audit persistence is non-blocking: a `false` writer result never rolls back or changes a successful business response. The service increments `role_operation_audit_failure` and writes a safe structured error containing only action, tenant ID, actor ID, resource ID, request ID, and trace ID.

## Deferred UI

The complete frontend role-management editor, permission matrix, scope controls, bulk assignment/migration screens, and general stale-version recovery UX are explicitly deferred to Phase 3. Phase 2 includes only the minimal users-page compatibility flow described above and does not claim the full role-management UI is complete.
