# Role Phase 2 API

Phase 2 provides the database-backed permission evaluator and tenant custom-role backend. All routes require an access token and derive tenant identity only from authenticated middleware. No request body, query, or path value can select the tenant. Responses use the canonical `{success,data}` or `{success:false,error:{code,...}}` envelope.

The permission contract version is `PERMISSION_CONTRACT_VERSION` from `api/src/modules/permissions/permissions.catalog.ts`. There are exactly three base roles: `SUPER_ADMIN`, `COMPANY_ADMIN`, and `EMPLOYEE`. Custom roles are additive bundles constrained to `COMPANY_ADMIN` or `EMPLOYEE`; assignment never changes `User.role`.

## Permission Catalog Contract (GET /permissions)

The catalog returns the authoritative backend permission metadata for the tenant-usable permission set. The response is tenant-neutral and contains no internal fields.

### Response Shape

```json
{
  "success": true,
  "data": {
    "contractVersion": 1,
    "groups": [
      {
        "group": "documents",
        "label": "Documents",
        "permissions": [
          {
            "id": "documents:read",
            "label": "View Documents",
            "description": "View tenant documents",
            "compatibleScopes": ["selfOnly", "departmentIds", "documentCategories", "documentClassifications"],
            "defaultBaseRoles": ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"],
            "active": true,
            "deprecated": false,
            "platformOnly": false,
            "tenantGrantable": true,
            "delegableByTenantAdmin": true,
            "contractVersion": 1
          }
        ]
      }
    ],
    "baseRoleDefaults": {
      "COMPANY_ADMIN": ["documents:read", "users:read", ...],
      "EMPLOYEE": ["documents:read", "chat:read", ...]
    }
  }
}
```

### Field Semantics

| Field | Type | Description |
|---|---|---|
| `id` | string | Canonical permission identifier (e.g. `documents:read`) |
| `label` | string | Human-readable display name |
| `description` | string | Human-readable description |
| `compatibleScopes` | string[] | Scope types this permission supports: `selfOnly`, `departmentIds`, `documentCategories`, `documentClassifications` |
| `defaultBaseRoles` | string[] | Base roles that inherit this permission by default: `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` |
| `active` | boolean | Whether the permission is currently active |
| `deprecated` | boolean | Whether the permission is deprecated |
| `platformOnly` | boolean | Whether the permission is reserved for platform-level actors |
| `tenantGrantable` | boolean | Whether the permission can be granted in a tenant custom role |
| `delegableByTenantAdmin` | boolean | Whether a tenant admin is permitted to delegate this permission. Defined per permission in `definition.delegableByTenantAdmin`; never derived. |
| `contractVersion` | number | Permission contract version for staleness detection |

### Entry Fields

| Top-level field | Type | Description |
|---|---|---|
| `contractVersion` | number | Permission contract version |
| `groups` | PermissionGroup[] | Groups containing tenant-selectable catalog entries |
| `baseRoleDefaults` | object | Maps each tenant base role (`COMPANY_ADMIN`, `EMPLOYEE`) to its full inherited permission ID list. Built from the authoritative `BASE_ROLE_DEFAULTS` constant. Contains all inherited permissions, not only those visible in groups. |

### Usage Rules

- **Catalog metadata is authoritative.** The frontend must derive inherited permission IDs and tenant-selectability from the server-supplied `defaultBaseRoles` and `tenantGrantable` fields.
- **`groups` are the selectable tenant catalog.** They include only active, non-deprecated, non-platform-only, tenant-grantable, and delegable-by-tenant-admin permissions. Filtering group entries by `defaultBaseRoles` produces an incomplete inherited set because non-delegable permissions are excluded.
- **`baseRoleDefaults` is the complete inherited source.** Use `baseRoleDefaults["COMPANY_ADMIN"]` to obtain the full inherited permission set for a `COMPANY_ADMIN` actor, including non-delegable permissions.
- **Do not hardcode permission-to-role mappings.** All role-permission relationships must be derived from the catalog response.
- **Non-public entries are excluded from groups.** Only active, non-deprecated, non-platform-only, tenant-grantable, and delegable-by-tenant-admin permissions appear in `groups`.

## Current Actor Permissions (GET /permissions/me)

Returns the authenticated actor's database-backed effective authorization.

### Response Shape

```json
{
  "success": true,
  "data": {
    "permissions": ["documents:read", "users:read", "chat:read"],
    "grants": {
      "documents:read": { "source": "base-role", "scope": null },
      "users:read": { "source": "custom-role", "scope": { "selfOnly": false, "departmentIds": [], "documentCategories": [], "documentClassifications": [] } }
    },
    "baseRole": "COMPANY_ADMIN",
    "customRoleId": "abc123def456",
    "customRoleState": "active",
    "roleVersion": 3
  }
}
```

### Field Semantics

| Field | Type | Description |
|---|---|---|
| `permissions` | string[] | Effective permission identifiers the actor holds |
| `grants` | object | Map of permission ID to grant details: `source` (`"platform"`, `"base-role"`, or `"custom-role"`) and optional `scope` |
| `baseRole` | string | Actor's base role (`"SUPER_ADMIN"`, `"COMPANY_ADMIN"`, or `"EMPLOYEE"`) |
| `customRoleId` | string\|null | Assigned custom role ID, if any |
| `customRoleState` | string | State of the custom role: `"none"`, `"active"`, `"missing"`, `"archived"`, `"invalid"` |
| `roleVersion` | number\|null | Version of the resolved custom role |

### Usage Rules

- **`/permissions/me` represents only the current actor.** It must not be used as the source of inherited permissions for arbitrary roles.
- **`/permissions/me` is actor-only.** It returns the effective permissions, grants, and role state scoped to the authenticated actor. The response is tenant-specific and actor-specific.
- **Frontend action visibility is advisory.** The `can()` function in the frontend permission provider is a presentation and capability-discovery mechanism only.
- **Backend authorization remains authoritative.** The backend performs all permission checks server-side.
- **403 permission refresh must not automatically replay a mutation.** When a feature receives a 403, it should call `refreshPermissions()` and update action visibility without automatically retrying the mutation.

## Routes

| Method | Route | Required permission | Request | Success data |
| --- | --- | --- | --- | --- |
| `GET` | `/permissions` | authenticated actor | none | `{contractVersion,groups[],baseRoleDefaults{}}` where each group contains `{group,label,permissions[]}` and each permission includes `{id,label,description,compatibleScopes,defaultBaseRoles,active,deprecated,platformOnly,tenantGrantable,delegableByTenantAdmin,contractVersion}` and `baseRoleDefaults` maps each tenant base role to its full inherited permission ID list |
| `GET` | `/permissions/me` | authenticated actor | none | `{permissions[],grants{},baseRole,customRoleId,customRoleState,roleVersion}` — current database-backed effective permissions |
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
