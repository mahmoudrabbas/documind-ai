# Document Taxonomy UI v1

Issue 18 Phase 8 adds `/dashboard/settings/document-taxonomy` under the tenant Settings area. The page reuses the dashboard shell and existing `company-settings:read` / `company-settings:update` coarse permission helpers. Backend tenant scoping and authorization remain authoritative for direct route and mutation requests.

Categories, departments, and classifications share a bounded, server-paginated manager with backend search and active/archived/all status filters. Authorized users can create, edit, archive, and restore; there is no hard delete. Mutations send the current entity version for optimistic concurrency, refresh the active query after success, validate blank/oversized names, and present normalized-name/archived-name conflicts without raw database errors.

Classifications are limited to `internal`, `restricted`, `confidential`, and `highly_confidential`. The reusable classification badge supplies translated text and a distinct icon in addition to color, supports the existing light/dark tokens and RTL/LTR logical spacing, and explicitly says that sensitivity does not imply effective access.

The document list and detail drawer display safe list metadata already returned by the authorized document API. They do not fetch all rows for client filtering, infer access from classification, or treat a company administrator’s control-plane authority as document visibility. New-upload guidance states the backend Phase 5 default: Restricted/private with owner discover/read/download only, followed by explicit policy management for broader access.

Loading, empty, error, denied, retry, archive/restore confirmation, responsive overflow, labels, table headers, keyboard-close behavior, and focus return are included. Preview tokens and policy drafts are unrelated to taxonomy storage and are never persisted by this UI.

This page implements taxonomy management only. It does not add retrieval, citations, policy semantics, backend routes, worker behavior, or any Issue 19 scope.
