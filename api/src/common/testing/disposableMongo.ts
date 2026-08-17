type MongoConnectionView = {
  readonly readyState: number;
  readonly name?: string;
  readonly db?: { readonly databaseName: string };
};

type MongoClientView = {
  readonly connection: MongoConnectionView;
  connect(uri: string, options: { dbName: string }): Promise<unknown>;
};

const DISPOSABLE_DATABASE_PATTERN = /(?:^|[-_])test(?:[-_]|$)/i;

export function assertDisposableMongoDatabaseName(databaseName: string): void {
  if (!DISPOSABLE_DATABASE_PATTERN.test(databaseName.trim())) {
    throw new Error(
      `Refusing destructive test database access to "${databaseName || "<none>"}". ` +
        `Use an explicit disposable database name with a standalone "test" marker.`,
    );
  }
}

export function assertDisposableMongoConnection(
  connection: MongoConnectionView,
  expectedDatabaseName?: string,
): void {
  if (connection.readyState !== 1) {
    throw new Error("MongoDB is not connected to a disposable test database.");
  }

  const actualDatabaseName = connection.db?.databaseName ?? connection.name ?? "";
  assertDisposableMongoDatabaseName(actualDatabaseName);

  if (expectedDatabaseName && actualDatabaseName !== expectedDatabaseName) {
    throw new Error(
      `Expected disposable database "${expectedDatabaseName}" but connected to "${actualDatabaseName}".`,
    );
  }
}

export async function connectToDisposableMongoDatabase(
  mongoClient: MongoClientView,
  uri: string,
  databaseName: string,
): Promise<void> {
  assertDisposableMongoDatabaseName(databaseName);
  await mongoClient.connect(uri, { dbName: databaseName });
  assertDisposableMongoConnection(mongoClient.connection, databaseName);
}
