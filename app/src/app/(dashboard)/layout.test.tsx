// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/auth/app-navigation", () => ({
  AppNavigation: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) => (
    <aside data-testid="app-navigation" data-open={String(open)}>
      <button onClick={onClose}>close-nav</button>
    </aside>
  ),
}));

vi.mock("@/components/ui/TopNavBar", () => ({
  TopNavBar: ({
    onNavigationOpen,
  }: {
    onNavigationOpen: () => void;
  }) => (
    <header data-testid="topbar">
      <button onClick={onNavigationOpen}>open-nav</button>
    </header>
  ),
}));

vi.mock("@/components/auth/auth-guard", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => children,
}));

import DashboardLayout from "./layout";

describe("dashboard shell layout", () => {
  it("offsets content for the expanded sidebar only on desktop", () => {
    render(
      <DashboardLayout>
        <div data-testid="page-content">page</div>
      </DashboardLayout>,
    );

    const content = screen.getByTestId("topbar").parentElement;
    expect(content).not.toBeNull();
    expect(content!.className).toContain("md:ms-[72px]");
    expect(content!.className).toContain("xl:ms-[280px]");
    expect(content!.className).not.toContain("md:ms-[280px]");
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });

  it("keeps the shell free of horizontal overflow", () => {
    render(
      <DashboardLayout>
        <div data-testid="page-content">page</div>
      </DashboardLayout>,
    );

    const root = screen.getByTestId("app-navigation").parentElement;
    expect(root!.className).toContain("overflow-x-clip");
  });

  it("opens the mobile drawer from the topbar and closes it again", async () => {
    const user = userEvent.setup();
    render(
      <DashboardLayout>
        <div data-testid="page-content">page</div>
      </DashboardLayout>,
    );

    expect(screen.getByTestId("app-navigation")).toHaveAttribute(
      "data-open",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "open-nav" }));
    expect(screen.getByTestId("app-navigation")).toHaveAttribute(
      "data-open",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "close-nav" }));
    expect(screen.getByTestId("app-navigation")).toHaveAttribute(
      "data-open",
      "false",
    );
  });
});
