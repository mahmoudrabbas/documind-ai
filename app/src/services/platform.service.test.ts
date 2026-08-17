import { describe, expect, it } from "vitest";
import { buildTenantListSearch, parseTenantListQuery } from "./platform.service";

describe("tenant list URL state", () => {
  it("parses supported combined filters", () => expect(parseTenantListQuery(new URLSearchParams("page=2&pageSize=50&search=acme&status=active&plan=pro"))).toEqual({ page: 2, pageSize: 50, search: "acme", status: "active", plan: "pro", packageId: "" }));
  it("parses a valid packageId filter", () => expect(parseTenantListQuery(new URLSearchParams("packageId=64b1c5f2e0a2b3c4d5e6f789"))).toMatchObject({ packageId: "64b1c5f2e0a2b3c4d5e6f789" }));
  it("rejects a malformed packageId filter", () => expect(parseTenantListQuery(new URLSearchParams("packageId=not-an-id"))).toMatchObject({ packageId: "" }));
  it.each(["page=0&pageSize=99&status=invalid&plan=bad", "page=-1", "page=nope", "page=999999999999999"])("safely defaults invalid values: %s", (value) => expect(parseTenantListQuery(new URLSearchParams(value))).toMatchObject({ page: 1, pageSize: 20, status: "", plan: "", packageId: "" }));
  it("trims and bounds search", () => {
    const value = `  ${"a".repeat(140)}  `;
    expect(parseTenantListQuery(new URLSearchParams({ search: value })).search).toHaveLength(120);
  });
  it("builds only the supported non-empty filters", () => expect(buildTenantListSearch({ page: 3, pageSize: 20, search: "acme & co", status: "active", plan: "free" })).toBe("page=3&pageSize=20&search=acme+%26+co&status=active&plan=free"));
  it("builds the packageId filter when set", () => expect(buildTenantListSearch({ page: 1, pageSize: 20, search: "", status: "", plan: "", packageId: "64b1c5f2e0a2b3c4d5e6f789" })).toBe("page=1&pageSize=20&packageId=64b1c5f2e0a2b3c4d5e6f789"));
  it("omits the packageId filter when empty", () => expect(buildTenantListSearch({ page: 1, pageSize: 20, search: "", status: "", plan: "", packageId: "" })).toBe("page=1&pageSize=20"));
});
