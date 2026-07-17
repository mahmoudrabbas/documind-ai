import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { clearTimeout, setTimeout } from "node:timers";

const root = resolve(import.meta.dirname, "..");
const apiRoot = resolve(root, "api");
const require = createRequire(resolve(apiRoot, "package.json"));
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const billingModuleDir = resolve(apiRoot, "src", "modules", "billing").replace(/\\/g, "/");

function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return findTests(path);
      if (entry.isFile() && entry.name.endsWith(".test.ts")) {
        // Billing tests use vi.mock() which requires vitest, not node --test.
        const normalized = path.replace(/\\/g, "/");
        if (normalized.includes(billingModuleDir)) return [];
        return [path];
      }
      return [];
    })
    .sort();
}

const testEnvironment = {
  NODE_ENV: "test",
  REDIS_URL: "redis://127.0.0.1:6379/1",
  APP_FRONTEND_URL: "https://app.test.invalid",
  UPLOAD_DIR: ".test-uploads",
  JWT_SECRET: "test-only-jwt-secret-value-at-least-32-characters",
  JWT_REFRESH_SECRET: "test-only-refresh-secret-value-at-least-32-characters",
  EMAIL_VERIFICATION_JWT_SECRET:
    "test-only-verification-secret-at-least-32-characters",
  PASSWORD_RESET_JWT_SECRET:
    "test-only-password-reset-secret-at-least-32-characters",
  EMAIL_WEBHOOK_SECRET:
    "test-only-webhook-secret-at-least-32-characters",
};

const path = [
  resolve(apiRoot, "node_modules/.bin"),
  resolve(root, "node_modules/.bin"),
  process.env.PATH,
]
  .filter(Boolean)
  .join(delimiter);

function runTestFile(testFile, mongodbUri) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--test", testFile], {
      cwd: apiRoot,
      stdio: "inherit",
      env: { ...process.env, ...testEnvironment, MONGODB_URI: mongodbUri, PATH: path },
    });
    const timeout = setTimeout(() => {
      console.error(`API test timed out: ${testFile}`);
      child.kill("SIGTERM");
      resolveRun(1);
    }, Number(process.env.API_TEST_FILE_TIMEOUT_MS ?? 600_000));
    child.once("error", (error) => {
      clearTimeout(timeout);
      console.error(`Unable to run API test ${testFile}: ${error.message}`);
      resolveRun(1);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolveRun(code ?? 1);
    });
  });
}

const mongo = await MongoMemoryReplSet.create({
  binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
  replSet: { count: 1 },
  instanceOpts: [{ launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) }],
});
let exitCode = 0;
try {
  const mongodbUri = mongo.getUri(`documind-test-${randomUUID()}`);
  for (const testFile of findTests(resolve(apiRoot, "src"))) {
    const result = await runTestFile(testFile, mongodbUri);
    if (result !== 0) {
      exitCode = result;
      break;
    }
  }

  // Run billing tests with vitest (they use vi.mock() which is incompatible with node --test).
  if (exitCode === 0) {
    console.log("\n── Running billing tests with vitest ──\n");
    exitCode = await new Promise((resolveRun) => {
      const child = spawn("vitest", ["run"], {
        cwd: apiRoot,
        stdio: "inherit",
        env: { ...process.env, ...testEnvironment, MONGODB_URI: mongodbUri, PATH: path },
      });
      child.once("error", (error) => {
        console.error(`Unable to run vitest: ${error.message}`);
        resolveRun(1);
      });
      child.once("exit", (code) => resolveRun(code ?? 1));
    });
  }
} finally {
  await mongo.stop();
}
process.exitCode = exitCode;
