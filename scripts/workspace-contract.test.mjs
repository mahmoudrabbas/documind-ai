import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const workspaces = ["api", "app", "workers"];

test("root validation commands explicitly invoke every workspace", () => {
  for (const command of ["lint", "typecheck", "test", "build"]) {
    const script = rootPackage.scripts[command];
    assert.equal(typeof script, "string", `missing root ${command} script`);
    assert.match(script, /run-workspaces\.mjs/, `${command} does not use the mandatory orchestrator`);
    for (const workspace of workspaces) {
      assert.equal(typeof rootPackage.scripts[`${command}:${workspace}`], "string", `${command} omits ${workspace}`);
    }
  }
});

test("the orchestrator has a fixed all-workspace allowlist and propagates failures", () => {
  const source = readFileSync(new URL("./run-workspaces.mjs", import.meta.url), "utf8");
  assert.match(source, /\["api", "app", "workers"\]/);
  assert.match(source, /result\.status !== 0/);
  assert.match(source, /process\.exit\(result\.status/);
});

test("every workspace declares mandatory validation scripts", () => {
  for (const workspace of workspaces) {
    const manifest = JSON.parse(readFileSync(new URL(`../${workspace}/package.json`, import.meta.url), "utf8"));
    for (const command of ["lint", "typecheck", "test", "build"]) {
      assert.equal(typeof manifest.scripts?.[command], "string", `${workspace} is missing ${command}`);
    }
  }
});
