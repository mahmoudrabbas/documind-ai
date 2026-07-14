import { describe, expect, it } from "vitest";
import { PublicEnvironmentValidationError, resolvePublicApiUrl } from "./public-env";

describe("public environment validation", () => {
  it("permits a localhost default only outside production", () => {
    expect(resolvePublicApiUrl("development", undefined)).toBe("http://localhost:5000");
  });

  it("requires a non-local production API URL and reports only the key", () => {
    for (const value of [undefined, "http://localhost:5000", "not a URL"])
      expect(() => resolvePublicApiUrl("production", value)).toThrow(PublicEnvironmentValidationError);
  });

  it("accepts an HTTPS production API URL", () => {
    expect(resolvePublicApiUrl("production", "https://api.example.invalid/")).toBe("https://api.example.invalid");
  });
});
