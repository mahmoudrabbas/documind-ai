// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { Permission } from "@/types/api/permissions.types";
import type { PermissionValue } from "@/types/api/permissions.types";

const state = vi.hoisted(() => ({
  auth: {
    status: "authenticated" as const,
    user: {
      id: "u1",
      name: "Platform Admin",
      email: "admin@example.com",
      role: "SUPER_ADMIN" as const,
    },
    tenant: { id: "t1", name: "Acme" },
  },
  permissions: {
    status: "ready" as const,
    can: vi.fn((permission: PermissionValue) => true),
  },
}));

vi.mock("@/providers/auth-provider", () => ({ useAuth: () => state.auth }));
vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => state.permissions,
}));

import SuperAdminHelpCenterPage from "./page";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.permissions.can.mockImplementation(() => true);
});

function renderPage(locale: "en" | "ar" = "en") {
  render(
    <I18nProvider initialLocale={locale}>
      <SuperAdminHelpCenterPage />
    </I18nProvider>,
  );
}

describe("SuperAdminHelpCenterPage", () => {
  it("renders the super admin help center sections", () => {
    renderPage("en");

    expect(screen.getByText("Super Admin")).toBeInTheDocument();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Customers / Companies")).toBeInTheDocument();
    expect(screen.getByText("System Health")).toBeInTheDocument();
    expect(screen.getByText("AI Configuration")).toBeInTheDocument();
    expect(screen.getByText("Security & Audit")).toBeInTheDocument();
  });

  it("renders Arabic copy and RTL layout", () => {
    renderPage("ar");

    expect(screen.getByText("المسؤول العام")).toBeInTheDocument();
    expect(screen.getByText("حالة النظام")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("does not fall back to the company admin badge", () => {
    renderPage("en");

    expect(screen.queryByText("Company Admin")).not.toBeInTheDocument();
  });
});
