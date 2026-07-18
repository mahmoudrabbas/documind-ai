import { describe, expect, it } from "vitest";
import { getSafeReturnTo } from "../safe-return-to";

describe("getSafeReturnTo", () => {
  it.each(["/dashboard", "/users", "/documents?page=2"])("accepts %s", (value) => expect(getSafeReturnTo(value)).toBe(value));
  it.each([
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "/forgot-password",
    "/login",
    "/register",
    "/resend-verification",
    "/reset-password",
    "/token-state",
  ])("rejects %s", (value) => expect(getSafeReturnTo(value)).toBeNull());
});
