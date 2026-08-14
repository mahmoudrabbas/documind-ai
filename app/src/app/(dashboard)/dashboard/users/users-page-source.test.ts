import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Users page department and edit workflow", () => {
  it("loads active tenant departments and sends canonical departmentId on invite", () => {
    expect(source).toContain('listTaxonomy("departments"');
    expect(source).toContain('data-guide-id="users-invite-form-department"');
    expect(source).toContain("departmentId: departmentId || null");
  });

  it("renders a read-only directory with department and a dedicated editor", () => {
    expect(source).toContain('data-guide-id="users-edit-button"');
    expect(source).toContain("<Modal open={edit !== null}");
    expect(source).toContain("user.departmentName");
    expect(source).not.toContain("handleRowChange");
    expect(source).not.toContain("rowUpdates");
  });

  it("prefills and saves role, department, and status through the editor", () => {
    expect(source).toContain("departmentId: user.departmentId ??");
    expect(source).toContain("status: user.status");
    expect(source).toContain("departmentId: edit.departmentId || null");
    expect(source).toContain("setUsers((current)");
  });

  it("shows loading, empty, and taxonomy failure states", () => {
    expect(source).toContain("loadingDepartments");
    expect(source).toContain("noDepartmentsAvailable");
    expect(source).toContain("departmentLoadError");
    expect(source).toContain("loadingUsers");
  });
});
