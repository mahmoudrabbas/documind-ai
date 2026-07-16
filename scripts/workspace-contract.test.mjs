import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const rootPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const workspaces = ["workers", "api", "app"];
const orchestrator = new URL("./run-workspaces.mjs", import.meta.url);

function createWorkspaceFixture() {
  const root = mkdtempSync(join(tmpdir(), "documind-workspace-contract-"));
  for (const workspace of workspaces) mkdirSync(join(root, workspace), { recursive: true });
  return root;
}

function writeWorkspaceManifest(root, workspace, scripts) {
  writeFileSync(
    join(root, workspace, "package.json"),
    JSON.stringify({ name: workspace, scripts }, null, 2),
    "utf8",
  );
}

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
  assert.match(source, /\["workers", "api", "app"\]/);
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

test("the orchestrator behaviorally executes every workspace script", () => {
  const root = createWorkspaceFixture();
  const logPath = join(root, "workspace-order.txt");
  try {
    for (const workspace of workspaces) {
      writeWorkspaceManifest(root, workspace, {
        build: `${process.execPath} -e 'require("node:fs").appendFileSync(process.argv[1], process.argv[2] + "\\n")' ${JSON.stringify(logPath)} ${JSON.stringify(workspace)}`,
      });
    }

    const result = spawnSync(process.execPath, [orchestrator.pathname, "build"], {
      cwd: root,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.equal(readFileSync(logPath, "utf8"), "workers\napi\napp\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the orchestrator behaviorally fails on missing scripts and non-zero exits", () => {
  const missingScriptRoot = createWorkspaceFixture();
  try {
    writeWorkspaceManifest(missingScriptRoot, "api", { typecheck: `${process.execPath} -e "process.exit(0)"` });
    writeWorkspaceManifest(missingScriptRoot, "app", {});
    writeWorkspaceManifest(missingScriptRoot, "workers", { typecheck: `${process.execPath} -e "process.exit(0)"` });

    const result = spawnSync(process.execPath, [orchestrator.pathname, "typecheck"], {
      cwd: missingScriptRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
  } finally {
    rmSync(missingScriptRoot, { recursive: true, force: true });
  }

  const failingRoot = createWorkspaceFixture();
  try {
    writeWorkspaceManifest(failingRoot, "api", { typecheck: `${process.execPath} -e "process.exit(0)"` });
    writeWorkspaceManifest(failingRoot, "app", { typecheck: `${process.execPath} -e "process.exit(7)"` });
    writeWorkspaceManifest(failingRoot, "workers", { typecheck: `${process.execPath} -e "process.exit(0)"` });

    const result = spawnSync(process.execPath, [orchestrator.pathname, "typecheck"], {
      cwd: failingRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 7);
  } finally {
    rmSync(failingRoot, { recursive: true, force: true });
  }
});
