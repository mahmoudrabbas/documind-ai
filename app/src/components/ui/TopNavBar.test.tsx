// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: {
    user: {
      id: "user-1",
      name: "Admin",
      email: "admin@example.com",
      role: "COMPANY_ADMIN",
    },
    status: "authenticated",
    tenant: { id: "tenant-1", name: "Acme" },
    logout: vi.fn(),
  },
  permissions: {
    status: "ready",
    can: vi.fn(() => true),
    refreshPermissions: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => state.auth }));
vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => state.permissions,
}));
vi.mock("@/providers/tenant-provider", () => ({
  useTenantSettings: () => ({ status: "idle" }),
}));
vi.mock("@/providers/copilot-provider", () => ({
  useCopilot: () => ({ setOpen: vi.fn() }),
}));
vi.mock("@/components/ui/NotificationsBell", () => ({
  NotificationsBell: () => <span data-testid="notifications" />,
}));
vi.mock("@/components/ui/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <span data-testid="language-switcher" />,
}));
vi.mock("@/components/brand/DocuMindLogo", () => ({
  DocuMindLogo: () => <span data-testid="logo" />,
}));
vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({
    t: (key: string) => ({
      "shell.openNavigation": "Open navigation",
      "shell.settings": "Settings",
      "shell.helpCenter": "Help center",
      "shell.loggingOut": "Logging out",
      "shell.logout": "Logout",
      "shell.companyLogo": "Company logo",
      "shell.defaultUserName": "User",
      "shell.roleCompanyAdmin": "Company admin",
      "shell.roleSuperAdmin": "Super admin",
      "shell.roleUser": "Employee",
      "shell.searchPlaceholder": "Search",
      "nav.overview": "Overview",
      "nav.documents": "Documents",
      "nav.users": "Users",
    }[key] ?? key),
  }),
}));

import { TopNavBar } from "./TopNavBar";

beforeEach(() => {
  vi.clearAllMocks();
  state.auth.user.role = "COMPANY_ADMIN";
  state.permissions.status = "ready";
});

describe("company-admin top navigation", () => {
  it("leaves duplicate dashboard destinations and search in the sidebar only", () => {
    render(<TopNavBar onNavigationOpen={vi.fn()} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Documents" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.getByTestId("notifications")).toBeInTheDocument();
  });
});
