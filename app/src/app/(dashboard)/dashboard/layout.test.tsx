// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Permission } from "@/types/api/permissions.types";

const routeState = vi.hoisted(() => ({
  pathname: "/dashboard/settings/billing",
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => routeState.pathname,
  useRouter: () => routeState.router,
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated", user: { role: "COMPANY_ADMIN" } }),
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

function renderLayout(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  act(() => root.render(<TenantDashboardLayout><div>content</div></TenantDashboardLayout>));
  return container.querySelector("section")!;
}
