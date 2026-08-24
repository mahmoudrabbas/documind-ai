# Department document access backfill

The department access repair is tenant-scoped and additive. It scans only documents that already have:

- the explicitly supplied tenant ID;
- an active `departmentId` reference;
- an active document policy pointer; and
- a same-tenant active department, classification, and optional category taxonomy record.

The migration never deletes tenants, users, departments, documents, policy snapshots, or retrieval data. It preserves the active policy and creates the next immutable policy version with one missing department allow rule:

`discover`, `read`, `download`, and `use_in_ai`.

Run a dry-run first:

```text
npm --workspace api run migrate:policy:department-access -- --tenant-id=<TENANT_OBJECT_ID> --batch-size=50 --limit=500
```

Review the JSON report. Only run the write mode after reviewing the report:

```text
npm --workspace api run migrate:policy:department-access:apply -- --tenant-id=<TENANT_OBJECT_ID> --batch-size=50 --limit=500
```

Use `--after-id=<DOCUMENT_OBJECT_ID>` to resume a bounded run. The default mode is dry-run; `--apply` is the only write switch. If a source changes during the migration, the optimistic policy-pointer check returns a conflict and leaves the source unchanged. To stop or roll back operationally, stop issuing `--apply` and use Manage Access to publish a deliberate next policy version; do not delete database records.
