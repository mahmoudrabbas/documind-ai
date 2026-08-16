// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes } from "react";

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  listRoles: vi.fn(),
  listTaxonomy: vi.fn(),
  inviteUserWithRole: vi.fn(),
  updateUser: vi.fn(),
  updateUserWithRole: vi.fn(),
  resendInvitation: vi.fn(),
  retryInvitationRoleAssignment: vi.fn(),
  revokeInvitation: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  apiClient: mocks.apiClient,
}));
vi.mock("@/services/roles.service", () => ({ listRoles: mocks.listRoles }));
vi.mock("@/services/document-policy.service", () => ({ listTaxonomy: mocks.listTaxonomy }));
vi.mock("@/services/users.service", () => ({
  inviteUserWithRole: mocks.inviteUserWithRole,
  updateUser: mocks.updateUser,
  updateUserWithRole: mocks.updateUserWithRole,
  resendInvitation: mocks.resendInvitation,
  retryInvitationRoleAssignment: mocks.retryInvitationRoleAssignment,
  revokeInvitation: mocks.revokeInvitation,
}));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "admin" } }) }));
vi.mock("@/providers/permission-provider", () => ({ usePermissions: () => ({ can: () => true, refreshPermissions: vi.fn() }) }));
vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ t: (key: string) => key, tPlural: (key: string) => key, dir: "ltr" }),
  useIntlLocale: () => "en-US",
}));
vi.mock("@/lib/i18n/code-label", () => ({ codeLabel: (_t: unknown, _namespace: string, value: string) => value }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/components/users/BulkImportModal", () => ({ BulkImportModal: () => null }));

import UsersPage from "./page";

const department = { id: "64a000000000000000000001", name: "HR", status: "active", description: null, version: 1, createdBy: "admin", updatedBy: "admin", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const user = { id: "user-1", tenantId: "tenant-1", name: "Employee HR", email: "hr@example.test", role: "EMPLOYEE", departmentId: department.id, departmentName: "HR", status: "active", emailVerified: true, createdAt: "2026-01-01T00:00:00.000Z" } as const;

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.listRoles.mockResolvedValue({ data: { roles: [] } });
  mocks.listTaxonomy.mockResolvedValue({ data: { departments: [department] } });
  mocks.apiClient.mockResolvedValue({ data: { users: [user], pagination: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 1 } } });
  mocks.inviteUserWithRole.mockResolvedValue({ status: "complete", user });
  mocks.updateUser.mockResolvedValue({ data: { user: { ...user, departmentId: null, departmentName: null } } });
});

describe("UsersPage", () => {
  it("loads departments, displays department names, and invites with departmentId", async () => {
    render(<UsersPage />);
    expect(await screen.findAllByText("HR")).not.toHaveLength(0);
    const departmentSelect = document.querySelector<HTMLSelectElement>('[data-guide-id="users-invite-form-department"]');
    expect(departmentSelect).not.toBeNull();
    fireEvent.change(departmentSelect!, { target: { value: department.id } });
    fireEvent.change(document.querySelector('[data-guide-id="users-invite-form-name"]')!, { target: { value: "New Employee" } });
    fireEvent.change(document.querySelector('[data-guide-id="users-invite-form-email"]')!, { target: { value: "new@example.test" } });
    fireEvent.submit(document.querySelector("#invite")!);
    await waitFor(() => expect(mocks.inviteUserWithRole).toHaveBeenCalledWith(expect.objectContaining({
      name: "New Employee",
      email: "new@example.test",
      role: "EMPLOYEE",
      departmentId: department.id,
    })));
  });

  it("opens a prefilled editor and sends a canonical department clear", async () => {
    render(<UsersPage />);
    const editButtons = await screen.findAllByText("dashboard.users.editUser");
    fireEvent.click(editButtons[0]!);
    const dialog = await screen.findByRole("dialog");
    const selects = dialog.querySelectorAll("select");
    expect(selects[0]?.value).toBe("EMPLOYEE");
    expect(selects[1]?.value).toBe(department.id);
    expect(selects[2]?.value).toBe("active");
    fireEvent.change(selects[1]!, { target: { value: "" } });
    expect(selects[1]?.value).toBe("");
    const save = screen.getByText("dashboard.users.saveChanges").closest("button")!;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith("user-1", { departmentId: null }));
  });

  it("shows taxonomy failures and prevents silent department assignment", async () => {
    mocks.listTaxonomy.mockRejectedValue(new Error("offline"));
    render(<UsersPage />);
    expect(await screen.findAllByText("dashboard.users.departmentLoadError")).not.toHaveLength(0);
    expect(document.querySelector<HTMLSelectElement>('[data-guide-id="users-invite-form-department"]')?.disabled).toBe(true);
  });
});
