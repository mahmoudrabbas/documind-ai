import test from "node:test";
import assert from "node:assert/strict";
import {
  grantsNeedScope,
  grantsSummary,
  isUnrestrictedAnswer,
  mergeGrants,
  parseGrantsUtterance,
  pendingScopeGrant,
  resolveScopeFromText,
  stripPermissionKeywords,
  type ScopeOptionSet,
} from "../roleGrantsParser.js";

const EMPTY_TENANT = "000000000000000000000000";

const OPTIONS: ScopeOptionSet = {
  departments: [
    { id: "5f0000000000000000000001", name: "Finance", normalizedName: "finance" },
    { id: "5f0000000000000000000002", name: "Engineering", normalizedName: "engineering" },
  ],
  categories: [
    { name: "Contracts", normalizedName: "contracts" },
    { name: "Invoices", normalizedName: "invoices" },
  ],
  classifications: [
    { name: "Confidential", normalizedName: "confidential" },
    { name: "Public", normalizedName: "public" },
  ],
};

test("parseGrantsUtterance", async (t) => {
  await t.test("recognizes done phrases and yields no grants", async () => {
    for (const phrase of ["that's all", "none", "done", "all set", "لا شيء", "انتهيت", "لا"]) {
      const result = await parseGrantsUtterance({ text: phrase, tenantId: EMPTY_TENANT });
      assert.equal(result.done, true, phrase);
      assert.deepEqual(result.grants, []);
    }
  });

  await t.test("parses a plain permission list as unrestricted grants", async () => {
    const result = await parseGrantsUtterance({
      text: "view users and edit documents",
      tenantId: EMPTY_TENANT,
      options: OPTIONS,
    });
    assert.equal(result.done, false);
    assert.deepEqual(result.rejected, []);
    assert.deepEqual(result.grants, [
      { permission: "users:read" },
      { permission: "documents:update" },
    ]);
  });

  await t.test("binds scope words to the preceding permission only", async () => {
    const result = await parseGrantsUtterance({
      text: "view users, edit documents in the Finance department, view analytics",
      tenantId: EMPTY_TENANT,
      options: OPTIONS,
    });
    assert.deepEqual(result.grants, [
      { permission: "users:read" },
      {
        permission: "documents:update",
        scopes: { selfOnly: false, departmentIds: ["5f0000000000000000000001"], documentCategories: [], documentClassifications: [] },
      },
      { permission: "analytics:read" },
    ]);
  });

  await t.test("binds selfOnly and taxonomy scopes", async () => {
    const result = await parseGrantsUtterance({
      text: "edit documents for only their own data, download documents that are Confidential and Contracts",
      tenantId: EMPTY_TENANT,
      options: OPTIONS,
    });
    const byPermission = new Map(result.grants.map((grant) => [grant.permission, grant]));
    assert.deepEqual(byPermission.get("documents:update")!.scopes, {
      selfOnly: true,
      departmentIds: [],
      documentCategories: [],
      documentClassifications: [],
    });
    assert.deepEqual(byPermission.get("documents:download")!.scopes, {
      selfOnly: false,
      departmentIds: [],
      documentCategories: ["contracts"],
      documentClassifications: ["confidential"],
    });
  });

  await t.test("explicit \"everything\" yields an unrestricted grant and flags it", async () => {
    const result = await parseGrantsUtterance({
      text: "edit documents, everything",
      tenantId: EMPTY_TENANT,
      options: OPTIONS,
    });
    assert.deepEqual(result.grants, [{ permission: "documents:update" }]);
    assert.deepEqual(result.unrestrictedPermissions, ["documents:update"]);
  });

  await t.test("rejects non-delegable phrases with a hint, keeps the rest", async () => {
    const result = await parseGrantsUtterance({
      text: "view users and delete users",
      tenantId: EMPTY_TENANT,
      options: OPTIONS,
    });
    assert.deepEqual(result.grants, [{ permission: "users:read" }]);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].permission, "users:delete");
    assert.equal(result.rejected[0].label, "Remove Users");
  });

  await t.test("returns nothing for garbage text (soft retry signal)", async () => {
    const result = await parseGrantsUtterance({ text: "hello there", tenantId: EMPTY_TENANT });
    assert.equal(result.done, false);
    assert.deepEqual(result.grants, []);
    assert.deepEqual(result.rejected, []);
  });

  await t.test("parses Arabic permissions", async () => {
    const result = await parseGrantsUtterance({
      text: "عرض المستخدمين ورفع المستندات",
      tenantId: EMPTY_TENANT,
      options: OPTIONS,
    });
    assert.deepEqual(result.grants, [
      { permission: "users:read" },
      { permission: "documents:create" },
    ]);
  });

  await t.test("dedupes repeated mentions of the same permission", async () => {
    const result = await parseGrantsUtterance({
      text: "view users, view users and view roles",
      tenantId: EMPTY_TENANT,
      options: OPTIONS,
    });
    assert.equal(
      result.grants.filter((grant) => grant.permission === "users:read").length,
      1,
    );
    assert.equal(result.grants.length, 2);
  });
});

