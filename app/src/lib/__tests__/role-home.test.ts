import { describe, expect, it } from "vitest";
import { getRoleHome } from "../role-home";

describe("getRoleHome", () => {
  it("routes super admins to tenant management", () =>
    expect(getRoleHome("SUPER_ADMIN")).toBe("/platform/tenants"));
  it.each(["COMPANY_ADMIN", "EMPLOYEE"])(
    "routes %s to the existing dashboard",
    (role) => expect(getRoleHome(role)).toBe("/dashboard"),
  );
});
