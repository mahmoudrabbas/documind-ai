import { describe, expect, it } from "vitest";
import { getRoleHome, isStandardUserRole } from "../role-home";

describe("getRoleHome", () => {
  it("routes super admins to the platform overview", () =>
    expect(getRoleHome("SUPER_ADMIN")).toBe("/super-admin"));
  it("routes company admins to the System Overview dashboard", () =>
    expect(getRoleHome("COMPANY_ADMIN")).toBe("/dashboard"));
  it.each(["EMPLOYEE", "USER"])("routes %s to dashboard chat", (role) =>
    expect(getRoleHome(role)).toBe("/dashboard/chat"),
  );
});

describe("isStandardUserRole", () => {
  it("flags employee and legacy user roles", () => {
    expect(isStandardUserRole("EMPLOYEE")).toBe(true);
    expect(isStandardUserRole("USER")).toBe(true);
  });
  it("excludes tenant and platform admins", () => {
    expect(isStandardUserRole("COMPANY_ADMIN")).toBe(false);
    expect(isStandardUserRole("SUPER_ADMIN")).toBe(false);
  });
});
