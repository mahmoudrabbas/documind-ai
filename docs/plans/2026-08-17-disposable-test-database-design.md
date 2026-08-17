# Disposable Test Database Safety Design

## Problem

Some persistence tests connect directly to the database embedded in `MONGODB_URI`. Those tests also delete records during setup and teardown. If the environment URI points at `docsai`, the cleanup runs against live data.

## Design

Introduce a shared test-only MongoDB safety helper. The helper validates that the requested database name is explicitly marked as disposable, connects with an explicit `dbName` override, and verifies the actual connected database before destructive cleanup runs.

The guard is fail-closed. It has no environment-variable bypass. Missing names and live-looking names such as `docsai`, `production`, and `prod` are rejected. Test files use dedicated names containing a standalone `test` segment.

Update every persistence test currently calling `mongoose.connect(process.env.MONGODB_URI)` without `dbName`. Each cleanup hook calls the connected-database assertion immediately before any `deleteMany` operation.

The Vitest configuration must not replace a database URI supplied by the official API test runner. The runner provisions a disposable replica set required by transaction tests, so Vitest inherits that URI instead of forcing a persistent localhost database.

## Testing

Unit tests cover accepted disposable names, rejected live names, connection-name mismatches, and disconnected state. The affected integration tests then run through `scripts/run-api-tests.mjs`, which supplies a MongoDB memory-server URI. No verification command may use the repository's live `MONGODB_URI`.
