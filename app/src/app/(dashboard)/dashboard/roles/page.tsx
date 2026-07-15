"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  cloneRole,
  archiveRole,
} from "@/services/roles.service";
import { getPermissionCatalog } from "@/services/permissions.service";
import type { RoleView } from "@/types/api/users.types";
import type { PermissionGroup } from "@/types/api/permissions.types";
import { PermissionSelector } from "@/components/roles/PermissionSelector";
import { RoleDetailsPanel } from "@/components/roles/RoleDetailsPanel";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

type FormMode = "list" | "create" | "edit" | "details" | "clone";

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [mode, setMode] = useState<FormMode>("list");
  const [editingRole, setEditingRole] = useState<RoleView | null>(null);
  const [detailRole, setDetailRole] = useState<RoleView | null>(null);

  const [formName, setFormName] = useState("");
  const [formBaseRole, setFormBaseRole] = useState<"COMPANY_ADMIN" | "EMPLOYEE">("EMPLOYEE");
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [formSelfOnly, setFormSelfOnly] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [catalogGroups, setCatalogGroups] = useState<PermissionGroup[]>([]);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listRoles();
      setRoles(response.data.roles);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
    let cancelled = false;
    getPermissionCatalog()
      .then((res) => {
        if (!cancelled) setCatalogGroups(res.data.groups);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadRoles]);

  function openCreate() {
    setMode("create");
    setFormName("");
    setFormBaseRole("EMPLOYEE");
    setFormPermissions([]);
    setFormSelfOnly(false);
    setFormError(null);
  }

  function openEdit(role: RoleView) {
    setMode("edit");
    setEditingRole(role);
    setFormName(role.name);
    setFormBaseRole(role.baseRole);
    setFormPermissions([...(role.permissions ?? [])]);
    setFormSelfOnly(role.scopes?.selfOnly ?? false);
    setFormError(null);
  }

  function openClone(role: RoleView) {
    setMode("clone");
    setEditingRole(role);
    setFormName(`${role.name} (Copy)`);
    setFormBaseRole(role.baseRole);
    setFormPermissions([...(role.permissions ?? [])]);
    setFormSelfOnly(role.scopes?.selfOnly ?? false);
    setFormError(null);
  }

  function openDetails(role: RoleView) {
    setMode("details");
    setDetailRole(role);
  }

  function closeForm() {
    setMode("list");
    setEditingRole(null);
    setDetailRole(null);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!formName.trim()) {
      setFormError("Please enter a role name.");
      return;
    }
    setFormError(null);
    setFormSubmitting(true);
    setSuccessMessage(null);
    try {
      await createRole({
        name: formName.trim(),
        baseRole: formBaseRole,
        permissions: formPermissions,
        scopes: { selfOnly: formSelfOnly },
      });
      setSuccessMessage(`Role "${formName.trim()}" created successfully`);
      closeForm();
      void loadRoles();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create role");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingRole) return;
    setFormError(null);
    setFormSubmitting(true);
    setSuccessMessage(null);
    try {
      await updateRole(editingRole.id, {
        name: formName.trim() || undefined,
        baseRole: formBaseRole,
        permissions: formPermissions,
        scopes: { selfOnly: formSelfOnly },
      });
      setSuccessMessage(`Role "${formName.trim()}" updated successfully`);
      closeForm();
      void loadRoles();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to update role");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleClone(event: FormEvent) {
    event.preventDefault();
    if (!editingRole) return;
    setFormError(null);
    setFormSubmitting(true);
    setSuccessMessage(null);
    try {
      await cloneRole(editingRole.id, { name: formName.trim() });
      setSuccessMessage(`Role cloned successfully`);
      closeForm();
      void loadRoles();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to clone role");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleDelete(roleId: string) {
    setDeletingRoleId(roleId);
    setDeleteError(null);
    setSuccessMessage(null);
    try {
      await deleteRole(roleId);
      setSuccessMessage("Role deleted successfully");
      void loadRoles();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Failed to delete role");
    } finally {
      setDeletingRoleId(null);
    }
  }

  async function handleArchive(roleId: string) {
    setSuccessMessage(null);
    try {
      await archiveRole(roleId);
      setSuccessMessage("Role archived successfully");
      void loadRoles();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to archive role");
    }
  }

  const isFormActive = mode === "create" || mode === "edit" || mode === "clone";

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Custom Roles"
        description="Define roles with granular permissions to control what your team can access."
        actions={
          mode === "list" ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-label-md font-bold text-on-primary shadow-sm transition-all hover:bg-secondary-container hover:text-on-secondary-container"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Create Role
            </button>
          ) : (
            <button
              type="button"
              onClick={closeForm}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface px-6 py-2.5 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
              Close
            </button>
          )
        }
      />

      {successMessage && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {successMessage}
        </div>
      )}

      {isFormActive && (
        <DashboardPanel className="mb-6">
          <form
            onSubmit={(e) =>
              void (mode === "create"
                ? handleCreate(e)
                : mode === "edit"
                  ? handleEdit(e)
                  : handleClone(e))
            }
            className="space-y-4"
          >
            <div className="border-b border-outline-variant/30 pb-4">
              <h2 className="text-title-lg font-bold text-primary">
                {mode === "create"
                  ? "Create New Role"
                  : mode === "edit"
                    ? "Edit Role"
                    : "Clone Role"}
              </h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {mode === "clone"
                  ? `Cloning from "${editingRole?.name}". Rename and adjust permissions.`
                  : "Define the role name, base level, and granular permissions."}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-label-md font-bold text-on-surface-variant">
                    Role name
                  </label>
                  <input
                    className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. HR Manager, Billing Viewer"
                    maxLength={50}
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-label-md font-bold text-on-surface-variant">
                    Base permission level
                  </label>
                  <select
                    className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
                    value={formBaseRole}
                    onChange={(e) =>
                      setFormBaseRole(e.target.value as "COMPANY_ADMIN" | "EMPLOYEE")
                    }
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="COMPANY_ADMIN">Company Admin</option>
                  </select>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Base level provides default permissions. Additional permissions below extend these defaults.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFormSelfOnly(!formSelfOnly)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formSelfOnly ? "bg-primary" : "bg-outline-variant"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        formSelfOnly ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-on-surface">Self-only scope</p>
                    <p className="text-xs text-on-surface-variant">
                      Restrict document access to user&apos;s own uploads
                    </p>
                  </div>
                </div>

                {formPermissions.length > 0 && (
                  <div className="rounded-xl bg-primary/5 p-3 text-xs text-on-surface-variant">
                    <span className="font-bold text-primary">{formPermissions.length}</span> custom permission(s) selected
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-label-md font-bold text-on-surface-variant">
                  Permissions
                </label>
                <PermissionSelector
                  selected={formPermissions}
                  onChange={setFormPermissions}
                  disabled={formSubmitting}
                />
              </div>
            </div>

            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                {formError}
              </div>
            )}

            <div className="flex justify-end border-t border-outline-variant/30 pt-4">
              <button
                type="submit"
                disabled={formSubmitting || !formName.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-label-md font-bold text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {formSubmitting ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">save</span>
                )}
                {formSubmitting
                  ? "Saving..."
                  : mode === "create"
                    ? "Create Role"
                    : mode === "edit"
                      ? "Save Changes"
                      : "Clone Role"}
              </button>
            </div>
          </form>
        </DashboardPanel>
      )}

      {mode === "details" && detailRole && (
        <DashboardPanel className="mb-6">
          <RoleDetailsPanel role={detailRole} catalogGroups={catalogGroups} />
        </DashboardPanel>
      )}

      <DashboardPanel padding="none">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            Loading roles...
          </div>
        ) : error ? (
          <div className="p-4 sm:p-6">
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 border border-red-200">
              {error}
            </div>
          </div>
        ) : roles.length === 0 ? (
          <div className="p-6 text-center sm:p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low">
              <span className="material-symbols-outlined text-outline text-[32px]">
                shield_person
              </span>
            </div>
            <p className="mb-2 text-title-md font-bold text-on-surface">No custom roles yet</p>
            <p className="mx-auto max-w-sm text-body-sm text-on-surface-variant">
              Create your first custom role to define granular access for your team.
            </p>
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse divide-y divide-outline-variant/30 text-start text-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-lg py-4 text-left text-label-sm font-bold text-on-surface-variant uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-lg py-4 text-left text-label-sm font-bold text-on-surface-variant uppercase tracking-wider">
                    Level
                  </th>
                  <th className="px-lg py-4 text-left text-label-sm font-bold text-on-surface-variant uppercase tracking-wider">
                    Permissions
                  </th>
                  <th className="px-lg py-4 text-left text-label-sm font-bold text-on-surface-variant uppercase tracking-wider">
                    Users
                  </th>
                  <th className="px-lg py-4 text-left text-label-sm font-bold text-on-surface-variant uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-lg py-4 text-left text-label-sm font-bold text-on-surface-variant uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {roles.map((role) => (
                  <tr key={role.id} className="transition-colors hover:bg-surface-container-low/50">
                    <td className="px-lg py-4">
                      <button
                        type="button"
                        onClick={() => openDetails(role)}
                        className="font-bold text-on-surface hover:text-primary transition-colors"
                      >
                        {role.name}
                      </button>
                    </td>
                    <td className="px-lg py-4">
                      <span className="inline-flex items-center rounded-md bg-surface-container px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider border border-outline-variant/30 text-on-surface-variant">
                        {role.baseRole === "COMPANY_ADMIN" ? "Company Admin" : "Employee"}
                      </span>
                    </td>
                    <td className="px-lg py-4 text-on-surface-variant font-medium">
                      {role.permissions?.length ?? 0}
                    </td>
                    <td className="px-lg py-4 text-on-surface-variant font-medium">
                      {role.userCount}
                    </td>
                    <td className="px-lg py-4">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                          role.status === "archived"
                            ? "bg-error-container text-on-error-container"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {role.status === "archived" ? "Archived" : "Active"}
                      </span>
                    </td>
                    <td className="px-lg py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(role)}
                          className="inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openClone(role)}
                          className="inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors"
                        >
                          Clone
                        </button>
                        {role.status !== "archived" && (
                          <button
                            type="button"
                            onClick={() => void handleArchive(role.id)}
                            className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-surface px-3 py-1.5 text-xs font-bold text-amber-700 shadow-sm hover:bg-amber-50 transition-colors"
                          >
                            Archive
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={deletingRoleId === role.id}
                          onClick={() => {
                            if (window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) {
                              void handleDelete(role.id);
                            }
                          }}
                          className="inline-flex items-center justify-center rounded-md border border-error/30 bg-surface px-3 py-1.5 text-xs font-bold text-error shadow-sm hover:bg-error-container hover:text-on-error-container transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingRoleId === role.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                      {deleteError && deletingRoleId === role.id && (
                        <p className="mt-2 text-[11px] text-error">{deleteError}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardPanel>
    </DashboardPage>
  );
}
