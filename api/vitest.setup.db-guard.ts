/**
 * Global vitest guard: several test files wipe whole collections via
 * deleteMany({}). Redirect any non-"test" MONGODB_URI to a sibling
 * "<name>-test" database before test files load, so persistence suites can
 * never touch a real database. Set ALLOW_DESTRUCTIVE_APP_TESTS=true only to
 * opt out of the redirect when the URI already points at a disposable DB.
 */
const uri = process.env.MONGODB_URI ?? "";
if (uri) {
  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\//, "");
    if (dbName && !/test/i.test(dbName)) {
      parsed.pathname = `/${dbName}-test`;
      process.env.MONGODB_URI = parsed.toString();
      console.warn(
        `[vitest db-guard] MONGODB_URI database "${dbName}" does not contain "test"; tests will use "${dbName}-test" instead.`,
      );
    }
  } catch {
    throw new Error(
      `[vitest db-guard] MONGODB_URI is not a parseable URL; refusing to run destructive tests. URI: ${uri}`,
    );
  }
}

export {};
