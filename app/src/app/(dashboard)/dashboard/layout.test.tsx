// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Permission } from "@/types/api/permissions.types";

const routeState = vi.hoisted(() => ({
  pathname: "/dashboard/settings/billing",
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() },
  auth: {
    status: "authenticated" as const,
    user: { role: "COMPANY_ADMIN" },
  },
  permissions: {
    status: "ready" as "loading" | "ready",
    held: new Set<string>(),
    baseRole: "COMPANY_ADMIN",
    customRoleId: null as string | null,
    grants: {} as Record<string, unknown>,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => routeState.pathname,
  useRouter: () => routeState.router,
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => routeState.auth,
}));
vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => ({
    ...routeState.permissions,
    can: (permission: string) => routeState.permissions.held.has(permission),
  }),
}));
vi.mock("@/components/auth/auth-guard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/auth/permission-boundary", () => ({
  PermissionBoundary: ({ permissions, children }: { permissions: readonly string[]; children: React.ReactNode }) => (
    <section data-permissions={permissions.join(",")}>{children}</section>
  ),
}));

import TenantDashboardLayout from "./layout";

const mounted: Array<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.container.remove();
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  routeState.pathname = "/dashboard/settings/billing";
  routeState.auth.user.role = "COMPANY_ADMIN";
  routeState.permissions.status = "ready";
  routeState.permissions.held.clear();
  routeState.permissions.baseRole = "COMPANY_ADMIN";
  routeState.permissions.customRoleId = null;
  routeState.permissions.grants = {};
});

describe("tenant dashboard billing route permission", () => {
  it("uses billing:read for the dedicated billing page", () => {
    routeState.pathname = "/dashboard/settings/billing";
    const section = renderLayout();
    expect(section.dataset.permissions).toBe(Permission.BILLING_READ);
  });

  it("preserves company-settings:read for other settings pages", () => {
    routeState.pathname = "/dashboard/settings/document-taxonomy";
    const section = renderLayout();
    expect(section.dataset.permissions).toBe(Permission.COMPANY_SETTINGS_READ);
  });
});

describe("AUTH-COR-005 — dashboard overview follows effective analytics permission", () => {
  it("allows an Employee whose custom role grants analytics:read", () => {
    routeState.pathname = "/dashboard";
    routeState.auth.user.role = "EMPLOYEE";
    routeState.permissions.baseRole = "EMPLOYEE";
    routeState.permissions.customRoleId = "custom-analytics-role";
    routeState.permissions.grants = {
      [Permission.ANALYTICS_READ]: { source: "custom-role", scope: null },
    };
    routeState.permissions.held.add(Permission.ANALYTICS_READ);

    const section = renderLayout();
    expect(section.dataset.permissions).toBe(Permission.ANALYTICS_READ);
    expect(routeState.router.replace).not.toHaveBeenCalled();
  });

  it("keeps the chat fallback for an Employee without analytics:read", () => {
    routeState.pathname = "/dashboard";
    routeState.auth.user.role = "EMPLOYEE";
    routeState.permissions.baseRole = "EMPLOYEE";

    renderLayout();
    expect(routeState.router.replace).toHaveBeenCalledWith("/dashboard/chat");
  });

  it("does not redirect while effective permissions are loading", () => {
    routeState.pathname = "/dashboard";
    routeState.auth.user.role = "EMPLOYEE";
    routeState.permissions.status = "loading";

    renderLayout();
    expect(routeState.router.replace).not.toHaveBeenCalled();
  });

  it.each(["COMPANY_ADMIN", "SUPER_ADMIN"])(
    "preserves dashboard access for %s with effective analytics permission",
    (role) => {
      routeState.pathname = "/dashboard";
      routeState.auth.user.role = role;
      routeState.permissions.baseRole = role;
      routeState.permissions.held.add(Permission.ANALYTICS_READ);

      renderLayout();
      expect(routeState.router.replace).not.toHaveBeenCalled();
    },
  );

  it("follows refreshed effective permissions after a role change", () => {
    routeState.pathname = "/dashboard";
    routeState.auth.user.role = "EMPLOYEE";
    routeState.permissions.baseRole = "EMPLOYEE";
    routeState.permissions.held.add(Permission.ANALYTICS_READ);
    const mountedLayout = mountLayout();
    expect(routeState.router.replace).not.toHaveBeenCalled();

    routeState.permissions.status = "loading";
    routeState.permissions.held.clear();
    act(() => mountedLayout.root.render(<TenantDashboardLayout><div>content</div></TenantDashboardLayout>));
    expect(routeState.router.replace).not.toHaveBeenCalled();

    routeState.permissions.status = "ready";
    act(() => mountedLayout.root.render(<TenantDashboardLayout><div>content</div></TenantDashboardLayout>));
    expect(routeState.router.replace).toHaveBeenCalledWith("/dashboard/chat");
  });
});

function renderLayout(): HTMLElement {
  return mountLayout().container.querySelector("section")!;
}

function mountLayout() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  act(() => root.render(<TenantDashboardLayout><div>content</div></TenantDashboardLayout>));
  return { container, root };
}
