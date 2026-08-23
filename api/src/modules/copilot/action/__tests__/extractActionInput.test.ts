import test from "node:test";
import assert from "node:assert/strict";
import { extractRoleName, deterministicExtractToolInput } from "../extractActionInput.js";

test("extractRoleName", async (t) => {
  await t.test("extracts a quoted role name", () => {
    assert.equal(extractRoleName('create a role "HR Manager"'), "HR Manager");
  });

  await t.test("extracts a role named by keyword", () => {
    assert.equal(extractRoleName("create a role named HR Manager"), "HR Manager");
    assert.equal(extractRoleName("create a new role called Auditor"), "Auditor");
    assert.equal(extractRoleName("create role with name Payroll"), "Payroll");
  });

  await t.test("extracts a bare role phrase", () => {
    assert.equal(extractRoleName("role named Auditor"), "Auditor");
    assert.equal(extractRoleName("role called Payroll Admin"), "Payroll Admin");
  });

  await t.test("extracts Arabic role names", () => {
    assert.equal(extractRoleName("أنشئ دورًا باسم مدير الموارد البشرية"), "مدير الموارد البشرية");
    assert.equal(extractRoleName("أنشئ دور مدقق"), "مدقق");
    assert.equal(extractRoleName("إنشاء دور باسم مدير الحسابات"), "مدير الحسابات");
  });

  await t.test("returns null when no plausible name is present", () => {
    assert.equal(extractRoleName("create a role"), null);
    assert.equal(extractRoleName("Create a role"), null);
    assert.equal(extractRoleName("create role"), null);
    assert.equal(extractRoleName("hello there"), null);
  });
});

test("deterministicExtractToolInput: roles.create does NOT extract baseRole from utterance", () => {
  // The chip utterance "create a role" must not infer baseRole.
  const chip = deterministicExtractToolInput({
    toolName: "roles.create",
    utterance: "create a role",
  });
  assert.equal(chip.baseRole, undefined);

  // "create a role named Manager" — "Manager" is in ROLE_WORDS but should
  // NOT set baseRole because it's part of the role NAME, not a base-role
  // intent. The baseRole is always collected via the interactive draft's
  // enum question.
  const named = deterministicExtractToolInput({
    toolName: "roles.create",
    utterance: "create a role named Manager",
  });
  assert.equal(named.baseRole, undefined);
  assert.equal(named.name, "Manager");

  // Arabic variant should also not extract baseRole.
  const arabic = deterministicExtractToolInput({
    toolName: "roles.create",
    utterance: "أنشئ دورًا باسم مدير",
  });
  assert.equal(arabic.baseRole, undefined);
});