# Permission Contract v1

`PERMISSION_CONTRACT_VERSION` in `api/src/modules/permissions/permissions.catalog.ts` is the authoritative contract version. Permission identifiers are normalized lowercase strings and custom-role labels never participate in authorization.

## Principal and Grant Semantics

- `user.role` is the explicit persistent base role and is limited to `SUPER_ADMIN`, `COMPANY_ADMIN`, or `EMPLOYEE`.
- `customRoleId` is an optional additive permission bundle. Assigning it never changes `user.role`.
- `Role.baseRole` is only an assignment constraint. It grants nothing, and assignment is valid only when it exactly equals the user's persistent `user.role`.
- Changing `Role.baseRole` while any user is assigned is rejected; Phase 1 does not migrate user base roles through role editing.
- Base-role defaults are unrestricted inherited grants. A custom role cannot narrow or deny an inherited default.
- An active, fully migrated custom role adds only its explicit permissions. Missing migration state, archived, missing, cross-tenant, unknown, deprecated, and non-tenant-grantable grants never authorize access.
- Roles persist canonical `grants[]` entries containing one permission and that permission's optional scopes. The legacy role-wide `permissions` and `scopes` fields are never authorization sources.
- Tenant administrators may grant only permissions marked `delegableByTenantAdmin`; effective Company Admin access does not imply delegability.
- An unrestricted inherited grant takes precedence over a scoped custom grant for the same permission.

## Scope Semantics

Scopes apply only to explicit custom grants. Absent `scopes` means unrestricted. Empty dimensions are unconstrained and a scope object with no constraints is normalized away. Values are trimmed, deduplicated, sorted, and categories/classifications are case-normalized.

Configured dimensions are conjunctive: self, department, category, and classification must all match. Values inside one array are alternatives. `selfOnly` matches when `resource.ownerId` equals the actor ID. A constrained grant without resource context returns `RESOURCE_CONTEXT_REQUIRED`; a supplied nonmatching context returns `SCOPE_MISMATCH`.

The resource tenant must equal the actor tenant before scope attributes are considered. This prevents cross-tenant resource contexts from matching even when referenced IDs or labels coincide. Ownership and tenant validation for concrete department/document records remains the Issue 03 resource-policy responsibility.

Duplicate scoped grants for one permission are rejected because combining them could broaden Cartesian scope combinations. If an unrestricted duplicate is present, it deterministically dominates and the result is one unrestricted grant. OR applies within one populated scope dimension and AND applies across populated dimensions.

## Persisted Data Defense

Every custom role is revalidated during evaluation. Its contract version, base-role eligibility, active/complete migration state, grant normalization, catalog status, tenant grantability, delegability, and scope compatibility must all be valid. Any failure ignores the complete custom-role contribution, emits a safe structured diagnostic, and returns `INVALID_ROLE` internally without affecting inherited `User.role` defaults.

The production catalog contains only documented product permissions. Deprecated and malformed migration identifiers exist only as raw migration/test fixtures. Tenant `GET /permissions` returns only the versioned `{id,label,description}` role-editor DTO for tenant-grantable permissions and does not expose default-calculation or security-policy metadata.

Legacy `USER` records are converted to the approved `EMPLOYEE` role with `permissionBaseline: "legacy-none"`, no custom role, and a completed session-revocation checkpoint. This compatibility baseline deliberately resolves no inherited or custom grants, preserving the complete pre-migration effective set until an administrator performs a separately authorized access assignment.

While that checkpoint is incomplete, authoritative database state blocks login session issuance and refresh rotation with `AUTH_SESSION_MIGRATION_PENDING`. Migration completion transactionally proves that no tenant-and-user-scoped refresh record with null or missing `revokedAt` remains active.

`allowScoped` attaches a typed `permissionAuthorization` context containing the permission, tenant, actor, source, exact permission-specific scopes, role ID/version, and `resourceContextRequired`. Downstream resource policy must evaluate those constraints before accessing a resource; a boolean scoped marker is never authorization.

## Denial Precedence

Evaluation is deterministic in this order:

1. Unknown permission.
2. Deprecated permission.
3. Cross-tenant resource context.
4. Missing or archived assigned role when no inherited grant exists.
5. Permission not granted.
6. Required resource context absent.
7. Scope mismatch.

The decision includes the effective source, applicable scope, stable denial code/reason, custom role ID, and role version. Disabled or missing users resolve no grants.

## Freshness

Permission evaluation intentionally has no in-process TTL cache in v1. Every decision reads current user and role state, so role updates, archives, deletion, assignment/removal, base-role changes, and suspension are visible on the next evaluation across API instances. The compatibility `evict` methods are no-ops until a distributed, version-aware cache is introduced.
