import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { delimiter, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apiRoot = resolve(root, "api");

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

const path = [
  resolve(apiRoot, "node_modules/.bin"),
  resolve(root, "node_modules/.bin"),
  process.env.PATH,
]
  .filter(Boolean)
  .join(delimiter);

for (const testFile of findTests(resolve(apiRoot, "src"))) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", testFile],
    {
      cwd: apiRoot,
      stdio: "inherit",
      env: { ...process.env, ...testEnvironment, PATH: path },
    },
  );

  if (result.error) {
    console.error(`Unable to start API test ${testFile}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
