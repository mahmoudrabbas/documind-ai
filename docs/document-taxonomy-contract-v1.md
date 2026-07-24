# Document Taxonomy Backend Contract v1

## Scope

Issue 18 Phase 2 adds tenant-owned document categories, departments, and document classifications with backend persistence and CRUD/list APIs. It does not change existing document fields, migrate document strings, persist access policies, enforce document policies, update indexes/retrieval, emit taxonomy audit events, or add UI.

## Entities

All three entities contain a stable MongoDB ID, tenant ID, display name, canonical normalized name, optional description, `active | archived` status, optimistic version, creator/updater IDs, and timestamps.

Classifications additionally contain one stable sensitivity level:

- `internal`
- `restricted`
- `confidential`
- `highly_confidential`

Multiple classifications may share a level because names are tenant-facing identities while the level represents security sensitivity. No derived `isSensitive` flag is persisted.

## Tenant isolation and authorization

Tenant identity comes only from the authenticated JWT/server request context. Mutation and query payloads never accept `tenantId`. Every repository operation requires tenant ID and every ID lookup, update, archive, and restore includes it in the MongoDB predicate. Cross-tenant records therefore produce the same not-found result as absent records.

Routes require `company-settings:read` for list/read and `company-settings:update` for create/update/archive/restore. Services independently call the existing `authorizeTenantOperation`, which reloads the active actor and consumes the existing `PermissionEvaluator`. An employee holding only `documents:read` receives no taxonomy-management authority.

## Names, uniqueness, and indexes

Display names are trimmed and repeated Unicode whitespace collapses to one space. The uniqueness key applies the same transformation and lowercases the result without locale-dependent rules. Empty normalized names reject.

`(tenantId, normalizedName)` is unique independently in each taxonomy collection. The index includes archived rows, so an archived identity cannot be ambiguously recreated. The same name remains valid in another tenant.

Listings use `(tenantId, status, normalizedName, _id)` and sort by normalized name then ID. Classification also indexes `(tenantId, level, status)`. List endpoints are bounded to 100 rows.

## Lifecycle and concurrency

There is no hard delete. Archive preserves identity and excludes a record from active lists by default. Callers can request `active`, `archived`, or `all`. Restore is supported. Update/archive/restore require the current positive `version`; atomic tenant-and-version-scoped mutations increment it. Repeated archive, repeated restore, and stale versions return deterministic conflicts.

## API

The prefix is `/document-taxonomy`. Replace `{collection}` with `categories`, `departments`, or `classifications`.

- `GET /{collection}?page=1&pageSize=20&status=active&search=`
- `POST /{collection}` with `name`, optional `description`, and required classification `level`
- `GET /{collection}/:id`
- `PATCH /{collection}/:id` with `version` and at least one mutable field
- `POST /{collection}/:id/archive` with `version`
- `POST /{collection}/:id/restore` with `version`

Successful responses use `{ success: true, data }`. Single-record data uses `category`, `department`, or `classification`; lists use the plural key plus `{ page, pageSize, totalRecords, totalPages }`. DTOs omit tenant ID, normalized name, `_id`, and `__v`.

## Stable errors

- `TAXONOMY_VALIDATION_FAILED`
- `DOCUMENT_CATEGORY_DUPLICATE`
- `DEPARTMENT_DUPLICATE`
- `DOCUMENT_CLASSIFICATION_DUPLICATE`
- `TAXONOMY_RECORD_NOT_FOUND`
- `TAXONOMY_RECORD_ARCHIVED`
- `TAXONOMY_RECORD_ALREADY_ACTIVE`
- `TAXONOMY_VERSION_CONFLICT`
- `INVALID_CLASSIFICATION_LEVEL`
- existing `MALFORMED_OBJECT_ID` and `PERMISSION_REQUIRED`

Raw duplicate-key errors and cross-tenant existence are never returned.

## Current document limitation

Existing documents continue to store free-text category/department values and the existing fixed classification string. Phase 2 does not treat those values as taxonomy references and performs no seeding, migration, or backfill. Document references, policy persistence/enforcement, propagation/audit, and frontend management belong to later phases.
