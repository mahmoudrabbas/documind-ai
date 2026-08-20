// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Permission, type PermissionValue } from "@/types/api/permissions.types";
import { TENANT_SIDEBAR_LINKS, PLATFORM_SIDEBAR_LINKS } from "@/constants/routes";
import { I18nProvider } from "@/providers/i18n-provider";

const state = vi.hoisted(() => {
  const permissionSet = new Set<PermissionValue>();
  return {
    pathname: "/dashboard/documents",
    router: {
      replace: vi.fn(),
      push: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    },
    auth: {
      status: "authenticated",
      user: { id: "u1", name: "Admin", email: "admin@test.com", role: "COMPANY_ADMIN" },
      tenant: { id: "t1", name: "Acme" },
    },
    permissions: {
      status: "ready",
      permissions: permissionSet,
      grants: {},
      baseRole: "COMPANY_ADMIN" as string,
      customRoleId: null,
      customRoleState: "none",
      roleVersion: null,
      can: (permission: PermissionValue) => permissionSet.has(permission),
      refreshPermissions: vi.fn(),
    },
    tenantSettings: { status: "idle" },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => state.router,
}));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => state.auth }));
vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => state.permissions,
}));
vi.mock("@/providers/tenant-provider", () => ({
  useTenantSettings: () => state.tenantSettings,
}));
vi.mock("@/providers/copilot-provider", () => ({
  useCopilot: () => ({ setOpen: vi.fn() }),
}));

import { AppNavigation } from "./app-navigation";

function grantAllPermissions() {
  (Object.values(Permission) as PermissionValue[]).forEach((permission) =>
    state.permissions.permissions.add(permission),
  );
}

function grantOnly(...permissions: PermissionValue[]) {
  state.permissions.permissions.clear();
  permissions.forEach((permission) =>
    state.permissions.permissions.add(permission),
  );
}

function renderNav(open = false) {
  const onClose = vi.fn();
  render(
    <I18nProvider>
      <AppNavigation open={open} onClose={onClose} />
    </I18nProvider>,
  );
  return onClose;
}

function navHrefs(): string[] {
  const nav = screen.getByRole("navigation");
  return within(nav)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href") ?? "");
}

function primaryNavigation() {
  return screen.getByRole("complementary", { name: "Primary navigation" });
}

function helpCenterLink() {
  return within(primaryNavigation()).getByRole("link", {
    name: /Help Center/,
  });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.pathname = "/dashboard/documents";
  state.permissions.baseRole = "COMPANY_ADMIN";
  state.auth.user.role = "COMPANY_ADMIN";
  state.tenantSettings = { status: "idle" };
  state.permissions.status = "ready";
  state.permissions.refreshPermissions.mockReset();
  grantOnly();
});

