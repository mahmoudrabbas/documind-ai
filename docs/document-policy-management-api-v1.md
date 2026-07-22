# Document policy management API v1

Phase 6 adds tenant control-plane APIs for immutable document policy management. Every route requires authentication, authenticated tenant scope, and coarse `documents:manage-access`; services repeat authorization from current database state. Company Admin can recover a same-tenant private policy without receiving document read/download/AI access. A delegated non-administrator additionally needs `manage_access` from the current active policy. Missing, cross-tenant, deleted, and unauthorized resources use hidden document 404 behavior.

## Routes

- `GET /documents/:id/access-policy`
- `GET /documents/:id/access-policy/history?limit=<1..100>&cursor=<version>`
- `GET /documents/:id/access-policy/assignments`
- `POST /documents/:id/access-policy/effective-access`
- `POST /documents/:id/access-policy/preview`
- `POST /documents/:id/access-policy/apply`
- `POST /documents/access-policy/batch/preview`
- `POST /documents/access-policy/batch/apply`

Apply routes require `Idempotency-Key` with 1–128 safe characters. Same scoped key and request fingerprint replays the original result; a different request conflicts. Idempotency, immutable snapshot insertion, pointer CAS, and `policyChangedAt` commit in one transaction. Policy family identity is retained and the next version is exactly current version plus one. Old snapshots are never edited or deleted. Semantic no-change creates no version and leaves file `version`/`versionLabel` untouched.

Drafts contain only `rules`, optional `inherits`, optional effective timestamps, and an optional 500-character reason. Authoritative tenant/document/policy/taxonomy/provenance fields are rejected. Policies accept at most 200 rules and use existing independent actions without implication. References are active and tenant-scoped; inheritance is exact, acyclic, same-family, effective, and bounded to depth 10.

Example placeholders:

```http
POST /documents/<document-id>/access-policy/preview
Content-Type: application/json

{"expectedPolicyId":"<policy-id>","expectedPolicyVersion":1,"draft":{"rules":[{"ruleId":"owner-read","effect":"allow","subject":{"type":"owner"},"actions":["discover","read"]}],"reason":"<change-reason>"}}
```

```http
POST /documents/<document-id>/access-policy/apply
Idempotency-Key: <unique-operation-key>
Content-Type: application/json

{"previewToken":"<server-preview-token>","draft":{"rules":[{"ruleId":"owner-read","effect":"allow","subject":{"type":"owner"},"actions":["discover","read"]}]},"confirmSensitiveBroadening":true}
```

Policy activation immediately affects Phase 5 synchronous access. It does not claim propagation to chunks, indexes, retrieval, or citations. No public destructive history mutation, frontend editor, notification, or audit worker is included.
