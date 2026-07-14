import { spawnSync } from "node:child_process";
import { delimiter, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appRoot = resolve(root, "app");
const path = [
  resolve(appRoot, "node_modules/.bin"),
  resolve(root, "node_modules/.bin"),
  process.env.PATH,
]
  .filter(Boolean)
  .join(delimiter);

const result = spawnSync("next", ["build"], {
  cwd: appRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    PATH: path,
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.invalid",
  },
});

if (result.error) {
  console.error(`Unable to start app validation build: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
