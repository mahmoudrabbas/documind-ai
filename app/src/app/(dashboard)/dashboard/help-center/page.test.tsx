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
      name: "Admin",
      email: "admin@example.com",
      role: "COMPANY_ADMIN" as "COMPANY_ADMIN" | "EMPLOYEE",
    },
    tenant: { id: "t1", name: "Acme" },
  },
  permissions: {
    status: "ready" as const,
    can: vi.fn((permission: PermissionValue) => false),
  },
}));

vi.mock("@/providers/auth-provider", () => ({ useAuth: () => state.auth }));
vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => state.permissions,
}));

import HelpCenterPage from "./page";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.auth.user.role = "COMPANY_ADMIN";
  state.permissions.can.mockImplementation((permission: PermissionValue) => false);
});

function renderPage(locale: "en" | "ar" = "en") {
  render(
    <I18nProvider initialLocale={locale}>
      <HelpCenterPage />
    </I18nProvider>,
  );
}

describe("HelpCenterPage", () => {
  it("renders the company admin help center sections", () => {
    state.permissions.can.mockImplementation((permission: PermissionValue) =>
      ([
        Permission.DOCUMENTS_READ,
        Permission.CHAT_READ,
        Permission.USERS_READ,
        Permission.ROLES_READ,
        Permission.KNOWLEDGE_GAPS_READ,
        Permission.BILLING_READ,
      ] as PermissionValue[]).includes(permission),
    );

    renderPage("en");

    expect(screen.getByText("Help Center")).toBeInTheDocument();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("AI Chat & Citations")).toBeInTheDocument();
    expect(screen.getByText("Users & Roles")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Gaps")).toBeInTheDocument();
    expect(screen.getByText("Usage & Billing")).toBeInTheDocument();
    expect(screen.getByText("Troubleshooting")).toBeInTheDocument();
    expect(screen.getByText("Security & Privacy")).toBeInTheDocument();
  });

  it("hides admin-only sections for an employee", () => {
    state.auth.user.role = "EMPLOYEE";
    state.permissions.can.mockImplementation((permission: PermissionValue) =>
      ([Permission.DOCUMENTS_READ, Permission.CHAT_READ] as PermissionValue[]).includes(permission),
    );

    renderPage("en");

    expect(screen.getByText("Help Center")).toBeInTheDocument();
    expect(screen.queryByText("Users & Roles")).not.toBeInTheDocument();
    expect(screen.queryByText("Knowledge Gaps")).not.toBeInTheDocument();
    expect(screen.queryByText("Usage & Billing")).not.toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("AI Chat & Citations")).toBeInTheDocument();
  });

  it("renders Arabic copy and RTL layout", () => {
    state.permissions.can.mockImplementation((permission: PermissionValue) =>
      ([
        Permission.DOCUMENTS_READ,
        Permission.CHAT_READ,
        Permission.USERS_READ,
        Permission.ROLES_READ,
        Permission.KNOWLEDGE_GAPS_READ,
        Permission.BILLING_READ,
      ] as PermissionValue[]).includes(permission),
    );

    renderPage("ar");

    expect(screen.getByText("مركز المساعدة")).toBeInTheDocument();
    expect(screen.getByText("المستخدمون والأدوار")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
  });
});
