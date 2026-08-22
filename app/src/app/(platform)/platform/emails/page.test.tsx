// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlatformEmailsPage from "./page";

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("platform email diagnostics", () => {
  it("does not expose a clickable action for an unavailable test-email feature", () => {
    render(<PlatformEmailsPage />);
    expect(screen.queryByRole("button", { name: /sendTest/i })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("superAdmin.platformEmails.notImplemented");
  });
});
