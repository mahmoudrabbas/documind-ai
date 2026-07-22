import assert from "node:assert/strict";
import { test } from "node:test";
import type { PermissionEvaluator } from "../permissions/permissions.types.js";
import {
  DOCUMENT_ACTION_PERMISSION_MAP,
  PermissionEvaluatorDocumentCapabilityAdapter,
} from "./documentAccess.capability.js";
import { tenantAActor, tenantADocument } from "./documentAccess.fixtures.js";

test("permission adapter maps supported actions and preserves evaluator denial", async () => {
  const calls: string[] = [];
  const evaluator: PermissionEvaluator = {
    async evaluate(input) {
      calls.push(input.permission);
      return {
        allowed: false,
        permission: input.permission,
        source: null,
        scope: null,
        denialCode: "PERMISSION_REQUIRED",
        reason: "not granted",
        roleId: null,
        roleVersion: null,
      };
    },
    async resolve(actor) {
      return {
        permissions: new Set(),
        grants: new Map(),
        baseRole: actor.baseRole,
        customRoleId: null,
        roleVersion: null,
        customRoleState: "none",
      };
    },
    evict() {},
    evictAllForTenant() {},
  };
  const adapter = new PermissionEvaluatorDocumentCapabilityAdapter(evaluator);

  const decision = await adapter.evaluateCapability({
    actor: tenantAActor,
    resource: tenantADocument,
    action: "download",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "CAPABILITY_DENIED");
  assert.deepEqual(calls, ["documents:download"]);
  assert.equal(DOCUMENT_ACTION_PERMISSION_MAP.download, "documents:download");
});

test("permission adapter fails closed without inventing manage_access or use_in_ai permissions", async () => {
  let calls = 0;
  const evaluator = {
    async evaluate() {
      calls += 1;
      throw new Error("must not be called for unmapped actions");
    },
  } as unknown as PermissionEvaluator;
  const adapter = new PermissionEvaluatorDocumentCapabilityAdapter(evaluator);

  for (const action of ["manage_access", "use_in_ai"] as const) {
    const decision = await adapter.evaluateCapability({
      actor: tenantAActor,
      resource: tenantADocument,
      action,
    });
    assert.deepEqual(decision, {
      allowed: false,
      reason: "ACTION_UNMAPPED",
      permission: null,
    });
  }
  assert.equal(calls, 0);
});
