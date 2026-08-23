import { describe, expect, it } from "vitest";
import { ACTION_CATALOG } from "@/lib/copilot/action-catalog";

describe("Copilot visible action catalog", () => {
  it("does not expose actions that are unavailable from the assistant UI", () => {
    const visibleTools = ACTION_CATALOG.map((entry) => entry.toolName);

    expect(visibleTools).not.toContain("user.list");
    expect(visibleTools).not.toContain("settings.update");
    expect(visibleTools).not.toContain("roles.create");
    expect(visibleTools).toContain("document.search");
    expect(visibleTools).toContain("user.invite");
  });
});
