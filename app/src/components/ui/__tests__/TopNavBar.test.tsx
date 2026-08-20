// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { Permission } from "@/types/api/permissions.types";

const state = vi.hoisted(() => ({
  auth: {
    status: "authenticated" as const,
    user: {
      id: "u1",
      name: "Admin User",
      email: "admin@example.com",
      role: "COMPANY_ADMIN" as const,
    },
    tenant: { id: "t1", name: "Acme" },
  },
  permissions: {
    status: "ready" as const,
    can: vi.fn((permission: string) => permission === Permission.COMPANY_SETTINGS_READ),
  },
  tenant: {
    status: "idle" as const,
  },
  router: {
    replace: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock("@/providers/auth-provider", () => ({ useAuth: () => state.auth }));
vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => state.permissions,
}));
vi.mock("@/providers/tenant-provider", () => ({
  useTenantSettings: () => state.tenant,
}));
vi.mock("./NotificationsBell", () => ({
  NotificationsBell: () => (
    <button type="button" aria-label="Notifications">
      Notifications
    </button>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => state.router,
}));

import { TopNavBar } from "../TopNavBar";

beforeEach(() => {
  vi.clearAllMocks();
  state.auth.user.role = "COMPANY_ADMIN";
  state.permissions.can.mockImplementation(
    (permission: string) => permission === Permission.COMPANY_SETTINGS_READ,
  );
});

describe("TopNavBar", () => {
  it("keeps the header free of duplicate dashboard navigation and search", async () => {
    render(
      <I18nProvider initialLocale="en">
        <TopNavBar onNavigationOpen={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.queryByPlaceholderText("Search knowledge base...")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Documents" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Language: English → العربية/i,
      }),
    ).toBeInTheDocument();
  });

  it("keeps the language switcher working inside the header", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider initialLocale="en">
        <TopNavBar onNavigationOpen={vi.fn()} />
      </I18nProvider>,
    );

    const languageButton = screen.getByRole("button", {
      name: /Language: English → العربية/i,
    });
    await user.click(languageButton);

    expect(
      screen.getByRole("button", {
        name: /اللغة: العربية → English/i,
      }),
    ).toBeInTheDocument();
  });

  it("keeps the user menu and settings entry available", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider initialLocale="en">
        <TopNavBar onNavigationOpen={vi.fn()} />
      </I18nProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: /Admin User/,
      }),
    );

    expect(screen.getByRole("menuitem", { name: /Settings/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Logout/ })).toBeInTheDocument();
  });
});
