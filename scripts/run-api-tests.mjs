import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { delimiter, resolve, sep, normalize } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apiRoot = resolve(root, "api");

/** Tests under src/modules/billing/ use vitest (vi.mock, vi.hoisted) and must run via vitest, not node:test */
function isVitestTest(filePath) {
  return normalize(filePath).split(sep).includes("billing");
}

function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return findTests(path);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
    })
    .sort();
}

const testEnvironment = {
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test",
  REDIS_URL: "redis://127.0.0.1:6379/1",
  APP_FRONTEND_URL: "https://app.test.invalid",
  UPLOAD_DIR: ".test-uploads",
  JWT_SECRET: "test-only-jwt-secret-value-at-least-32-characters",
  JWT_REFRESH_SECRET: "test-only-refresh-secret-value-at-least-32-characters",
  EMAIL_VERIFICATION_JWT_SECRET:
    "test-only-verification-secret-at-least-32-characters",
  PASSWORD_RESET_JWT_SECRET:
    "test-only-password-reset-secret-at-least-32-characters",
};

const pathEntries = [
  resolve(apiRoot, "node_modules/.bin"),
  resolve(root, "node_modules/.bin"),
  process.env.PATH,
]
  .filter(Boolean)
  .join(delimiter);

const vitestFiles = [];
let hasFailure = false;

for (const testFile of findTests(resolve(apiRoot, "src"))) {
  if (isVitestTest(testFile)) {
    vitestFiles.push(testFile);
    continue;
  }

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", testFile],
    {
      cwd: apiRoot,
      stdio: "inherit",
      env: { ...process.env, ...testEnvironment, PATH: pathEntries },
    },
  );

  if (result.error) {
    console.error(`Unable to start API test ${testFile}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    hasFailure = true;
    break;
  }
}

if (hasFailure) process.exit(1);

/* ── Vitest-based billing tests ─────────────────────────────────────── */
if (vitestFiles.length > 0) {
  console.log(`\n── Running ${vitestFiles.length} vitest-based billing test(s) ──\n`);
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config", resolve(apiRoot, "vitest.config.ts"),
      "--reporter", "tap",
      ...vitestFiles,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...testEnvironment, PATH: pathEntries },
    },
  );

  if (result.error) {
    console.error(`Unable to start vitest: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error("Vitest-based billing tests failed.");
    process.exit(result.status ?? 1);
  }
}
