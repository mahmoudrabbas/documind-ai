import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { formatSettingsError } from "./platform-settings-form";

describe("platform settings errors", () => {
  it("shows the safe API validation message and stable code", () => {
    const error = new ApiError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Support email must be a valid email address",
    });

    expect(formatSettingsError(error)).toBe(
      "Support email must be a valid email address (VALIDATION_ERROR)",
    );
  });

  it("uses a generic message for unknown failures", () => {
    expect(formatSettingsError(new Error("internal detail"))).toBe(
      "Unable to save settings.",
    );
  });
});