describe("responsive navigation", () => {
  it("renders the full permission-filtered link set in expanded mode", () => {
    grantAllPermissions();
    renderNav();

    expect(navHrefs()).toEqual(TENANT_SIDEBAR_LINKS.map((link) => link.href));
  });

  it("keeps permission-hidden routes hidden", () => {
    grantOnly(Permission.DOCUMENTS_READ, Permission.CHAT_READ);
    renderNav();

    expect(navHrefs()).toEqual(["/dashboard/documents", "/dashboard/chat"]);
    expect(
      within(screen.getByRole("navigation")).queryByRole("link", {
        name: "Users",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows analytics destinations to an Employee with effective analytics permission", () => {
    state.auth.user.role = "EMPLOYEE";
    state.permissions.baseRole = "EMPLOYEE";
    grantOnly(Permission.ANALYTICS_READ, Permission.CHAT_READ);
    renderNav();

    expect(navHrefs()).toEqual([
      "/dashboard",
      "/dashboard/chat",
      "/dashboard/analytics",
    ]);
  });

  it("hides analytics destinations from an Employee without effective analytics permission", () => {
    state.auth.user.role = "EMPLOYEE";
    state.permissions.baseRole = "EMPLOYEE";
    grantOnly(Permission.CHAT_READ);
    renderNav();

    expect(navHrefs()).toEqual(["/dashboard/chat"]);
  });

  it("switches to platform navigation for super-admin", () => {
    grantAllPermissions();
    state.auth.user.role = "SUPER_ADMIN";
    state.permissions.baseRole = "SUPER_ADMIN";
    renderNav();

    const hrefs = navHrefs();
    expect(hrefs).toEqual(PLATFORM_SIDEBAR_LINKS.map((link) => link.href));
    expect(hrefs).toContain("/super-admin/companies");
    expect(hrefs).toContain("/super-admin/settings");
    expect(hrefs).toContain("/super-admin/audit");
    expect(hrefs.some((href) => href.startsWith("/dashboard"))).toBe(false);
  });

  it("marks the active route with aria-current", () => {
    grantAllPermissions();
    state.pathname = "/dashboard/settings/billing";
    renderNav();

    const nav = screen.getByRole("navigation");
    const active = within(nav).getByRole("link", { name: "Billing" });
    expect(active).toHaveAttribute("aria-current", "page");
    const inactive = within(nav).getByRole("link", { name: "Documents" });
    expect(inactive).not.toHaveAttribute("aria-current");
  });

  it("keeps every item present in rail mode instead of removing it", () => {
    grantAllPermissions();
    renderNav(false);
    const closedHrefs = navHrefs();
    cleanup();

    renderNav(true);
    const openHrefs = navHrefs();

    expect(openHrefs).toEqual(closedHrefs);
    expect(openHrefs).toEqual(TENANT_SIDEBAR_LINKS.map((link) => link.href));
  });

  it("uses responsive classes to collapse labels in the tablet rail", () => {
    grantAllPermissions();
    renderNav();

    const aside = primaryNavigation();
    expect(aside).toHaveClass("md:w-[72px]");
    expect(aside).toHaveClass("xl:w-[280px]");

    const nav = screen.getByRole("navigation");
    const firstLabel = within(nav)
      .getAllByRole("link")[0]
      .querySelector("span.truncate");
    expect(firstLabel).not.toBeNull();
    expect(firstLabel).toHaveClass("md:hidden");
    expect(firstLabel).toHaveClass("xl:inline");

    const firstLink = within(nav).getAllByRole("link")[0];
    expect(firstLink).toHaveClass("md:justify-center");
    expect(firstLink).toHaveClass("xl:justify-start");
  });

  it("renders both brand variants with rail/expanded visibility", () => {
    renderNav();

    const iconBrand = screen.getByTestId("app-nav-brand-icon");
    expect(iconBrand).toHaveClass("hidden");
    expect(iconBrand).toHaveClass("md:flex");
    expect(iconBrand).toHaveClass("xl:hidden");
    expect(
      screen.getByRole("img", { name: "DocuMind AI" }),
    ).toBeInTheDocument();

    const fullBrand = screen.getByTestId("app-nav-brand-full");
    expect(fullBrand).toHaveClass("md:hidden");
    expect(fullBrand).toHaveClass("xl:block");
    expect(screen.getAllByText(/DocuMind/).length).toBeGreaterThan(0);
  });

  it("renders Help Center as a real navigation link", () => {
    renderNav();

    const link = helpCenterLink();
    expect(link).toHaveAttribute("href", "/dashboard/help-center");
  });

  it("exposes accessible labels and tooltips for icon-only links", () => {
    grantAllPermissions();
    renderNav();

    const documentsLink = within(screen.getByRole("navigation")).getByRole(
      "link",
      { name: "Documents" },
    );
    expect(documentsLink).toHaveAttribute("title", "Documents");
    expect(documentsLink).toHaveAttribute("aria-label", "Documents");
  });

  it("shows a localized retry alert when permission loading fails", () => {
    state.permissions.status = "error";
    renderNav();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to verify access",
    );
    const retry = within(screen.getByRole("alert")).getByRole("button", {
      name: "Retry",
    });
    retry.click();
    expect(state.permissions.refreshPermissions).toHaveBeenCalledTimes(1);
  });

  it("marks Help Center active on its route", () => {
    grantAllPermissions();
    state.pathname = "/dashboard/help-center";
    renderNav();

    expect(helpCenterLink()).toHaveAttribute("aria-current", "page");
  });
});

describe("mobile drawer behavior", () => {
  it("shows a backdrop when open and hides it when closed", () => {
    renderNav(true);
    const backdrop = screen.getAllByRole("button", {
      name: "Close navigation",
    })[0];
    expect(backdrop).not.toHaveClass("pointer-events-none");
    cleanup();

    renderNav(false);
    const hiddenBackdrop = screen.getAllByRole("button", {
      name: "Close navigation",
    })[0];
    expect(hiddenBackdrop).toHaveClass("pointer-events-none");
  });

  it("closes when a navigation item is selected", async () => {
    grantAllPermissions();
    const onClose = renderNav(true);
    const documentsLink = within(screen.getByRole("navigation")).getByRole(
      "link",
      { name: "Documents" },
    );
    documentsLink.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const onClose = renderNav(true);
    const backdrop = screen.getAllByRole("button", {
      name: "Close navigation",
    })[0];
    backdrop.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when Escape is pressed and locks body scroll while open", () => {
    const onClose = renderNav(true);
    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores body scroll when unmounted", () => {
    const view = render(
      <I18nProvider>
        <AppNavigation open={true} onClose={vi.fn()} />
      </I18nProvider>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    act(() => view.unmount());
    expect(document.body.style.overflow).toBe("");
  });
});