test("resolveScopeFromText", async (t) => {
  await t.test("resolves selfOnly and taxonomy mentions", () => {
    assert.deepEqual(
      resolveScopeFromText({ text: "only their own data", options: OPTIONS }),
      { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] },
    );
    assert.deepEqual(
      resolveScopeFromText({ text: "in the Finance department", options: OPTIONS }),
      { selfOnly: false, departmentIds: ["5f0000000000000000000001"], documentCategories: [], documentClassifications: [] },
    );
  });

  await t.test("returns undefined when nothing resolvable is mentioned", () => {
    assert.equal(resolveScopeFromText({ text: "not sure", options: OPTIONS }), undefined);
  });
});

test("isUnrestrictedAnswer", async (t) => {
  await t.test("recognizes unrestricted phrases", () => {
    assert.equal(isUnrestrictedAnswer("everything"), true);
    assert.equal(isUnrestrictedAnswer("full access to everything"), true);
    assert.equal(isUnrestrictedAnswer("كل شيء"), true);
    assert.equal(isUnrestrictedAnswer("their own data"), false);
  });
});

test("mergeGrants", async (t) => {
  await t.test("merges and sorts by permission id", () => {
    const merged = mergeGrants(
      [{ permission: "users:read" }],
      [{ permission: "documents:read" }, { permission: "users:read", scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } }],
    );
    assert.deepEqual(merged, [
      { permission: "documents:read" },
      { permission: "users:read", scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } },
    ]);
  });

  await t.test("a later unrestricted mention clears a restricted scope", () => {
    const merged = mergeGrants(
      [{ permission: "documents:read", scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } }],
      [{ permission: "documents:read" }],
    );
    assert.deepEqual(merged, [{ permission: "documents:read" }]);
  });

  await t.test("a scoped refinement attaches to an unrestricted grant", () => {
    const merged = mergeGrants(
      [{ permission: "documents:update" }],
      [{ permission: "documents:update", scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } }],
    );
    assert.deepEqual(merged, [
      { permission: "documents:update", scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } },
    ]);
  });

  await t.test("combines scopes of the same permission across turns", () => {
    const merged = mergeGrants(
      [{ permission: "documents:update", scopes: { selfOnly: false, departmentIds: ["5f0000000000000000000001"], documentCategories: [], documentClassifications: [] } }],
      [{ permission: "documents:update", scopes: { selfOnly: false, departmentIds: [], documentCategories: ["contracts"], documentClassifications: [] } }],
    );
    assert.deepEqual(merged[0].scopes, {
      selfOnly: false,
      departmentIds: ["5f0000000000000000000001"],
      documentCategories: ["contracts"],
      documentClassifications: [],
    });
  });
});

test("grantsNeedScope and pendingScopeGrant", async (t) => {
  await t.test("scoped grants never need more refinement", () => {
    assert.equal(
      grantsNeedScope({ permission: "documents:update", scopes: { selfOnly: false, departmentIds: [], documentCategories: [], documentClassifications: [] } }),
      false,
    );
  });

  await t.test("unscoped grants need a scope only when the permission supports one", () => {
    assert.equal(grantsNeedScope({ permission: "documents:update" }), true);
    assert.equal(grantsNeedScope({ permission: "users:read" }), true);
    assert.equal(grantsNeedScope({ permission: "roles:read" }), false);
  });

  await t.test("pendingScopeGrant returns the first unscoped grant in catalog order", () => {
    const pending = pendingScopeGrant([
      { permission: "chat:read" },
      { permission: "documents:update" },
    ]);
    assert.equal(pending!.permission, "chat:read");
    assert.equal(pendingScopeGrant([{ permission: "roles:read" }]), null);
  });

  await t.test("pendingScopeGrant skips permissions whose scope was resolved", () => {
    const grants: { permission: "documents:update" }[] = [{ permission: "documents:update" }];
    assert.equal(
      pendingScopeGrant(grants, new Set(["documents:update"])),
      null,
    );
    assert.equal(
      pendingScopeGrant(
        [{ permission: "chat:read" }, { permission: "documents:update" }],
        new Set(["documents:update"]),
      )!.permission,
      "chat:read",
    );
  });
});

test("stripPermissionKeywords", async (t) => {
  await t.test("removes permission phrases and keeps scope words", () => {
    assert.equal(stripPermissionKeywords("all analytics"), "all");
    assert.equal(
      stripPermissionKeywords("everything for view users"),
      "everything for",
    );
    assert.equal(
      stripPermissionKeywords("in the finance department for view users"),
      "in the finance department for",
    );
    assert.equal(stripPermissionKeywords("nothing here"), "nothing here");
  });
});

test("grantsSummary", async (t) => {
  await t.test("summarizes grants for the transcript", () => {
    assert.equal(grantsSummary([]), "none");
    assert.equal(grantsSummary([{ permission: "users:read" }]), "View Users");
    const summary = grantsSummary([
      {
        permission: "documents:update",
        scopes: { selfOnly: true, departmentIds: ["a"], documentCategories: ["contracts"], documentClassifications: [] },
      },
    ]);
    assert.match(summary, /their own data/);
    assert.match(summary, /1 department\(s\)/);
    assert.match(summary, /1 category\/categories/);
  });
});