// @vitest-environment jsdom
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const authState = vi.hoisted(() => ({
  role: "COMPANY_ADMIN" as "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE",
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { role: authState.role },
  }),
}));

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/providers/copilot-provider", () => ({
  useCopilot: () => ({
    open: false,
    setOpen: vi.fn(),
    startGuide: vi.fn(),
    guide: null,
  }),
}));

vi.mock("@/lib/copilot/guide-triggers", () => ({
  subscribeGuideTriggers: () => () => {},
  dismissGuideTrigger: vi.fn(),
}));

import { CopilotLauncher } from "./CopilotLauncher";

describe("CopilotLauncher role visibility", () => {
  it.each(["COMPANY_ADMIN", "EMPLOYEE"] as const)("renders for %s", (role) => {
    authState.role = role;
    render(<CopilotLauncher />);
    expect(
      screen.getByRole("button", { name: "copilot.launcher.label" }),
    ).toBeInTheDocument();
  });

  it("is absent for SUPER_ADMIN, including the floating suggestion surface", () => {
    authState.role = "SUPER_ADMIN";
    render(<CopilotLauncher />);
    expect(
      screen.queryByRole("button", { name: "copilot.launcher.label" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
