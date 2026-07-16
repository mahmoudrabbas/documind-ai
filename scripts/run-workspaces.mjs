import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const command = process.argv[2];
const allowedCommands = new Set(["lint", "typecheck", "test", "build"]);
const workspaces = ["workers", "api", "app"];

if (!allowedCommands.has(command)) {
  console.error("Usage: node scripts/run-workspaces.mjs <lint|typecheck|test|build>");
  process.exit(2);
}

const root = process.cwd();

function run(label, script, cwd = root) {
  const started = performance.now();
  console.log(`\n[workspace-validation] ${label}: starting`);
  const path = [resolve(cwd, "node_modules/.bin"), resolve(root, "node_modules/.bin"), process.env.PATH].filter(Boolean).join(delimiter);
  const result = spawnSync("/bin/sh", ["-c", script], { cwd, stdio: "inherit", env: { ...process.env, PATH: path } });
  const durationMs = Math.round(performance.now() - started);
  if (result.error) {
    console.error(`[workspace-validation] ${label}: failed to start (${result.error.code ?? "unknown"}) duration_ms=${durationMs}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[workspace-validation] ${label}: failed exit_code=${result.status ?? 1} duration_ms=${durationMs}`);
    process.exit(result.status ?? 1);
  }
  console.log(`[workspace-validation] ${label}: passed duration_ms=${durationMs}`);
}

if (command === "lint") run("root", "eslint . --ignore-pattern api --ignore-pattern app --ignore-pattern workers");
if (command === "test") run("repository-security", "node --test scripts/*.test.mjs");
for (const workspace of workspaces) {
  const cwd = resolve(root, workspace);
  const manifest = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
  const script = manifest.scripts?.[command];
  if (typeof script !== "string") {
    console.error(`[workspace-validation] ${workspace}: missing ${command} script`);
    process.exit(1);
  }
  run(workspace, script, cwd);
}
