import { describe, expect, it } from "vitest";
import { getRoleHome } from "../role-home";

describe("getRoleHome", () => {
  it("routes super admins to the platform overview", () =>
    expect(getRoleHome("SUPER_ADMIN")).toBe("/super-admin"));
  it.each(["COMPANY_ADMIN", "EMPLOYEE"])(
    "routes %s to the existing dashboard",
    (role) => expect(getRoleHome(role)).toBe("/dashboard"),
  );
});
