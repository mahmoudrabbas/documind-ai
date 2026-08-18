import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDisposableMongoConnection,
  assertDisposableMongoDatabaseName,
  connectToDisposableMongoDatabase,
} from "./disposableMongo.js";

test("accepts database names with a standalone test marker", () => {
  for (const name of [
    "test",
    "chat-production-workflow-e2e-test",
    "billing_test_database",
    "test-notification-outbox",
  ]) {
    assert.doesNotThrow(() => assertDisposableMongoDatabaseName(name));
  }
});

test("rejects missing and live database names", () => {
  for (const name of ["", "docsai", "prod", "production", "contest", "latest"] as const) {
    assert.throws(
      () => assertDisposableMongoDatabaseName(name),
      /refusing destructive test database access/i,
    );
  }
});

test("rejects disconnected and unexpected MongoDB connections", () => {
  assert.throws(
    () =>
      assertDisposableMongoConnection(
        { readyState: 0, name: undefined, db: undefined },
        "workflow-test",
      ),
    /not connected/i,
  );

  assert.throws(
    () =>
      assertDisposableMongoConnection(
        { readyState: 1, name: "docsai", db: { databaseName: "docsai" } },
        "workflow-test",
      ),
    /refusing destructive test database access/i,
  );

  assert.throws(
    () =>
      assertDisposableMongoConnection(
        { readyState: 1, name: "other-test", db: { databaseName: "other-test" } },
        "workflow-test",
      ),
    /expected.*workflow-test.*connected.*other-test/i,
  );
});

test("connects with an explicit database override and verifies the result", async () => {
  const calls: Array<{ uri: string; options: { dbName?: string } }> = [];
  const fakeMongoose = {
    connection: {
      readyState: 0,
      name: undefined as string | undefined,
      db: undefined as { databaseName: string } | undefined,
    },
    async connect(uri: string, options: { dbName?: string }) {
      calls.push({ uri, options });
      this.connection.readyState = 1;
      this.connection.name = options.dbName;
      this.connection.db = options.dbName
        ? { databaseName: options.dbName }
        : undefined;
      return this;
    },
  };

  await connectToDisposableMongoDatabase(
    fakeMongoose,
    "mongodb://127.0.0.1:27017/docsai",
    "workflow-test",
  );

  assert.deepEqual(calls, [
    {
      uri: "mongodb://127.0.0.1:27017/docsai",
      options: { dbName: "workflow-test" },
    },
  ]);
});

test("rejects an unsafe database name before attempting to connect", async () => {
  let connected = false;
  const fakeMongoose = {
    connection: { readyState: 0, name: undefined, db: undefined },
    async connect() {
      connected = true;
      return this;
    },
  };

  await assert.rejects(
    connectToDisposableMongoDatabase(
      fakeMongoose,
      "mongodb://127.0.0.1:27017/docsai",
      "docsai",
    ),
    /refusing destructive test database access/i,
  );
  assert.equal(connected, false);
});
