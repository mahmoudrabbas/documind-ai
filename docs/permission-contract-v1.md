# Permission Contract v1

`PERMISSION_CONTRACT_VERSION` in `api/src/modules/permissions/permissions.catalog.ts` is the authoritative contract version. Permission identifiers are normalized lowercase strings and custom-role labels never participate in authorization.

## Principal and Grant Semantics

- `user.role` is the explicit persistent base role and is limited to `SUPER_ADMIN`, `COMPANY_ADMIN`, or `EMPLOYEE`.
- `customRoleId` is an optional additive permission bundle. Assigning it never changes `user.role`. It can be changed only through the dedicated, versioned role-assignment endpoints; legacy user invitation/update payloads reject it.
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

The reusable service guard maps unknown or deprecated identifiers to `INVALID_PERMISSION`, absent authority to `PERMISSION_REQUIRED`, and invalid, incomplete, or cross-tenant resource context to `SCOPE_MISMATCH`. Route middleware uses the repository's equivalent canonical error envelope. Deterministic services must invoke the guard again; middleware success alone is not authority for a write.

Resource context is not client authority. A service that evaluates a concrete user, department, or document must load that resource in the authenticated tenant and construct the context from the stored owner, department, category, and classification. ObjectId shape validation alone does not establish that a referenced department belongs to the tenant. The evaluator rejects a context with another tenant or malformed identifiers, and scoped dimensions fail closed when their required resource value is absent. The Issue 03 resource policies are responsible for loading concrete user/document records and are not implemented by the role API.

## Delegation

Delegation is checked against the actor's current database-backed effective grants on create, update, clone, assignment, and migration. The requested permission must be active, tenant-grantable, and marked delegable. A scoped actor grant may delegate only the same or a narrower scope: unrestricted requests cannot be derived from a constrained grant, every requested department/category/classification must be contained by the actor grant, and `selfOnly` cannot be removed. Crafted, hidden, deprecated, platform, cross-tenant, stale, archived, and scope-widening inputs fail closed. Route checks are repeated inside mutation services under the tenant role serialization lock.

Tenant custom roles cannot contribute to `SUPER_ADMIN`. A Super Admin always resolves platform defaults from the authoritative base role and ignores any corrupt persisted `customRoleId`.

## Freshness

Permission evaluation intentionally has no in-process TTL cache in v1. Every decision reads current user and role state, so role updates, archives, deletion, assignment/removal, base-role changes, and suspension are visible on the next evaluation across API instances. The compatibility `evict` methods are no-ops until a distributed, version-aware cache is introduced.

`InMemoryPermissionEvaluator` is a deterministic test adapter, not a production authorization source. Shared contract tests run the same base-role, role-state, catalog, scope, tenant, stale-assignment, and corrupt-data cases against it and `PermissionEvaluatorImpl`. Production additionally validates MongoDB role provenance against same-tenant users.
